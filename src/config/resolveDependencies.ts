import path from 'path';
import fs from 'fs-extra';
import type { GridConfig, Resource } from '../validators/config';
import { validateConfig } from '../validators/config';
import { inferConfigRootFromPath, resolveConfigRoot, toPosix } from '../inventory/store';

export interface ResolvedGridConfig {
  config: GridConfig;
  /** Absolute path of the primary config file */
  configPath: string;
  /** Root used to resolve metadata.dependsOn */
  configRoot?: string;
  /** Dependency files that were merged in */
  mergedFrom: string[];
  warnings: string[];
}

/**
 * Load a Grid JSON and merge network resources from metadata.dependsOn
 * (paths relative to config root, e.g. "gcp/development/vpc/grid-development-vpc.json").
 *
 * Lets split vpc + vm files generate in one workspace so catalog foldInto
 * (subnet → vpc module) can see both sides of the graph.
 *
 * Complexity: O(D + R) for D dependency files and R merged resources (Sets for membership).
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
  const validation = validateConfig(primary);
  if (!validation.valid) {
    throw new Error(validation.errors?.join('\n') || 'Invalid configuration');
  }

  const configRoot =
    (options?.configDir ? resolveConfigRoot(options.configDir) : undefined) ||
    inferConfigRootFromPath(abs);

  const dependsOn = normalizeDependsOn(primary.metadata);
  if (dependsOn.length === 0) {
    return {
      config: primary,
      configPath: abs,
      configRoot,
      mergedFrom: [],
      warnings: [...(validation.warnings || [])],
    };
  }

  if (!configRoot) {
    return {
      config: primary,
      configPath: abs,
      mergedFrom: [],
      warnings: [
        ...(validation.warnings || []),
        'metadata.dependsOn is set but config root could not be inferred. ' +
          'Pass --config-dir so dependency JSON files can be loaded.',
      ],
    };
  }

  const rootResolved = path.resolve(configRoot);
  const mergedResources: Resource[] = [...primary.resources];
  const seenNames = new Set(primary.resources.map((r) => r.name));
  const mergedFrom: string[] = [];
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

    for (const r of dep.resources) {
      if (r.type !== 'vpc' && r.type !== 'subnet') continue;
      if (seenNames.has(r.name)) continue;
      mergedResources.push(r);
      seenNames.add(r.name);
    }
    mergedFrom.push(toPosix(path.relative(rootResolved, depAbs)));

    for (const n of normalizeDependsOn(dep.metadata)) {
      if (seenDeps.has(n)) continue;
      seenDeps.add(n);
      queued.push(n);
    }
  }

  const config: GridConfig = {
    ...primary,
    resources: mergedResources,
  };

  const post = validateConfig(config);
  if (!post.valid) {
    throw new Error(post.errors?.join('\n') || 'Invalid configuration after dependsOn merge');
  }

  const warnings = [...(post.warnings || [])];
  warnings.push(
    `Merged network resources from dependsOn: ${mergedFrom.join(', ')}. ` +
      `This unit's workspace will manage those network resources — do not also deploy the dependsOn VPC unit separately (duplicate ownership).`
  );

  return { config, configPath: abs, configRoot: rootResolved, mergedFrom, warnings };
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

/** Reject dependsOn paths that escape the config root (path traversal). */
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

/** Paths (relative to config root) listed in any unit's metadata.dependsOn. O(U). */
export function collectCoveredDependsOnPaths(
  units: Array<{ config: Record<string, unknown> }>
): Set<string> {
  const covered = new Set<string>();
  for (const u of units) {
    for (const dep of normalizeDependsOn(u.config.metadata)) {
      covered.add(dep);
    }
  }
  return covered;
}
