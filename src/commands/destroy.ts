import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import fs from 'fs-extra';
import inquirer from 'inquirer';
import { exec } from 'child_process';
import { promisify } from 'util';
import { generateInfrastructure } from '../generators/terraform';
import {
  inferConfigRootFromPath,
  removeInventoryUnit,
  resolveConfigRoot,
  toPosix,
  workspaceDirFor,
} from '../inventory/store';
import { artifactDirForConfig } from '../config/artifacts';
import { loadConfigWithDependencies } from '../config/resolveDependencies';

const execAsync = promisify(exec);

/**
 * grid destroy — terraform destroy in the archive workspace; drop inventory row
 */
export function destroyCommand(program: Command) {
  program
    .command('destroy')
    .description('Destroy infrastructure managed by a Grid-generated Terraform workspace')
    .option('-c, --config <path>', 'Path to Grid configuration file (JSON)', 'grid.json')
    .option(
      '-o, --output <dir>',
      'Terraform dir (default: <config-root>/archive/<same-path-as-json>/)'
    )
    .option('--config-dir <path>', 'Desired-state root (for inventory + archive/ lookup)')
    .option('--format <format>', 'IaC tool (terraform|opentofu)', 'terraform')
    .option('--auto-approve', 'Skip confirmation prompt', false)
    .option('--skip-generate', 'Skip regenerating files before destroy', false)
    .action(async (options) => {
      const spinner = ora('Preparing destroy...').start();

      try {
        const configPath = path.resolve(options.config);
        const tool = options.format === 'opentofu' ? 'tofu' : 'terraform';

        const configRoot = options.configDir
          ? resolveConfigRoot(options.configDir)
          : inferConfigRootFromPath(configPath);

        let outputDir: string;
        let rel: string | undefined;
        if (configRoot && (await fs.pathExists(configPath))) {
          rel = toPosix(path.relative(configRoot, configPath));
          if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
            outputDir = workspaceDirFor(configRoot, rel);
          } else if (options.output) {
            outputDir = path.resolve(options.output);
          } else {
            throw new Error('Config outside desired-state root — pass -o <dir>');
          }
        } else if (options.output) {
          outputDir = path.resolve(options.output);
        } else if (configRoot) {
          outputDir = artifactDirForConfig(configPath, configRoot);
        } else {
          throw new Error('Pass --config-dir or -o <dir> for destroy');
        }

        if (!fs.existsSync(outputDir)) {
          spinner.fail(`Output directory not found: ${outputDir}`);
          process.exit(1);
        }

        if (fs.existsSync(configPath) && !options.skipGenerate) {
          spinner.text = 'Loading configuration (and dependsOn)...';
          const resolved = await loadConfigWithDependencies(configPath, {
            configDir: options.configDir,
          });
          spinner.text = 'Regenerating Terraform files...';
          await generateInfrastructure(resolved.config, {
            outputDir,
            format: options.format as 'terraform' | 'opentofu',
            moduleInstallMode: 'copy',
            configRoot: options.configDir
              ? resolveConfigRoot(options.configDir)
              : resolved.configRoot,
            dependencies: resolved.dependencies,
          });
        }

        spinner.text = 'Initializing...';
        await execAsync(`${tool} init -input=false`, { cwd: outputDir });
        spinner.stop();

        if (!options.autoApprove) {
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: 'Destroy all resources in this workspace?',
              default: false,
            },
          ]);
          if (!confirm) {
            console.log(chalk.yellow('Destroy cancelled'));
            process.exit(0);
          }
        }

        spinner.start('Destroying infrastructure...');
        const { stdout, stderr } = await execAsync(
          `${tool} destroy -input=false -no-color -auto-approve`,
          { cwd: outputDir, maxBuffer: 10 * 1024 * 1024 }
        );
        spinner.succeed(chalk.green('Destroy completed'));
        if (stdout) console.log(stdout);
        if (stderr && !stderr.includes('Warning')) {
          console.warn(chalk.yellow(stderr));
        }

        if (configRoot && rel && !rel.startsWith('..')) {
          await removeInventoryUnit(configRoot, rel);
          console.log(chalk.gray(`Removed from inventory: ${rel}`));
        }
      } catch (error) {
        spinner.fail(chalk.red('Destroy failed'));
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}
