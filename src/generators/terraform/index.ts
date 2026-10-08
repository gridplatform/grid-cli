import path from 'path';
import fs from 'fs-extra';
import { GridConfig } from '../../validators/config';
import { generateBackend } from './backend';
import {
  moduleSpecsFromResources,
  renderCatalogResources,
  renderStackOutputs,
} from './catalogResources';
import {
  ModuleInstallMode,
  copyModulesFromBank,
  ensureModuleBankRoot,
  localModuleSource,
  remoteModuleSource,
  resolveModuleInstallMode,
} from './moduleBank';
import { bootstrapProviders } from '../../providers';
import { assertProviderCanGenerate } from '../../providers/registry';
import type { ResolvedDependency } from '../../config/resolveDependencies';

export interface GenerateOptions {
  outputDir: string;
  format: 'terraform' | 'opentofu';
  /**
   * How modules are referenced:
   * - remote: git:: bank URL (no ./modules) — default when GRID_MODULE_BANK is a git URL
   * - copy: vendor under ./modules
   * - link: symlink ./modules to local bank
   */
  moduleInstallMode?: ModuleInstallMode;
  /** Platform desired-state root (for dependsOn remote-state paths). */
  configRoot?: string;
  /**
   * Unit path relative to configRoot (with or without .json).
   * Drives unique remote state keys when GRID_TF_BACKEND is set.
   */
  unitRelPath?: string;
  /** Reference-only dependsOn units — never merged into this stack's resources. */
  dependencies?: ResolvedDependency[];
}

export interface GenerateResult {
  fileCount: number;
  files: string[];
  warnings?: string[];
  moduleInstallMode: ModuleInstallMode;
}

/**
 * Generate Terraform/OpenTofu from unit JSON into `outputDir`.
 *
 * Writes instance stack files (main.tf, provider.tf, …). For a desired-state repo
 * that is typically `<configRoot>/archive/…`.
 *
 * When the module bank is a git URL, modules are referenced remotely
 * (`git::…//aws/vpc?ref=…`) and are **not** copied into archive.
 */
export async function generateInfrastructure(
  config: GridConfig,
  options: GenerateOptions
): Promise<GenerateResult> {
  bootstrapProviders();
  const provider = assertProviderCanGenerate(config.provider);

  const warnings: string[] = [];
  const region = config.region || provider.defaultRegion;
  const dependencies = options.dependencies || [];
  const installMode = resolveModuleInstallMode(options.moduleInstallMode);

  // Local bank cache is still used to introspect module variables (.tf).
  // Remote mode does not vendor that tree into the output.
  const bankRoot = await ensureModuleBankRoot();
  warnings.push(`Module bank (read-only source): ${bankRoot}`);
  warnings.push(`Module source mode: ${installMode}`);

  const moduleSourceForPath =
    installMode === 'remote'
      ? (modulePath: string) => remoteModuleSource(modulePath)
      : (modulePath: string) => localModuleSource(modulePath);

  let resourceBlocks: string;
  try {
    resourceBlocks = renderCatalogResources(provider.id, config.resources, {
      project: config.project,
      region,
      dependencies,
      moduleSourceForPath,
    });
  } catch (error) {
    throw new Error(
      `Generate failed for provider "${provider.id}": ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error }
    );
  }

  const specs = dedupeSpecs(moduleSpecsFromResources(provider.id, config.resources));
  const outputsBody = renderStackOutputs(provider.id, config.resources);

  await fs.ensureDir(options.outputDir);
  const modulesTarget = path.join(options.outputDir, 'modules');

  const header =
    installMode === 'remote'
      ? `# Instance Terraform — regenerated from Grid JSON (do not treat as the module bank).
# Provider: ${provider.label} (${provider.id})
# Project: ${config.project}
# Modules: remote git sources from GRID_MODULE_BANK (not vendored into ./modules)
# Updated by: grid generate | plan | deploy

`
      : `# Instance Terraform — regenerated from Grid JSON (do not treat as the module bank).
# Provider: ${provider.label} (${provider.id})
# Project: ${config.project}
# Module bank (vendored into ./modules, bank itself is never modified): ${bankRoot}
# Updated by: grid generate | plan | deploy

`;

  const mainTfPath = path.join(options.outputDir, 'main.tf');
  const providerTfPath = path.join(options.outputDir, 'provider.tf');
  const backendTfPath = path.join(options.outputDir, 'backend.tf');
  const outputsTfPath = path.join(options.outputDir, 'outputs.tf');
  const variablesTfPath = path.join(options.outputDir, 'variables.tf');

  if (installMode === 'remote') {
    // Drop any previously vendored ./modules so archive stays thin.
    await fs.remove(modulesTarget);
    await Promise.all([
      fs.writeFile(mainTfPath, `${header}${resourceBlocks}\n`),
      fs.writeFile(providerTfPath, provider.renderProviderBlock(config)),
      fs.writeFile(backendTfPath, generateBackend(config, { unitRelPath: options.unitRelPath })),
      fs.writeFile(outputsTfPath, outputsBody),
      fs.writeFile(variablesTfPath, renderVariables(config, region)),
    ]);
    warnings.push(
      'Modules referenced via git:: from GRID_MODULE_BANK (nothing copied into ./modules).'
    );
    warnings.push(
      `Pin with GRID_MODULE_BANK_REF (current: ${process.env.GRID_MODULE_BANK_REF || process.env.GRID_MODULE_BANK_BRANCH || 'main'}).`
    );
  } else {
    await fs.emptyDir(modulesTarget);
    const [install] = await Promise.all([
      copyModulesFromBank(modulesTarget, specs, { mode: installMode }),
      fs.writeFile(mainTfPath, `${header}${resourceBlocks}\n`),
      fs.writeFile(providerTfPath, provider.renderProviderBlock(config)),
      fs.writeFile(backendTfPath, generateBackend(config, { unitRelPath: options.unitRelPath })),
      fs.writeFile(outputsTfPath, outputsBody),
      fs.writeFile(variablesTfPath, renderVariables(config, region)),
    ]);
    const verb = install.mode === 'link' ? 'Linked' : 'Vendored';
    warnings.push(
      `${verb} modules into ./modules from bank: ${install.installed.join(', ') || '(none)'}`
    );
  }

  warnings.push('Instance HCL (main.tf, …) was rewritten from JSON. Module bank was not modified.');
  if (dependencies.length > 0) {
    warnings.push(
      `Wired ${dependencies.length} dependsOn unit(s) via terraform_remote_state (reference only).`
    );
  }

  const files = [mainTfPath, providerTfPath, backendTfPath, outputsTfPath, variablesTfPath];

  return {
    fileCount: files.length,
    files,
    warnings,
    moduleInstallMode: installMode,
  };
}

function dedupeSpecs(
  specs: ReturnType<typeof moduleSpecsFromResources>
): ReturnType<typeof moduleSpecsFromResources> {
  const byDest = new Map<string, (typeof specs)[number]>();
  for (const spec of specs) {
    if (!byDest.has(spec.destPath)) byDest.set(spec.destPath, spec);
  }
  return [...byDest.values()];
}

function renderVariables(config: GridConfig, region: string): string {
  return `variable "project" {
  description = "Project ID / account label"
  type        = string
  default     = "${config.project}"
}

variable "region" {
  description = "Cloud region"
  type        = string
  default     = "${region}"
}
`;
}
