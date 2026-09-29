import { Command } from 'commander';
import { generateInfrastructure } from '../generators/terraform';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import fs from 'fs-extra';
import { exec } from 'child_process';
import { promisify } from 'util';
import { loadConfigWithDependencies } from '../config/resolveDependencies';

const execAsync = promisify(exec);

/**
 * grid plan — generate (optional) + terraform plan
 */
export function planCommand(program: Command) {
  program
    .command('plan')
    .description('Generate Terraform and show the plan (create/change/destroy) without applying')
    .option('-c, --config <path>', 'Path to Grid configuration file (JSON)', 'grid.json')
    .option(
      '--config-dir <path>',
      'Desired-state root (resolves metadata.dependsOn for split vpc/vm files)'
    )
    .option('-o, --output <dir>', 'Output directory for generated files', './generated')
    .option('--format <format>', 'IaC tool (terraform|opentofu)', 'terraform')
    .option('--skip-generate', 'Skip file generation (use existing files)', false)
    .action(async (options) => {
      const spinner = ora('Preparing plan...').start();

      try {
        const configPath = path.resolve(options.config);
        const outputDir = path.resolve(options.output);
        const tool = options.format === 'opentofu' ? 'tofu' : 'terraform';

        if (!options.skipGenerate) {
          spinner.text = 'Loading configuration (and dependsOn)...';
          const resolved = await loadConfigWithDependencies(configPath, {
            configDir: options.configDir,
          });
          spinner.text = 'Generating Terraform files...';
          await fs.ensureDir(outputDir);
          await generateInfrastructure(resolved.config, {
            outputDir,
            format: options.format as 'terraform' | 'opentofu',
          });
          for (const w of resolved.warnings) {
            console.warn(chalk.yellow(`  - ${w}`));
          }
        }

        spinner.text = 'Initializing...';
        await execAsync(`${tool} init -input=false`, { cwd: outputDir });
        spinner.text = 'Running plan...';
        const { stdout } = await execAsync(`${tool} plan -input=false -no-color`, {
          cwd: outputDir,
          maxBuffer: 10 * 1024 * 1024,
        });
        spinner.succeed(chalk.green('Plan completed'));
        console.log('\n' + stdout);
      } catch (error) {
        spinner.fail(chalk.red('Plan failed'));
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}
