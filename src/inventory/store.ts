import path from 'path';
import fs from 'fs-extra';
import type { DesiredUnit, InventoryFile, InventoryUnit } from './types';
import { hashConfig, unitIdForConfigPath } from './types';

const SKIP_BASENAMES = new Set([
  'catalog_index.json',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'README.md',
]);

/**
 * Resolve config root: --config-dir | GRID_CONFIG_ROOT | ./grid-config | sibling ../grid-config
 */
export function resolveConfigRoot(explicit?: string): string {
  if (explicit) return path.resolve(explicit);
  if (process.env.GRID_CONFIG_ROOT) return path.resolve(process.env.GRID_CONFIG_ROOT);

  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'grid-config'),
    path.resolve(cwd, '../grid-config'),
    path.resolve(cwd, '../../grid-config'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.join(cwd, 'grid-config');
}

export function inventoryPath(configRoot: string): string {
  return path.join(configRoot, '.grid', 'inventory.json');
}

export function workspaceDirFor(configRoot: string, configPath: string): string {
  const id = unitIdForConfigPath(toPosix(configPath));
  return path.join(configRoot, '.grid', 'workspaces', id);
}

export async function loadInventory(configRoot: string): Promise<InventoryFile> {
  const file = inventoryPath(configRoot);
  if (!(await fs.pathExists(file))) {
    return {
      version: 1,
      configRoot,
      updatedAt: new Date().toISOString(),
      units: [],
    };
  }
  const raw = (await fs.readJSON(file)) as InventoryFile;
  return {
    version: 1,
    configRoot,
    updatedAt: raw.updatedAt || new Date().toISOString(),
    units: Array.isArray(raw.units) ? raw.units : [],
  };
}

export async function saveInventory(inv: InventoryFile): Promise<void> {
  const file = inventoryPath(inv.configRoot);
  await fs.ensureDir(path.dirname(file));
  // Keep local CLI state out of Git
  const gi = path.join(inv.configRoot, '.grid', '.gitignore');
  if (!(await fs.pathExists(gi))) {
    await fs.writeFile(gi, '*\n!.gitignore\n');
  }
  inv.updatedAt = new Date().toISOString();
  await fs.writeJSON(file, inv, { spaces: 2 });
}

export async function upsertAppliedUnit(
  configRoot: string,
  desired: DesiredUnit,
  workspaceDir: string
): Promise<InventoryUnit> {
  const inv = await loadInventory(configRoot);
  const id = unitIdForConfigPath(desired.configPath);
  const next: InventoryUnit = {
    id,
    configPath: desired.configPath,
    workspaceDir,
    contentHash: desired.contentHash,
    name: desired.name,
    provider: desired.provider,
    environment: desired.environment,
    lastAppliedAt: new Date().toISOString(),
    status: 'applied',
  };
  const idx = inv.units.findIndex((u) => u.id === id || u.configPath === desired.configPath);
  if (idx >= 0) inv.units[idx] = next;
  else inv.units.push(next);
  await saveInventory(inv);
  return next;
}

export async function removeInventoryUnit(
  configRoot: string,
  configPathOrId: string
): Promise<InventoryUnit | undefined> {
  const inv = await loadInventory(configRoot);
  const idx = inv.units.findIndex(
    (u) => u.id === configPathOrId || u.configPath === toPosix(configPathOrId)
  );
  if (idx < 0) return undefined;
  const [removed] = inv.units.splice(idx, 1);
  await saveInventory(inv);
  return removed;
}

export async function discoverDesiredUnits(configRoot: string): Promise<DesiredUnit[]> {
  const found: DesiredUnit[] = [];

  async function walk(dir: string) {
    if (!(await fs.pathExists(dir))) return;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name === '.grid' || ent.name === '.git' || ent.name === 'node_modules' || ent.name === 'scripts') {
        continue;
      }
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (!ent.isFile() || !ent.name.endsWith('.json')) continue;
      if (SKIP_BASENAMES.has(ent.name.toLowerCase())) continue;
      if (ent.name === 'CATALOG_INDEX.json') continue;

      let config: Record<string, unknown>;
      try {
        config = await fs.readJSON(abs);
      } catch {
        continue;
      }
      // Must look like a Grid config (provider + resources)
      if (typeof config.provider !== 'string' || !Array.isArray(config.resources)) {
        continue;
      }

      const configPath = toPosix(path.relative(configRoot, abs));
      const meta = config.metadata as { name?: string; environment?: string } | undefined;
      found.push({
        configPath,
        absPath: abs,
        contentHash: hashConfig(config),
        name: meta?.name || path.basename(ent.name, '.json'),
        provider: String(config.provider),
        environment: meta?.environment || guessEnvFromPath(configPath),
        config,
      });
    }
  }

  await walk(configRoot);
  return found.sort((a, b) => a.configPath.localeCompare(b.configPath));
}

export function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

/** Walk up from a config file to find grid-config root (.grid/inventory or folder name). */
export function inferConfigRootFromPath(configPath: string): string | undefined {
  let dir = path.dirname(path.resolve(configPath));
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, '.grid', 'inventory.json'))) return dir;
    if (path.basename(dir) === 'grid-config') return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

function guessEnvFromPath(configPath: string): string {
  const parts = configPath.split('/');
  for (const p of parts) {
    if (['development', 'staging', 'production', 'sandbox'].includes(p)) return p;
  }
  return 'development';
}
