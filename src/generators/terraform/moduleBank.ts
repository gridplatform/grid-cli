import path from 'path';
import fs from 'fs-extra';

/**
 * Resolve the Terraform module bank (grid-terraform).
 *
 * Prefer `GRID_MODULE_BANK` (injected by grid-core on real installs); otherwise
 * sibling `../grid-terraform`. Generate only copies/links out of the bank.
 */
export function resolveModuleBankRoot(): string {
  if (process.env.GRID_MODULE_BANK) {
    return path.resolve(process.env.GRID_MODULE_BANK);
  }

  // From src/…/terraform or dist/…/terraform → ../../../../grid-terraform
  return path.resolve(__dirname, '../../../../grid-terraform');
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
  const bankRoot = resolveModuleBankRoot();
  if (!(await fs.pathExists(bankRoot))) {
    throw new Error(
      `Grid Terraform module bank not found at ${bankRoot}. ` +
        `Expected sibling repo grid-terraform, or set GRID_MODULE_BANK.`
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
        throw new Error(`Module not found in grid-terraform: ${src}`);
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
