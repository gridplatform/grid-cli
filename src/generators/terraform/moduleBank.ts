import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import fs from 'fs-extra';

/**
 * Resolve the Terraform module bank (grid-terraform).
 *
 * Prefer `GRID_MODULE_BANK` (injected by grid-core). Value may be:
 * - a local filesystem path (legacy sibling checkout), or
 * - a git remote URL (https://… or git@…).
 *
 * When the bank is a git URL, generated stacks reference modules via
 * `git::URL//path?ref=` (no ./modules vendor). A local cache is still used
 * only to introspect module variables at generate time.
 */

export function isGitRemote(value: string): boolean {
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

/** True when GRID_MODULE_BANK is configured as a git remote URL. */
export function moduleBankIsGitRemote(): boolean {
  const raw = (process.env.GRID_MODULE_BANK || '').trim();
  return Boolean(raw && isGitRemote(raw));
}

/**
 * How modules are attached to generated stacks:
 * - remote — Terraform `git::…//path?ref=` (no ./modules vendor) — default when bank is a git URL
 * - copy   — vendor a full copy under ./modules (air‑gapped / portable)
 * - link   — symlink ./modules to local bank (fast scratch)
 *
 * Override with GRID_MODULE_SOURCE=remote|copy|link.
 * Legacy: GRID_MODULE_COPY=1 forces copy.
 */
export type ModuleInstallMode = 'remote' | 'link' | 'copy';

export function resolveModuleInstallMode(
  explicit?: ModuleInstallMode | undefined
): ModuleInstallMode {
  if (explicit) return explicit;

  const fromEnv = (process.env.GRID_MODULE_SOURCE || '').trim().toLowerCase();
  if (fromEnv === 'remote' || fromEnv === 'copy' || fromEnv === 'link') {
    return fromEnv;
  }
  if (process.env.GRID_MODULE_COPY === '1' || process.env.GRID_MODULE_COPY === 'true') {
    return 'copy';
  }
  // Public / git module bank → reference remotely (MonkCI-style). No archive bloat.
  if (moduleBankIsGitRemote()) return 'remote';
  return 'link';
}

/**
 * Terraform module source for a bank-relative path (e.g. "aws/vpc").
 * Example: git::https://github.com/gridplatform/grid-terraform.git//aws/vpc?ref=main
 */
export function remoteModuleSource(modulePath: string): string {
  const raw = (process.env.GRID_MODULE_BANK || '').trim();
  if (!raw || !isGitRemote(raw)) {
    throw new Error(
      'GRID_MODULE_SOURCE=remote requires GRID_MODULE_BANK to be a git URL ' +
        '(e.g. https://github.com/gridplatform/grid-terraform.git).'
    );
  }
  const url = normalizeRemoteUrl(raw).replace(/\/+$/, '');
  const ref = moduleBankRef();
  const sub = modulePath.replace(/^\/+/, '').replace(/\\/g, '/');
  // terraform git source: git::https://host/repo.git//subdir?ref=tag
  // Keep ref literal (tags/branches); do not URI-encode — Terraform expects e.g. ref=v0.1.0
  return `git::${url}//${sub}?ref=${ref}`;
}

export function localModuleSource(modulePath: string): string {
  return `./modules/${modulePath.replace(/^\/+/, '').replace(/\\/g, '/')}`;
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

/**
 * Install bank modules into the instance output's modules/ directory.
 * Not used when mode is `remote` (sources point at the git module bank).
 */
export async function copyModulesFromBank(
  outputModulesDir: string,
  specs: ModuleCopySpec[],
  options?: { mode?: 'link' | 'copy' }
): Promise<{ installed: string[]; mode: 'link' | 'copy' }> {
  const bankRoot = await ensureModuleBankRoot();
  if (!(await fs.pathExists(bankRoot))) {
    throw new Error(
      `Grid Terraform module bank not found at ${bankRoot}. ` +
        `Set GRID_MODULE_BANK to a local path or git URL.`
    );
  }

  const forceCopy = options?.mode === 'copy';

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

  const mode: 'link' | 'copy' =
    results.length > 0 && results.every((r) => r.linked) ? 'link' : 'copy';

  return { installed: results.map((r) => r.destPath), mode };
}

function symlinkType(): 'dir' | 'junction' {
  return process.platform === 'win32' ? 'junction' : 'dir';
}
