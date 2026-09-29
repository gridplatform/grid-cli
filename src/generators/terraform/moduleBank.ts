import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import fs from 'fs-extra';

/**
 * Resolve the Terraform module bank (grid-terraform).
 *
 * Prefer `GRID_MODULE_BANK` (injected by grid-core). Value may be:
 * - a local filesystem path (legacy sibling checkout), or
 * - a git remote URL (https://… or git@…) — cloned into a local cache, then used as a path.
 *
 * Generate only copies/links out of the resolved local bank tree.
 */

function isGitRemote(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (/^git::/i.test(v)) return true;
  if (/^https?:\/\//i.test(v)) return true;
  if (/^git@[^:]+:/.test(v)) return true;
  if (v.endsWith('.git') && !path.isAbsolute(v) && !v.startsWith('.')) return true;
  return false;
}

function normalizeRemoteUrl(raw: string): string {
  return raw.trim().replace(/^git::/i, '');
}

function runGit(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, env: process.env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => {
      stdout += c.toString();
    });
    child.stderr.on('data', (c) => {
      stderr += c.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

/** Cache dir for a remote GRID_MODULE_BANK URL. */
export function moduleBankCacheDir(_remoteUrl: string): string {
  if (process.env.GRID_MODULE_BANK_CACHE) {
    return path.resolve(process.env.GRID_MODULE_BANK_CACHE);
  }
  if (process.env.GRID_DATA_DIR) {
    return path.join(path.resolve(process.env.GRID_DATA_DIR), 'module-bank');
  }
  return path.join(os.homedir(), '.grid', 'module-bank');
}

export function moduleBankRef(): string {
  return (
    process.env.GRID_MODULE_BANK_REF ||
    process.env.GRID_MODULE_BANK_BRANCH ||
    'main'
  );
}

/**
 * Sync resolve: local path only. Prefer `ensureModuleBankRoot()` when the bank
 * may be a remote URL.
 */
export function resolveModuleBankRoot(): string {
  if (process.env.GRID_MODULE_BANK) {
    const raw = process.env.GRID_MODULE_BANK.trim();
    if (isGitRemote(raw)) {
      return moduleBankCacheDir(raw);
    }
    return path.resolve(raw);
  }

  // From src/…/terraform or dist/…/terraform → ../../../../grid-terraform
  return path.resolve(__dirname, '../../../../grid-terraform');
}

/**
 * Ensure the module bank is available locally.
 *
 * Remote URLs: clone once into the cache dir. Do **not** pull on every generate —
 * Core (or GRID_MODULE_BANK_PULL=1) owns refresh so VM/PVC installs stay fast.
 */
export async function ensureModuleBankRoot(): Promise<string> {
  const raw = (process.env.GRID_MODULE_BANK || '').trim();
  if (!raw || !isGitRemote(raw)) {
    const root = resolveModuleBankRoot();
    if (!(await fs.pathExists(root))) {
      throw new Error(
        `Grid Terraform module bank not found at ${root}. ` +
          `Set GRID_MODULE_BANK to a local path or git URL (e.g. https://github.com/gridplatform/grid-terraform.git).`
      );
    }
    return root;
  }

  const url = normalizeRemoteUrl(raw);
  const dest = moduleBankCacheDir(raw);
  const ref = moduleBankRef();
  await fs.ensureDir(path.dirname(dest));

  const allowPull =
    process.env.GRID_MODULE_BANK_PULL === '1' ||
    process.env.GRID_MODULE_BANK_PULL === 'true';

  const gitDir = path.join(dest, '.git');
  if (await fs.pathExists(gitDir)) {
    if (allowPull) {
      await runGit(['remote', 'set-url', 'origin', url], dest);
      const pull = await runGit(['pull', '--ff-only', 'origin', ref], dest);
      if (pull.code !== 0) {
        console.warn(
          `[grid] module-bank ff-only pull skipped (${pull.stderr || pull.stdout || 'diverged'}). Using cache at ${dest}`
        );
      }
    }
    return dest;
  }

  if (await fs.pathExists(dest)) {
    const entries = await fs.readdir(dest);
    if (entries.filter((e) => e !== '.DS_Store').length > 0) {
      return dest;
    }
  }

  await fs.ensureDir(dest);
  const clone = await runGit(
    ['clone', '--branch', ref, '--single-branch', '--depth', '1', url, '.'],
    dest
  );
  if (clone.code !== 0) {
    throw new Error(
      `Failed to clone module bank from ${url}: ${clone.stderr || clone.stdout}`
    );
  }
  return dest;
}

export interface ModuleCopySpec {
  /** Path under module bank, e.g. "aws/vpc" */
  bankPath: string;
  /** Relative path under the instance output modules/, e.g. "aws/vpc" */
  destPath: string;
}

export type ModuleInstallMode = 'link' | 'copy';

/**
 * Install bank modules into the instance output's modules/ directory.
 * Default is symlink (fast); set GRID_MODULE_COPY=1 for a full copy (archive/deploy).
 */
export async function copyModulesFromBank(
  outputModulesDir: string,
  specs: ModuleCopySpec[],
  options?: { mode?: ModuleInstallMode }
): Promise<{ installed: string[]; mode: ModuleInstallMode }> {
  const bankRoot = await ensureModuleBankRoot();
  if (!(await fs.pathExists(bankRoot))) {
    throw new Error(
      `Grid Terraform module bank not found at ${bankRoot}. ` +
        `Set GRID_MODULE_BANK to a local path or git URL.`
    );
  }

  const forceCopy =
    options?.mode === 'copy' ||
    process.env.GRID_MODULE_COPY === '1' ||
    process.env.GRID_MODULE_COPY === 'true';

  const results = await Promise.all(
    specs.map(async (spec) => {
      const src = path.resolve(bankRoot, spec.bankPath);
      const dest = path.join(outputModulesDir, spec.destPath);
      if (!(await fs.pathExists(src))) {
        throw new Error(`Module not found in module bank: ${src}`);
      }
      await fs.ensureDir(path.dirname(dest));
      await fs.remove(dest);

      if (!forceCopy) {
        try {
          await fs.symlink(src, dest, symlinkType());
          return { destPath: spec.destPath, linked: true };
        } catch {
          // Fall through to copy (e.g. no symlink permission on Windows).
        }
      }

      await fs.copy(src, dest, {
        filter: (p) => !p.includes(`${path.sep}node_modules`) && !p.endsWith('.DS_Store'),
        overwrite: true,
      });
      return { destPath: spec.destPath, linked: false };
    })
  );

  const mode: ModuleInstallMode =
    results.length > 0 && results.every((r) => r.linked) ? 'link' : 'copy';

  return { installed: results.map((r) => r.destPath), mode };
}

function symlinkType(): 'dir' | 'junction' {
  return process.platform === 'win32' ? 'junction' : 'dir';
}
