import path from 'path';
import fs from 'fs-extra';

/**
 * Resolve Grid's Terraform module bank (grid-terraform).
 *
 * Product rule: **grid-core** owns this path (`GRID_MODULE_BANK`) and injects it
 * when spawning the CLI. Standalone fallback: sibling ../grid-terraform.
 *
 * The bank is **read-only** for generate: we copy/link modules INTO archive/,
 * we never write Grid JSON changes back into the bank.
 */
export function resolveModuleBankRoot(): string {
  if (process.env.GRID_MODULE_BANK) {
    return path.resolve(process.env.GRID_MODULE_BANK);
  }

  // grid-cli: .../grid/grid-cli/src/generators/terraform  (tsx)
  //        or .../grid/grid-cli/dist/generators/terraform (built)
  // bank:     .../grid/grid-terraform
  return path.resolve(__dirname, '../../../../grid-terraform');
}

export interface ModuleCopySpec {
  /** Path under module bank, e.g. "aws/vpc" */
  bankPath: string;
  /** Destination under generated/modules, e.g. "aws/vpc" */
  destPath: string;
}

export type ModuleInstallMode = 'link' | 'copy';

/**
 * Install modules into the generate output.
 *
 * Default: **symlink** into grid-terraform (fast). Force full copy with
 * GRID_MODULE_COPY=1 when you need a self-contained workspace.
 *
 * Specs are installed in parallel.
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
