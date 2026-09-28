import path from 'path';
import fs from 'fs-extra';
import type { GenericResource } from '../../validators/config';
import type { ProviderId } from '../../providers/types';
import { HclValue, renderModuleCall } from './hcl';
import { ModuleCopySpec, resolveModuleBankRoot } from './moduleBank';
import { ResourceCatalogEntry, lookupCatalogEntry } from './resourceCatalog';

/**
 * Generic catalog path: any resource type with a module in the Grid module bank
 * becomes a `module` block, with the resource's config keys forwarded as
 * Terraform variables. Types that have a dedicated composer (vpc / subnet / vm)
 * are handled by the provider adapters instead.
 */

/** Values generate knows about that a module may declare but the request omitted. */
export interface CatalogRenderDefaults {
  /** grid.json `project` — the GCP project ID for that provider. */
  project: string;
  region: string;
}

/** Resource keys that describe the Grid resource, not the module's inputs. */
const RESERVED_KEYS = new Set(['type', 'name', 'description']);

export function moduleSpecsFromResources(
  provider: ProviderId,
  resources: GenericResource[]
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
  resources: GenericResource[],
  defaults: CatalogRenderDefaults
): string {
  return resources
    .map((resource) => renderCatalogResource(provider, resource, defaults))
    .join('\n\n');
}

export function renderCatalogResource(
  provider: ProviderId,
  resource: GenericResource,
  defaults: CatalogRenderDefaults
): string {
  const entry = requireCatalogEntry(provider, resource.type);
  const declared = moduleVariableNames(entry.modulePath);

  const variables: Record<string, HclValue> = {
    source: `./modules/${entry.modulePath}`,
  };

  for (const [key, value] of Object.entries(resource)) {
    if (RESERVED_KEYS.has(key) || value === undefined) continue;
    variables[key] = toHclValue(value);
  }

  // Fill in what the module asks for and the request left out.
  if (wants(declared, 'name', variables)) {
    variables.name = resource.name;
  }
  if (provider === 'gcp' && wants(declared, 'project_id', variables)) {
    variables.project_id = defaults.project;
  }
  if (wants(declared, 'region', variables)) {
    variables.region = defaults.region;
  }
  if (provider === 'azure' && wants(declared, 'location', variables)) {
    variables.location = defaults.region;
  }

  return renderModuleCall(moduleLabel(resource), variables);
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

/** Terraform module labels allow letters, digits, underscores and dashes. */
function moduleLabel(resource: GenericResource): string {
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

/** JSON config values map 1:1 onto HCL scalars, lists and maps. */
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

/**
 * Read the variable names a bank module declares. Returns null when the module
 * has no readable variables.tf, in which case generate forwards the request's
 * keys verbatim and lets Terraform report any mismatch.
 */
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
