import { Command } from 'commander';
import { generateInfrastructure } from '../generators/terraform';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import fs from 'fs-extra';
import { exec } from 'child_process';
import { promisify } from 'util';
import { loadConfigWithDependencies } from '../config/resolveDependencies';
import { ARCHIVE_DIR, artifactDirForConfig, writeArtifactMeta } from '../config/artifacts';
import { inferConfigRootFromPath, resolveConfigRoot, toPosix } from '../inventory/store';

const execAsync = promisify(exec);

/**
 * grid plan — generate (unless --skip-generate) then terraform/tofu plan
 */
export function planCommand(program: Command) {
  program
    .command('plan')
    .description('Generate Terraform and show the plan (create/change/destroy) without applying')
    .option('-c, --config <path>', 'Path to Grid configuration file (JSON)', 'grid.json')
    .option(
      '--config-dir <path>',
      'Desired-state root (resolves metadata.dependsOn; owns archive/ buffer)'
    )
    .option(
      '-o, --output <dir>',
      `Output directory (default: <config-root>/${ARCHIVE_DIR}/<same-path-as-json>/)`
    )
    .option('--format <format>', 'IaC tool (terraform|opentofu)', 'terraform')
    .option('--skip-generate', 'Skip file generation (use existing files)', false)
    .action(async (options) => {
      const spinner = ora('Preparing plan...').start();

      try {
        const configPath = path.resolve(options.config);
        const tool = options.format === 'opentofu' ? 'tofu' : 'terraform';

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
              'Pass --config-dir or -o <dir>.'
          );
        }

        const outputDir = inArchive
          ? artifactDirForConfig(configPath, configRoot!)
          : path.resolve(options.output);

        if (!options.skipGenerate) {
          spinner.text = 'Generating Terraform files...';
          await fs.ensureDir(outputDir);
          if (inArchive) {
            const rel = toPosix(path.relative(configRoot!, configPath));
            await writeArtifactMeta(outputDir, {
              configPath: rel,
              format: options.format,
            });
          }
          await generateInfrastructure(resolved.config, {
            outputDir,
            format: options.format as 'terraform' | 'opentofu',
            moduleInstallMode: inArchive ? 'copy' : undefined,
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
