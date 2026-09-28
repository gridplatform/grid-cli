import { Command } from 'commander';
import { deployInfrastructure } from '../orchestrators/deploy';
import { validateConfig } from '../validators/config';
import { generateInfrastructure } from '../generators/terraform';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import fs from 'fs-extra';

/**
 * Register the 'deploy' command
 */
export function deployCommand(program: Command) {
  program
    .command('deploy')
    .description('Generate and deploy infrastructure using Terraform/OpenTofu')
    .option('-c, --config <path>', 'Path to Grid configuration file (JSON)', 'grid.json')
    .option('-o, --output <dir>', 'Output directory for generated files', './generated')
    .option('--format <format>', 'IaC tool (terraform|opentofu)', 'opentofu')
    .option('--auto-approve', 'Skip confirmation prompt', false)
    .option('--skip-generate', 'Skip file generation (use existing files)', false)
    .action(async (options) => {
      const spinner = ora('Preparing deployment...').start();

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

        // Generate files if not skipped
        if (!options.skipGenerate) {
          spinner.text = 'Generating Terraform files...';
          const outputDir = path.resolve(options.output);
          await fs.ensureDir(outputDir);
          
          await generateInfrastructure(config, {
            outputDir,
            format: options.format as 'terraform' | 'opentofu'
          });
        }

        // Deploy infrastructure
        spinner.text = 'Deploying infrastructure...';
        const outputDir = path.resolve(options.output);
        const tool = options.format === 'terraform' ? 'terraform' : 'tofu';
        
        await deployInfrastructure({
          config,
          outputDir,
          tool,
          autoApprove: options.autoApprove
        });

        spinner.succeed(chalk.green('Deployment completed successfully!'));

      } catch (error) {
        spinner.fail(chalk.red('Deployment failed'));
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}

