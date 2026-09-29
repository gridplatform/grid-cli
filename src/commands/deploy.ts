import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import inquirer from 'inquirer';
import { generateInfrastructure } from '../generators/terraform';
import { deployInfrastructure } from '../orchestrators/deploy';
import { loadConfigWithDependencies, collectCoveredDependsOnPaths } from '../config/resolveDependencies';
import {
  discoverDesiredUnits,
  inferConfigRootFromPath,
  loadInventory,
  resolveConfigRoot,
  toPosix,
  upsertAppliedUnit,
  workspaceDirFor,
} from '../inventory/store';
import { diffConfig } from '../inventory/diff';
import { hashConfig } from '../inventory/types';

/**
 * grid deploy — single config, or reconcile adds/changes under --config-dir
 */
export function deployCommand(program: Command) {
  program
    .command('deploy')
    .description('Generate and deploy infrastructure using Terraform/OpenTofu')
    .option('-c, --config <path>', 'Path to Grid configuration file (JSON)', 'grid.json')
    .option(
      '--config-dir <path>',
      'Desired-state root (from Core: GRID_CONFIG_ROOT). Resolves dependsOn; with --reconcile deploys added/changed'
    )
    .option('--reconcile', 'With --config-dir: deploy added + changed units only (never stale)', false)
    .option('-o, --output <dir>', 'Output directory for generated files', './generated')
    .option('--format <format>', 'IaC tool (terraform|opentofu)', 'opentofu')
    .option('--auto-approve', 'Skip confirmation prompt', false)
    .option('--skip-generate', 'Skip file generation (use existing files)', false)
    .action(async (options) => {
      try {
        if (options.configDir && options.reconcile) {
          await deployReconcile(options);
          return;
        }
        await deploySingle(options);
      } catch (error) {
        console.error(chalk.red('Deployment failed'));
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}

async function deploySingle(options: {
  config: string;
  output: string;
  format: string;
  autoApprove: boolean;
  skipGenerate: boolean;
  configDir?: string;
}) {
  const ora = (await import('ora')).default;
  const spinner = ora('Preparing deployment...').start();

  const configPath = path.resolve(options.config);
  spinner.text = 'Loading configuration (and dependsOn)...';
  const resolved = await loadConfigWithDependencies(configPath, {
    configDir: options.configDir,
  });
  const config = resolved.config;

  const configRoot =
    options.configDir != null
      ? resolveConfigRoot(options.configDir)
      : resolved.configRoot || inferConfigRootFromPath(configPath);
  const rel = configRoot ? toPosix(path.relative(configRoot, configPath)) : undefined;
  const outputDir =
    configRoot && rel && !rel.startsWith('..')
      ? workspaceDirFor(configRoot, rel)
      : path.resolve(options.output);

  if (!options.skipGenerate) {
    spinner.text = 'Generating Terraform files...';
    await fs.ensureDir(outputDir);
    await generateInfrastructure(config, {
      outputDir,
      format: options.format as 'terraform' | 'opentofu',
    });
  }

  spinner.text = 'Deploying infrastructure...';
  const tool = options.format === 'terraform' ? 'terraform' : 'tofu';
  await deployInfrastructure({
    config,
    outputDir,
    tool,
    autoApprove: options.autoApprove,
  });

  if (configRoot && rel && !rel.startsWith('..')) {
    const meta = config.metadata as { name?: string; environment?: string } | undefined;
    const primaryOnDisk = await fs.readJSON(configPath);
    await upsertAppliedUnit(
      configRoot,
      {
        configPath: rel,
        absPath: configPath,
        contentHash: hashConfig(primaryOnDisk),
        name: meta?.name || path.basename(configPath, '.json'),
        provider: String(config.provider),
        environment: meta?.environment || 'development',
        config: primaryOnDisk,
      },
      outputDir
    );
  }

  spinner.succeed(chalk.green('Deployment completed successfully!'));
  for (const w of resolved.warnings) {
    console.warn(chalk.yellow(`  - ${w}`));
  }
  if (configRoot && rel && !rel.startsWith('..')) {
    console.log(chalk.gray(`Inventory updated: ${rel}`));
    console.log(chalk.gray(`Workspace: ${outputDir}`));
  }
}

async function deployReconcile(options: {
  configDir: string;
  format: string;
  autoApprove: boolean;
}) {
  const configRoot = resolveConfigRoot(options.configDir);
  const ora = (await import('ora')).default;
  const spinner = ora(`Scanning ${configRoot}...`).start();

  const desired = await discoverDesiredUnits(configRoot);
  const inventory = await loadInventory(configRoot);
  const diff = diffConfig(desired, inventory);
  spinner.stop();

  const covered = collectCoveredDependsOnPaths(desired);
  const rawTargets = [...diff.added, ...diff.changed.map((c) => c.desired)];
  const skipped = rawTargets.filter((t) => covered.has(t.configPath));
  const targets = rawTargets.filter((t) => !covered.has(t.configPath));

  if (targets.length === 0) {
    console.log(chalk.green('Nothing to deploy (no added/changed configs).'));
    if (skipped.length > 0) {
      console.log(
        chalk.gray(
          `\nSkipped ${skipped.length} unit(s) covered by another unit's metadata.dependsOn (network owned by leaf stack):`
        )
      );
      for (const s of skipped) console.log(chalk.gray(`  • ${s.configPath}`));
    }
    if (diff.stale.length > 0) {
      console.log(
        chalk.yellow(
          `\n${diff.stale.length} stale unit(s) (JSON removed). Run: grid prune --config-dir ${configRoot}`
        )
      );
    }
    return;
  }

  console.log(chalk.cyan(`\nWill deploy ${targets.length} unit(s):`));
  for (const t of targets) {
    console.log(`  • ${t.configPath}`);
  }
  if (skipped.length > 0) {
    console.log(
      chalk.gray(
        `\nSkipping ${skipped.length} unit(s) covered by metadata.dependsOn (avoid duplicate network ownership):`
      )
    );
    for (const s of skipped) console.log(chalk.gray(`  • ${s.configPath}`));
  }
  if (diff.stale.length > 0) {
    console.log(
      chalk.yellow(
        `\nNote: ${diff.stale.length} stale unit(s) will NOT be destroyed. Use grid prune.`
      )
    );
  }

  if (!options.autoApprove) {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Apply these units?',
        default: false,
      },
    ]);
    if (!confirm) {
      console.log(chalk.yellow('Cancelled'));
      return;
    }
  }

  const tool = options.format === 'terraform' ? 'terraform' : 'tofu';
  for (const t of targets) {
    const resolved = await loadConfigWithDependencies(t.absPath, { configDir: configRoot });
    const outputDir = workspaceDirFor(configRoot, t.configPath);
    console.log(chalk.cyan(`\n→ ${t.configPath}`));
    await fs.ensureDir(outputDir);
    await generateInfrastructure(resolved.config, {
      outputDir,
      format: options.format as 'terraform' | 'opentofu',
    });
    await deployInfrastructure({
      config: resolved.config as never,
      outputDir,
      tool,
      autoApprove: true,
    });
    await upsertAppliedUnit(configRoot, t, outputDir);
    console.log(chalk.green(`✓ ${t.configPath}`));
  }
}
