import path from 'path';
import fs from 'fs-extra';
import {
  CANONICAL_ENVIRONMENTS,
  EPHEMERAL_DIR,
  type CanonicalEnvironment,
  ephemeralCloneDirName,
} from './environments';

/** Written by `grid init` — marks a customer desired-state root. */
export const PROJECT_FILE = path.join('.grid', 'project.json');

export const ENV_FOLDERS = CANONICAL_ENVIRONMENTS;

export interface GridProjectMarker {
  version: 1;
  kind: 'grid-desired-state';
  createdAt: string;
}

export interface CloneManifest {
  version: 1;
  kind: 'grid-env-clone';
  baseEnv: CanonicalEnvironment;
  slug: string;
  sourcePath: string;
  createdAt: string;
  expiresAt: string;
  ttl: string;
}

export async function writeProjectMarker(root: string): Promise<string> {
  const file = path.join(root, PROJECT_FILE);
  await fs.ensureDir(path.dirname(file));
  const body: GridProjectMarker = {
    version: 1,
    kind: 'grid-desired-state',
    createdAt: new Date().toISOString(),
  };
  await fs.writeJSON(file, body, { spaces: 2 });
  const gi = path.join(root, '.grid', '.gitignore');
  if (!(await fs.pathExists(gi))) {
    await fs.writeFile(gi, 'workspaces/\ninventory.json\n');
  }
  return file;
}

export function isGridProjectRoot(dir: string): boolean {
  return fs.existsSync(path.join(dir, PROJECT_FILE));
}

export function findProjectRoot(startDir: string = process.cwd()): string | undefined {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 12; i++) {
    if (isGridProjectRoot(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

export function cloneRootPath(
  configRoot: string,
  baseEnv: CanonicalEnvironment,
  slug: string
): string {
  return path.join(configRoot, EPHEMERAL_DIR, ephemeralCloneDirName(baseEnv, slug));
}

export async function readCloneManifest(cloneRoot: string): Promise<CloneManifest | null> {
  const file = path.join(cloneRoot, '.grid-clone.json');
  if (!(await fs.pathExists(file))) return null;
  return (await fs.readJSON(file)) as CloneManifest;
}

export function isCloneExpired(manifest: CloneManifest, now = new Date()): boolean {
  return now.getTime() > Date.parse(manifest.expiresAt);
}

export function parseTtlToMs(ttl: string): number {
  const m = /^(\d+)\s*(h|d|m)$/i.exec(ttl.trim());
  if (!m) {
    throw new Error(`Invalid --ttl "${ttl}". Use e.g. 2h, 24h, 7d`);
  }
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (unit === 'm') return n * 60_000;
  if (unit === 'h') return n * 3_600_000;
  return n * 86_400_000;
}

export function assertCanonicalEnv(name: string): CanonicalEnvironment {
  if (!(CANONICAL_ENVIRONMENTS as readonly string[]).includes(name)) {
    throw new Error(
      `Unknown environment "${name}". Canonical envs: ${CANONICAL_ENVIRONMENTS.join(', ')}. ` +
        `For an isolated copy: grid env clone development --name <slug> --ttl 24h`
    );
  }
  return name as CanonicalEnvironment;
}

export {
  CANONICAL_ENVIRONMENTS,
  EPHEMERAL_DIR,
  ephemeralCloneDirName,
} from './environments';
export type { CanonicalEnvironment } from './environments';
