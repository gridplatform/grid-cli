import path from 'path';
import fs from 'fs-extra';

/**
 * Resolve Grid's Terraform module bank (grid-terraform).
 *
 * Product rule: Grid uses grid-terraform as source of truth — not a personal module repo.
 *
 * Override (local forks only): GRID_MODULE_BANK=/path/to/grid-terraform
 */
export function resolveModuleBankRoot(): string {
  if (process.env.GRID_MODULE_BANK) {
    return path.resolve(process.env.GRID_MODULE_BANK);
  }

  // grid-cli: .../grid/grid-cli/src/generators/terraform
  // bank:     .../grid/grid-terraform
  return path.resolve(__dirname, '../../../../grid-terraform');
}

export interface ModuleCopySpec {
  /** Path under module bank, e.g. "aws/vpc" */
  bankPath: string;
  /** Destination under generated/modules, e.g. "aws/vpc" */
  destPath: string;
}

/**
 * Copy selected standalone modules from grid-terraform into the generate output.
 */
export async function copyModulesFromBank(
  outputModulesDir: string,
  specs: ModuleCopySpec[]
): Promise<string[]> {
  const bankRoot = resolveModuleBankRoot();
  if (!(await fs.pathExists(bankRoot))) {
    throw new Error(
      `Grid Terraform module bank not found at ${bankRoot}. ` +
        `Expected sibling repo grid-terraform, or set GRID_MODULE_BANK.`
    );
  }

  const copied: string[] = [];
  for (const spec of specs) {
    const src = path.join(bankRoot, spec.bankPath);
    const dest = path.join(outputModulesDir, spec.destPath);
    if (!(await fs.pathExists(src))) {
      throw new Error(`Module not found in grid-terraform: ${src}`);
    }
    await fs.copy(src, dest, {
      filter: (p) => !p.includes('node_modules') && !p.endsWith('.DS_Store'),
    });
    copied.push(spec.destPath);
  }
  return copied;
}
