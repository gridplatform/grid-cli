import path from 'path';
import fs from 'fs-extra';
import type { GridConfig, Resource } from '../validators/config';
import { validateConfig } from '../validators/config';
import { inferConfigRootFromPath, resolveConfigRoot, toPosix } from '../inventory/store';
import { findProjectRoot } from '../project/marker';
import { ARCHIVE_DIR } from './artifacts';

/** One subnet declared in a dependsOn network unit (logical Grid name). */
export interface DependencySubnet {
  name: string;
  vpc: string;
  cidr?: string;
}

/** Network inventory extracted from a dependsOn unit (never merged into the leaf stack). */
export interface DependencyNetwork {
  vpcs: string[];
  subnets: DependencySubnet[];
}

/**
 * A desired-state unit this config points at via metadata.dependsOn.
 * Leaf stacks reference these units' Terraform state — they do not own/recreate them.
 */
export interface ResolvedDependency {
  /** Path relative to dependsRoot (project root), e.g. aws/development/vpc/….json */
  relPath: string;
  /** Absolute path to the dependency JSON */
  absPath: string;
  /** Absolute path to that unit's archive Terraform dir (local backend state lives here) */
  archiveDir: string;
  /** Safe Terraform identifier for data.terraform_remote_state.<id> */
  remoteStateId: string;
  config: GridConfig;
  network: DependencyNetwork;
}

export interface ResolvedGridConfig {
  config: GridConfig;
  /** Absolute path of the primary config file */
  configPath: string;
  /** Root used for archive / inventory (platform desired-state when --config-dir is set) */
  configRoot?: string;
  /** Root used to resolve metadata.dependsOn (project root when nested under projects/<slug>/) */
  dependsRoot?: string;
  /** Validated dependsOn units (reference-only — resources are NOT merged into config) */
  dependencies: ResolvedDependency[];
  /** @deprecated Always empty — kept so older call sites compiling against mergedFrom still typecheck */
  mergedFrom: string[];
  warnings: string[];
}

/**
 * Load a Grid JSON and resolve metadata.dependsOn as **references** to other units.
 *
 * Product rule: VPC/subnet (and any dependency unit) stay in their own workspace.
 * Consumers (VM, SG, EKS, …) point at them by logical name; generate wires
 * terraform_remote_state — it never copies dependency resources into the leaf stack.
 */
export async function loadConfigWithDependencies(
  configPath: string,
  options?: { configDir?: string }
): Promise<ResolvedGridConfig> {
  const abs = path.resolve(configPath);
  if (!(await fs.pathExists(abs))) {
    throw new Error(`Configuration file not found: ${abs}`);
  }

  const primary = await readGridJson(abs);
  // Hard schema errors first (before dependsOn); soft cross-refs rechecked after deps load.
  const schemaCheck = validateConfig(primary);
  if (!schemaCheck.valid) {
    throw new Error(schemaCheck.errors?.join('\n') || 'Invalid configuration');
  }

  const platformRoot = options?.configDir
    ? resolveConfigRoot(options.configDir)
    : undefined;
  const projectRoot = findProjectRoot(path.dirname(abs));
  const dependsRoot =
    projectRoot || platformRoot || inferConfigRootFromPath(abs);
  const configRoot = platformRoot || projectRoot || inferConfigRootFromPath(abs);

  const dependsOn = normalizeDependsOn(primary.metadata);
  if (dependsOn.length === 0) {
    return {
      config: primary,
      configPath: abs,
      configRoot,
      dependsRoot,
      dependencies: [],
      mergedFrom: [],
      warnings: [...(schemaCheck.warnings || [])],
    };
  }

  if (!dependsRoot || !configRoot) {
    return {
      config: primary,
      configPath: abs,
      configRoot,
      dependsRoot,
      dependencies: [],
      mergedFrom: [],
      warnings: [
        ...(schemaCheck.warnings || []),
        'metadata.dependsOn is set but config root could not be inferred. ' +
          'Pass --config-dir so dependency JSON files can be resolved.',
      ],
    };
  }

  const rootResolved = path.resolve(dependsRoot);
  const platformResolved = path.resolve(configRoot);
  const dependencies: ResolvedDependency[] = [];
  const queued = [...dependsOn];
  const seenDeps = new Set(dependsOn);

  for (let i = 0; i < queued.length; i++) {
    const rel = queued[i];
    const depAbs = path.resolve(rootResolved, rel);
    assertInsideRoot(rootResolved, depAbs, rel);

    if (!(await fs.pathExists(depAbs))) {
      throw new Error(`dependsOn not found: ${rel} (resolved to ${depAbs})`);
    }

    const dep = await readGridJson(depAbs);
    const depValidation = validateConfig(dep);
    if (!depValidation.valid) {
      throw new Error(`Invalid dependency ${rel}: ${depValidation.errors?.join('; ')}`);
    }

    const unitRel = toPosix(path.relative(platformResolved, depAbs)).replace(/\.json$/i, '');
    const archiveDir = path.join(platformResolved, ARCHIVE_DIR, unitRel);

    dependencies.push({
      relPath: toPosix(path.relative(rootResolved, depAbs)),
      absPath: depAbs,
      archiveDir,
      remoteStateId: remoteStateIdFor(rel),
      config: dep,
      network: extractNetwork(dep.resources),
    });

    for (const n of normalizeDependsOn(dep.metadata)) {
      if (seenDeps.has(n)) continue;
      seenDeps.add(n);
      queued.push(n);
    }
  }

  const knownVpcs = new Set<string>();
  const knownSubnets = new Set<string>();
  for (const d of dependencies) {
    for (const v of d.network.vpcs) knownVpcs.add(v);
    for (const s of d.network.subnets) knownSubnets.add(s.name);
  }
  const soft = validateConfig(primary, { knownVpcs, knownSubnets });

  const warnings = [...(soft.warnings || [])];
  if (dependencies.length > 0) {
    warnings.push(
      `dependsOn (reference-only): ${dependencies.map((d) => d.relPath).join(', ')}. ` +
        `Those units keep their own Terraform workspaces; this unit will look up vpc/subnet (and similar) via remote state — it will not recreate them.`
    );
  }

  return {
    config: primary,
    configPath: abs,
    configRoot: platformResolved,
    dependsRoot: rootResolved,
    dependencies,
    mergedFrom: [],
    warnings,
  };
}

function extractNetwork(resources: Resource[]): DependencyNetwork {
  const vpcs: string[] = [];
  const subnets: DependencySubnet[] = [];
  for (const r of resources) {
    if (r.type === 'vpc') vpcs.push(r.name);
    if (r.type === 'subnet') {
      subnets.push({
        name: r.name,
        vpc: String((r as { vpc?: unknown }).vpc ?? ''),
        cidr:
          typeof (r as { cidr?: unknown }).cidr === 'string'
            ? String((r as { cidr: string }).cidr)
            : undefined,
      });
    }
  }
  return { vpcs, subnets };
}

function remoteStateIdFor(rel: string): string {
  const base = toPosix(rel)
    .replace(/\.json$/i, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  const id = `dep_${base || 'unit'}`.slice(0, 60);
  return /^[a-zA-Z_]/.test(id) ? id : `dep_${id}`;
}

async function readGridJson(absPath: string): Promise<GridConfig> {
  try {
    return (await fs.readJSON(absPath)) as GridConfig;
  } catch (error) {
    throw new Error(
      `Failed to read configuration ${absPath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function assertInsideRoot(root: string, absPath: string, rel: string): void {
  const relative = path.relative(root, absPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`dependsOn escapes config root: ${rel}`);
  }
}

function normalizeDependsOn(metadata: GridConfig['metadata'] | unknown): string[] {
  if (!metadata || typeof metadata !== 'object') return [];
  const raw = (metadata as { dependsOn?: unknown }).dependsOn;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string' && x.length > 0).map(toPosix);
}

/**
 * @deprecated Leaf stacks no longer "cover" / own dependency units.
 * Kept as an empty set so older reconcile callers skip nothing.
 */
export function collectCoveredDependsOnPaths(
  _units: Array<{ config: Record<string, unknown> }>
): Set<string> {
  return new Set();
}
