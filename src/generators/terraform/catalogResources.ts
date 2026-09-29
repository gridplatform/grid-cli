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

/**
 * Catalog renderer — **one path for every cloud**.
 *
 * Each resource type in resourceCatalog.ts becomes a `module` block (unless
 * foldInto says it belongs inside a parent module). Optional inputMap / omitInputs
 * / foldInto live on the catalog entry so AWS, GCP, Azure, … stay uniform.
 *
 * Complexity: O(R + F) for R resources and F folded children (maps, not nested scans).
 */

export interface CatalogRenderDefaults {
  project: string;
  region: string;
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

  // Every folded child must have its parent present as a top-level (non-folded) resource.
  const topLevelKeys = new Set(
    resources.filter((r) => !foldedAway.has(r)).map((r) => parentKey(r.type, r.name))
  );
  for (const [key, kids] of childrenByParent) {
    if (topLevelKeys.has(key)) continue;
    const names = kids.map((k) => `"${k.name}"`).join(', ');
    throw new Error(
      `Cannot fold ${names} into missing parent ${key}. ` +
        `Add that ${key.split(':')[0]} resource to this config (or via metadata.dependsOn).`
    );
  }

  const blocks = resources
    .filter((r) => !foldedAway.has(r))
    .map((resource) => {
      const kids = childrenByParent.get(parentKey(resource.type, resource.name)) ?? [];
      return renderCatalogResource(provider, resource, defaults, kids);
    })
    .filter((block) => block.trim().length > 0);

  if (blocks.length === 0) {
    throw new Error(
      'No Terraform modules were generated. Check resource types and catalog foldInto parents.'
    );
  }

  return blocks.join('\n\n');
}

export function renderCatalogResource(
  provider: ProviderId,
  resource: Resource,
  defaults: CatalogRenderDefaults,
  foldedChildren: Resource[] = []
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

  for (const [key, value] of Object.entries(resource)) {
    if (META_KEYS.has(key) || omit.has(key) || value === undefined) continue;
    const dest = entry.inputMap?.[key] ?? key;
    // Grid JSON may carry docs fields (e.g. description) that only some modules accept.
    // When we know the module's variables.tf, skip anything undeclared.
    if (declared !== null && !declared.has(dest)) continue;
    variables[dest] = toHclValue(value);
  }

  if (!omit.has('name')) {
    const nameVar = entry.inputMap?.name ?? 'name';
    if (variables[nameVar] === undefined && (declared === null || declared.has(nameVar))) {
      variables[nameVar] = resource.name;
    }
  }

  applyFoldedChildren(variables, foldedChildren, provider, defaults);

  if (wants(declared, 'project_id', variables)) {
    variables.project_id = defaults.project;
  }
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

  return renderModuleCall(moduleLabel(resource), variables);
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
    // Module may still copy; Terraform will report missing vars at plan time.
    return null;
  }
  const names = new Set<string>();
  for (const match of contents.matchAll(/^\s*variable\s+"([^"]+)"/gm)) {
    names.add(match[1]);
  }
  return names;
}
