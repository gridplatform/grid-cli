import { Command } from 'commander';
import { generateInfrastructure } from '../generators/terraform';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { loadConfigWithDependencies } from '../config/resolveDependencies';
import { ARCHIVE_DIR, artifactDirForConfig, writeArtifactMeta } from '../config/artifacts';
import { inferConfigRootFromPath, resolveConfigRoot, toPosix } from '../inventory/store';

/**
 * Register generate: emit instance Terraform under archive/ (or -o scratch).
 * Default output mirrors the unit JSON path under archive/.
 */
export function generateCommand(program: Command) {
  program
    .command('generate')
    .alias('gen')
    .description('Generate Terraform/OpenTofu files from Grid configuration')
    .option('-c, --config <path>', 'Path to Grid configuration file (JSON)', 'grid.json')
    .option(
      '--config-dir <path>',
      'Desired-state root (resolves metadata.dependsOn; owns archive/ buffer)'
    )
    .option(
      '-o, --output <dir>',
      `Output directory (default: <config-root>/${ARCHIVE_DIR}/<same-path-as-json>/)`
    )
    .option('--format <format>', 'Output format (terraform|opentofu)', 'terraform')
    .action(async (options) => {
      const ora = (await import('ora')).default;
      const spinner = ora('Generating infrastructure files...').start();

      try {
        const configPath = path.resolve(options.config);
        spinner.text = 'Loading configuration (and dependsOn)...';
        const resolved = await loadConfigWithDependencies(configPath, {
          configDir: options.configDir,
        });

        const configRoot =
          (options.configDir ? resolveConfigRoot(options.configDir) : undefined) ||
          resolved.configRoot ||
          inferConfigRootFromPath(configPath);

        const inArchive = !options.output;
        if (inArchive && !configRoot) {
          throw new Error(
            'Cannot resolve desired-state root for archive/ output. ' +
              'Pass --config-dir, set GRID_CONFIG_ROOT, or use -o <dir> for scratch.'
          );
        }

        const outputDir = inArchive
          ? artifactDirForConfig(configPath, configRoot!)
          : path.resolve(options.output);

        const rel = configRoot
          ? toPosix(path.relative(configRoot, configPath))
          : path.basename(configPath);

        spinner.text = inArchive
          ? `Writing ${ARCHIVE_DIR}/ buffer → ${outputDir}`
          : 'Generating Terraform files...';
        await fs.ensureDir(outputDir);

        if (inArchive) {
          await writeArtifactMeta(outputDir, {
            configPath: rel,
            format: options.format,
          });
        }

        const result = await generateInfrastructure(resolved.config, {
          outputDir,
          format: options.format as 'terraform' | 'opentofu',
          moduleInstallMode: inArchive ? 'copy' : undefined,
          configRoot: configRoot || undefined,
          dependencies: resolved.dependencies,
        });

        spinner.succeed(
          chalk.green(
            inArchive
              ? `Updated archive instance Terraform from JSON → ${toPosix(path.relative(configRoot!, outputDir))}`
              : `Successfully generated ${result.fileCount} file(s) to ${outputDir}`
          )
        );
        if (inArchive) {
          console.log(
            chalk.gray(
              `  Rewrote main.tf / provider.tf / … from JSON. Vendored ./modules from bank (bank unchanged).`
            )
          );
          console.log(
            chalk.gray(
              `  Deploy from ${ARCHIVE_DIR}/… — without Grid: terraform -chdir=<that-dir> init && plan`
            )
          );
        }

        const warnings = [...(resolved.warnings || []), ...(result.warnings || [])];
        if (warnings.length > 0) {
          console.warn(chalk.yellow('\nWarnings:'));
          warnings.forEach((warning) => console.warn(chalk.yellow(`  - ${warning}`)));
        }
      } catch (error) {
        spinner.fail(chalk.red('Generation failed'));
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}
