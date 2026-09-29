import { Command } from 'commander';
import { generateInfrastructure } from '../generators/terraform';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { loadConfigWithDependencies } from '../config/resolveDependencies';

/**
 * Register the 'generate' command
 */
export function generateCommand(program: Command) {
  program
    .command('generate')
    .alias('gen')
    .description('Generate Terraform/OpenTofu files from Grid configuration')
    .option('-c, --config <path>', 'Path to Grid configuration file (JSON)', 'grid.json')
    .option(
      '--config-dir <path>',
      'Desired-state root (resolves metadata.dependsOn for split vpc/vm files)'
    )
    .option('-o, --output <dir>', 'Output directory for generated files', './generated')
    .option('--format <format>', 'Output format (terraform|opentofu)', 'opentofu')
    .action(async (options) => {
      const ora = (await import('ora')).default;
      const spinner = ora('Generating infrastructure files...').start();

      try {
        const configPath = path.resolve(options.config);
        spinner.text = 'Loading configuration (and dependsOn)...';
        const resolved = await loadConfigWithDependencies(configPath, {
          configDir: options.configDir,
        });

        spinner.text = 'Generating Terraform files...';
        const outputDir = path.resolve(options.output);
        await fs.ensureDir(outputDir);

        const result = await generateInfrastructure(resolved.config, {
          outputDir,
          format: options.format as 'terraform' | 'opentofu',
        });

        spinner.succeed(
          chalk.green(`Successfully generated ${result.fileCount} file(s) to ${outputDir}`)
        );

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
