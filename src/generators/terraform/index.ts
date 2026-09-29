import path from 'path';
import fs from 'fs-extra';
import { GridConfig } from '../../validators/config';
import { generateBackend } from './backend';
import {
  moduleSpecsFromResources,
  renderCatalogResources,
  renderStackOutputs,
} from './catalogResources';
import { ModuleCopySpec, copyModulesFromBank, ensureModuleBankRoot } from './moduleBank';
import { bootstrapProviders } from '../../providers';
import { assertProviderCanGenerate } from '../../providers/registry';
import type { ResolvedDependency } from '../../config/resolveDependencies';

export interface GenerateOptions {
  outputDir: string;
  format: 'terraform' | 'opentofu';
  /**
   * How to install bank modules into output/modules.
   * - copy: self-contained (archive / deploy path)
   * - link: symlink to grid-terraform (fast scratch)
   */
  moduleInstallMode?: 'link' | 'copy';
  /** Platform desired-state root (for dependsOn remote-state paths). */
  configRoot?: string;
  /** Reference-only dependsOn units — never merged into this stack's resources. */
  dependencies?: ResolvedDependency[];
}

export interface GenerateResult {
  fileCount: number;
  files: string[];
  warnings?: string[];
}

/**
 * Generate Terraform/OpenTofu from unit JSON into `outputDir`.
 *
 * Writes instance stack files (main.tf, provider.tf, …). For a desired-state repo
 * that is typically `<configRoot>/archive/…`. Vendors modules/ from the bank;
 * never modifies the bank itself.
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

  const bankRoot = await ensureModuleBankRoot();
  warnings.push(`Module bank (read-only source): ${bankRoot}`);

  let resourceBlocks: string;
  try {
    resourceBlocks = renderCatalogResources(provider.id, config.resources, {
      project: config.project,
      region,
      dependencies,
    });
  } catch (error) {
    throw new Error(
      `Generate failed for provider "${provider.id}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  const specs = dedupeSpecs(moduleSpecsFromResources(provider.id, config.resources));
  const outputsBody = renderStackOutputs(provider.id, config.resources);

  await fs.ensureDir(options.outputDir);
  const modulesTarget = path.join(options.outputDir, 'modules');
  await fs.emptyDir(modulesTarget);

  const header = `# Instance Terraform — regenerated from Grid JSON (do not treat as the module bank).
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

  const installMode =
    options.moduleInstallMode ??
    (process.env.GRID_MODULE_COPY === '1' || process.env.GRID_MODULE_COPY === 'true'
      ? 'copy'
      : undefined);

  const [install] = await Promise.all([
    copyModulesFromBank(modulesTarget, specs, installMode ? { mode: installMode } : undefined),
    fs.writeFile(mainTfPath, `${header}${resourceBlocks}\n`),
    fs.writeFile(providerTfPath, provider.renderProviderBlock(config)),
    fs.writeFile(backendTfPath, generateBackend(config)),
    fs.writeFile(outputsTfPath, outputsBody),
    fs.writeFile(variablesTfPath, renderVariables(config, region)),
  ]);

  const verb = install.mode === 'link' ? 'Linked' : 'Vendored';
  warnings.push(`${verb} modules into ./modules from bank: ${install.installed.join(', ') || '(none)'}`);
  warnings.push(
    'Instance HCL (main.tf, …) was rewritten from JSON. Module bank was not modified.'
  );
  if (install.mode === 'link') {
    warnings.push('Modules are symlinked (fast). Archive/deploy uses copy by default.');
  }
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
  };
}

function dedupeSpecs(specs: ModuleCopySpec[]): ModuleCopySpec[] {
  const byDest = new Map<string, ModuleCopySpec>();
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
