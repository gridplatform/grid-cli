import { Command } from 'commander';
import { generateInfrastructure } from '../generators/terraform';
import { validateConfig } from '../validators/config';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import fs from 'fs-extra';

/**
 * Register the 'generate' command
 */
export function generateCommand(program: Command) {
  program
    .command('generate')
    .alias('gen')
    .description('Generate Terraform/OpenTofu files from Grid configuration')
    .option('-c, --config <path>', 'Path to Grid configuration file (JSON)', 'grid.json')
    .option('-o, --output <dir>', 'Output directory for generated files', './generated')
    .option('--format <format>', 'Output format (terraform|opentofu)', 'opentofu')
    .action(async (options) => {
      const spinner = ora('Generating infrastructure files...').start();

      try {
        // Validate config file exists
        const configPath = path.resolve(options.config);
        if (!fs.existsSync(configPath)) {
          spinner.fail(`Configuration file not found: ${configPath}`);
          process.exit(1);
        }

        // Read and validate configuration
        spinner.text = 'Validating configuration...';
        const config = await fs.readJSON(configPath);
        const validationResult = validateConfig(config);
        
        if (!validationResult.valid) {
          spinner.fail('Configuration validation failed:');
          console.error(chalk.red(validationResult.errors?.join('\n')));
          process.exit(1);
        }

        // Generate files
        spinner.text = 'Generating Terraform files...';
        const outputDir = path.resolve(options.output);
        await fs.ensureDir(outputDir);
        
        const result = await generateInfrastructure(config, {
          outputDir,
          format: options.format as 'terraform' | 'opentofu'
        });

        spinner.succeed(chalk.green(`Successfully generated ${result.fileCount} file(s) to ${outputDir}`));
        
        if (result.warnings && result.warnings.length > 0) {
          console.warn(chalk.yellow('\nWarnings:'));
          result.warnings.forEach(warning => console.warn(chalk.yellow(`  - ${warning}`)));
        }

      } catch (error) {
        spinner.fail(chalk.red('Generation failed'));
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}

