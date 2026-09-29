import path from 'path';
import fs from 'fs-extra';
import type { Resource } from '../../validators/config';
import type { ProviderId } from '../../providers/types';
import { HclValue, renderModuleCall } from './hcl';
import { ModuleCopySpec, resolveModuleBankRoot } from './moduleBank';
import {
  CatalogFoldInto,
  ResourceCatalogEntry,
  lookupCatalogEntry,
} from './resourceCatalog';
import type { ResolvedDependency } from '../../config/resolveDependencies';
import { renderRemoteStateDataBlock } from './backend';

/**
 * Shared catalog → HCL renderer for every cloud.
 *
 * Each catalogued type becomes a `module` block unless `foldInto` places it on a
 * parent. inputMap / omitInputs / foldInto live on the catalog entry.
 *
 * Cross-unit network (vpc/subnet) is never merged from dependsOn — leaf stacks
 * bind logical names via terraform_remote_state to the dependency unit's archive.
 */

export interface CatalogRenderDefaults {
  project: string;
  region: string;
  /** Reference-only dependsOn units (remote state + name → id binding). */
  dependencies?: ResolvedDependency[];
}

const META_KEYS = new Set(['type']);

export function moduleSpecsFromResources(
  provider: ProviderId,
  resources: Resource[]
): ModuleCopySpec[] {
  const specs = new Map<string, ModuleCopySpec>();

  for (const resource of resources) {
    const entry = requireCatalogEntry(provider, resource.type);
    specs.set(entry.modulePath, { bankPath: entry.modulePath, destPath: entry.modulePath });
  }

  return [...specs.values()];
}

export function renderCatalogResources(
  provider: ProviderId,
  resources: Resource[],
  defaults: CatalogRenderDefaults
): string {
  if (resources.length === 0) {
    throw new Error('Configuration has no resources to generate');
  }

  const foldedAway = new Set<Resource>();
  const childrenByParent = new Map<string, Resource[]>();

  for (const resource of resources) {
    const entry = lookupCatalogEntry(provider, resource.type);
    if (!entry) {
      throw new Error(
        `Resource type "${resource.type}" has no module in the Grid module bank for provider "${provider}". ` +
          `Add it to the ${provider} catalog in resourceCatalog.ts with a modulePath.`
      );
    }
    if (!entry.foldInto) continue;

    const parentName = String(
      (resource as Record<string, unknown>)[entry.foldInto.parentKey] ?? ''
    ).trim();
    if (!parentName) {
      throw new Error(
        `Resource "${resource.name}" (${resource.type}) has foldInto.parentKey ` +
          `"${entry.foldInto.parentKey}" but that field is missing or empty`
      );
    }
    const key = parentKey(entry.foldInto.parentType, parentName);
    const list = childrenByParent.get(key) ?? [];
    list.push(resource);
    childrenByParent.set(key, list);
    foldedAway.add(resource);
  }

  // Folded children require their parent in **this** unit JSON (VPC unit owns subnets).
  // Cross-unit deps use remote state — never recreate the parent here.
  const topLevelKeys = new Set(
    resources.filter((r) => !foldedAway.has(r)).map((r) => parentKey(r.type, r.name))
  );
  const depNetwork = buildDependencyNetworkIndex(defaults.dependencies || []);
  for (const [key, kids] of childrenByParent) {
    if (topLevelKeys.has(key)) continue;
    const [parentType, parentName] = key.split(':');
    if (parentType === 'vpc' && depNetwork.vpcOwner.has(parentName)) {
      throw new Error(
        `Subnet(s) ${kids.map((k) => `"${k.name}"`).join(', ')} belong with VPC "${parentName}" ` +
          `in that VPC's own unit JSON — do not declare them again on a consumer unit. ` +
          `On the VM/SG unit, only reference subnet/vpc by name and list the VPC unit in metadata.dependsOn.`
      );
    }
    const names = kids.map((k) => `"${k.name}"`).join(', ');
    throw new Error(
      `Cannot fold ${names} into missing parent ${key}. ` +
        `Put the ${parentType} in the same unit JSON as its children, ` +
        `or reference a separate network unit via metadata.dependsOn.`
    );
  }

  const remoteBlocks = renderRemoteStateBlocks(defaults.dependencies || [], {
    provider,
    project: defaults.project,
    region: defaults.region,
  });

  const blocks = resources
    .filter((r) => !foldedAway.has(r))
    .map((resource) => {
      const kids = childrenByParent.get(parentKey(resource.type, resource.name)) ?? [];
      return renderCatalogResource(provider, resource, defaults, kids, resources);
    })
    .filter((block) => block.trim().length > 0);

  if (blocks.length === 0 && !remoteBlocks) {
    throw new Error(
      'No Terraform modules were generated. Check resource types and catalog foldInto parents.'
    );
  }

  return [remoteBlocks, ...blocks].filter(Boolean).join('\n\n');
}

/** Remote-state blocks for each dependsOn unit (local or GRID_TF_BACKEND). */
export function renderRemoteStateBlocks(
  dependencies: ResolvedDependency[],
  leaf: { provider: string; project: string; region: string }
): string {
  if (dependencies.length === 0) return '';
  const blocks: string[] = [
    '# Cross-unit references (metadata.dependsOn) — read-only remote state; do not recreate those resources here.',
  ];
  for (const dep of dependencies) {
    const statePath = path.join(dep.archiveDir, 'terraform.tfstate').replace(/\\/g, '/');
    blocks.push(
      renderRemoteStateDataBlock(
        dep.remoteStateId,
        dep.stateKeyRelPath || dep.relPath,
        {
          provider: leaf.provider as never,
          project: leaf.project,
          region: leaf.region,
        },
        statePath
      )
    );
  }
  return blocks.join('\n\n');
}

/**
 * Root outputs so dependents can bind via remote state.
 * VPC units export vpc_id + subnet_ids[grid-name].
 */
export function renderStackOutputs(provider: ProviderId, resources: Resource[]): string {
  const lines: string[] = ['# Stack outputs (for dependsOn consumers via terraform_remote_state)'];
  const foldedAway = new Set<Resource>();
  const childrenByParent = new Map<string, Resource[]>();

  for (const resource of resources) {
    const entry = lookupCatalogEntry(provider, resource.type);
    if (!entry?.foldInto) continue;
    const parentName = String(
      (resource as Record<string, unknown>)[entry.foldInto.parentKey] ?? ''
    ).trim();
    if (!parentName) continue;
    const key = parentKey(entry.foldInto.parentType, parentName);
    const list = childrenByParent.get(key) ?? [];
    list.push(resource);
    childrenByParent.set(key, list);
    foldedAway.add(resource);
  }

  let any = false;
  for (const resource of resources) {
    if (foldedAway.has(resource)) continue;
    if (resource.type !== 'vpc') continue;
    any = true;
    const mod = moduleLabel(resource);
    const kids = childrenByParent.get(parentKey('vpc', resource.name)) ?? [];
    lines.push(`output "vpc_id" {
  description = "VPC id for ${resource.name}"
  value       = module.${mod}.vpc_id
}`);
    lines.push(`output "public_subnet_ids" {
  description = "Public subnet ids for ${resource.name}"
  value       = module.${mod}.public_subnet_ids
}`);
    if (kids.length > 0) {
      const entries = kids
        .map((k, i) => `    "${k.name}" = module.${mod}.public_subnet_ids[${i}]`)
        .join('\n');
      lines.push(`output "subnet_ids" {
  description = "Map of Grid subnet resource name → subnet id"
  value = {
${entries}
  }
}`);
    }
  }

  if (!any) return '# Outputs\n';
  return `${lines.join('\n\n')}\n`;
}

export function renderCatalogResource(
  provider: ProviderId,
  resource: Resource,
  defaults: CatalogRenderDefaults,
  foldedChildren: Resource[] = [],
  stack: Resource[] = []
): string {
  const entry = requireCatalogEntry(provider, resource.type);
  if (entry.foldInto) {
    return '';
  }

  const declared = moduleVariableNames(entry.modulePath);
  const omit = new Set(entry.omitInputs ?? []);
  const variables: Record<string, HclValue> = {
    source: `./modules/${entry.modulePath}`,
  };

  if (wants(declared, 'name', variables)) {
    variables.name = resource.name;
  }
  if (wants(declared, 'project', variables)) {
    variables.project = defaults.project;
  }

  for (const [from, raw] of Object.entries(resource as Record<string, unknown>)) {
    if (META_KEYS.has(from) || from === 'name' || omit.has(from)) continue;
    const dest = entry.inputMap?.[from] ?? from;
    if (omit.has(dest)) continue;
    if (declared && !declared.has(dest) && dest !== 'tags') continue;
    if (raw === undefined) continue;
    variables[dest] = moduleInputValue(dest, raw);
  }

  applyFoldedChildren(variables, foldedChildren, provider, defaults);

  if (wants(declared, 'region', variables)) {
    variables.region = defaults.region;
  }
  if (wants(declared, 'location', variables)) {
    variables.location = defaults.region;
  }
  if (
    wants(declared, 'azs', variables) &&
    Array.isArray(variables.public_subnets) &&
    (variables.public_subnets as unknown[]).length > 0
  ) {
    const n = (variables.public_subnets as unknown[]).length;
    variables.azs = Array.from(
      { length: n },
      (_, i) => `${defaults.region}${String.fromCharCode(97 + i)}`
    );
  }

  bindStackRefs(provider, variables, stack.length > 0 ? stack : [resource], defaults.dependencies);

  return renderModuleCall(moduleLabel(resource), variables);
}

/** `tags: ["a","b"]` → `{ a = "true", b = "true" }`; everything else unchanged. */
function moduleInputValue(dest: string, value: unknown): HclValue {
  if (dest === 'tags' && Array.isArray(value) && value.every((v) => typeof v === 'string')) {
    return Object.fromEntries((value as string[]).map((t) => [t, 'true']));
  }
  return toHclValue(value);
}

type DepNetIndex = {
  vpcOwner: Map<string, ResolvedDependency>;
  subnetOwner: Map<string, ResolvedDependency>;
};

function buildDependencyNetworkIndex(dependencies: ResolvedDependency[]): DepNetIndex {
  const vpcOwner = new Map<string, ResolvedDependency>();
  const subnetOwner = new Map<string, ResolvedDependency>();
  for (const dep of dependencies) {
    for (const v of dep.network.vpcs) vpcOwner.set(v, dep);
    for (const s of dep.network.subnets) subnetOwner.set(s.name, dep);
  }
  return { vpcOwner, subnetOwner };
}

/**
 * Bind Grid resource names to Terraform expressions.
 * Same-stack → module outputs; dependsOn → remote_state outputs.
 * Real cloud ids (vpc-… / subnet-… / sg-…) pass through.
 */
function bindStackRefs(
  provider: ProviderId,
  variables: Record<string, HclValue>,
  stack: Resource[],
  dependencies?: ResolvedDependency[]
): void {
  if (provider !== 'aws') return;

  const byKey = new Map(stack.map((r) => [`${r.type}:${r.name}`, r]));
  const subnetsOf = new Map<string, Resource[]>();
  for (const r of stack) {
    if (r.type !== 'subnet') continue;
    const vpc = String((r as { vpc?: unknown }).vpc ?? '');
    if (!vpc) continue;
    const list = subnetsOf.get(vpc) ?? [];
    list.push(r);
    subnetsOf.set(vpc, list);
  }
  const depNet = buildDependencyNetworkIndex(dependencies || []);

  const subnet = variables.subnet_id;
  if (typeof subnet === 'string' && !subnet.startsWith('subnet-')) {
    const node = byKey.get(`subnet:${subnet}`);
    const vpc = node ? String((node as { vpc?: unknown }).vpc ?? '') : '';
    if (node && vpc && byKey.has(`vpc:${vpc}`)) {
      const idx = Math.max(0, (subnetsOf.get(vpc) ?? []).findIndex((s) => s.name === node.name));
      variables.subnet_id = {
        raw: `module.${moduleLabel({ type: 'vpc', name: vpc } as Resource)}.public_subnet_ids[${idx}]`,
      };
    } else {
      const owner = depNet.subnetOwner.get(subnet);
      if (owner) {
        variables.subnet_id = {
          raw: `data.terraform_remote_state.${owner.remoteStateId}.outputs.subnet_ids["${subnet}"]`,
        };
      }
    }
  }

  const vpcId = variables.vpc_id;
  if (typeof vpcId === 'string' && !vpcId.startsWith('vpc-')) {
    const vpc = byKey.get(`vpc:${vpcId}`);
    if (vpc) {
      variables.vpc_id = { raw: `module.${moduleLabel(vpc)}.vpc_id` };
    } else {
      const owner = depNet.vpcOwner.get(vpcId);
      if (owner) {
        variables.vpc_id = {
          raw: `data.terraform_remote_state.${owner.remoteStateId}.outputs.vpc_id`,
        };
      }
    }
  }

  const sgs = variables.vpc_security_group_ids;
  if (Array.isArray(sgs)) {
    variables.vpc_security_group_ids = sgs.map((id) => {
      if (typeof id !== 'string' || id.startsWith('sg-')) return id as HclValue;
      const sg = byKey.get(`security-group:${id}`);
      return sg ? { raw: `module.${moduleLabel(sg)}.security_group_id` } : id;
    });
  }
}

function applyFoldedChildren(
  variables: Record<string, HclValue>,
  children: Resource[],
  provider: ProviderId,
  defaults: CatalogRenderDefaults
): void {
  if (children.length === 0) return;

  const byVariable = new Map<string, { fold: CatalogFoldInto; kids: Resource[] }>();

  for (const child of children) {
    const entry = requireCatalogEntry(provider, child.type);
    const fold = entry.foldInto;
    if (!fold) continue;
    const bucket = byVariable.get(fold.variable) ?? { fold, kids: [] };
    bucket.kids.push(child);
    byVariable.set(fold.variable, bucket);
  }

  for (const [variable, { fold, kids }] of byVariable) {
    if (fold.listMode === 'string') {
      const field = fold.stringField ?? 'cidr';
      variables[variable] = kids.map((k) => {
        const v = (k as Record<string, unknown>)[field];
        if (v === undefined || v === null || v === '') {
          throw new Error(
            `Folded resource "${k.name}" is missing required field "${field}" for ${variable}`
          );
        }
        return toHclValue(v);
      });
      continue;
    }

    const itemMap = fold.itemMap ?? {};
    if (Object.keys(itemMap).length === 0) {
      throw new Error(
        `Catalog foldInto for variable "${variable}" uses listMode=object but has no itemMap`
      );
    }
    variables[variable] = kids.map((k) => {
      const obj: Record<string, HclValue> = {};
      for (const [from, to] of Object.entries(itemMap)) {
        let v = (k as Record<string, unknown>)[from];
        if (v === undefined && from === 'region') v = defaults.region;
        if (v === undefined) continue;
        obj[to] = toHclValue(v);
      }
      return obj;
    });
  }
}

function parentKey(type: string, name: string): string {
  return `${type}:${name}`;
}

function requireCatalogEntry(provider: ProviderId, type: string): ResourceCatalogEntry {
  const entry = lookupCatalogEntry(provider, type);
  if (!entry) {
    throw new Error(
      `Resource type "${type}" has no module in the Grid module bank for provider "${provider}". ` +
        `Add it to the ${provider} catalog in resourceCatalog.ts with a modulePath.`
    );
  }
  return entry;
}

function moduleLabel(resource: Resource): string {
  const name = sanitizeLabel(resource.name);
  const type = sanitizeLabel(resource.type);
  return name.endsWith(`_${type}`) ? name : `${name}_${type}`;
}

function sanitizeLabel(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_-]+/g, '_');
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `grid_${cleaned}`;
}

function wants(
  declared: Set<string> | null,
  variable: string,
  variables: Record<string, HclValue>
): boolean {
  return declared !== null && declared.has(variable) && variables[variable] === undefined;
}

function toHclValue(value: unknown): HclValue {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(toHclValue);
  if (typeof value === 'object') {
    const out: Record<string, HclValue> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[key] = toHclValue(v);
    }
    return out;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return String(value);
}

const variableNameCache = new Map<string, Set<string> | null>();

function moduleVariableNames(modulePath: string): Set<string> | null {
  const cached = variableNameCache.get(modulePath);
  if (cached !== undefined) return cached;
  const result = readModuleVariableNames(modulePath);
  variableNameCache.set(modulePath, result);
  return result;
}

function readModuleVariableNames(modulePath: string): Set<string> | null {
  const file = path.join(resolveModuleBankRoot(), modulePath, 'variables.tf');
  let contents: string;
  try {
    contents = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const names = new Set<string>();
  for (const match of contents.matchAll(/^\s*variable\s+"([^"]+)"/gm)) {
    names.add(match[1]);
  }
  return names;
}
