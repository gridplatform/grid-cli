import { Command } from 'commander';
import chalk from 'chalk';
import {
  discoverDesiredUnits,
  loadInventory,
  resolveConfigRoot,
} from '../inventory/store';
import { diffConfig } from '../inventory/diff';
import path from 'path';
import fs from 'fs-extra';

/**
 * grid status — workspace status, or desired-state diff with --config-dir
 */
export function statusCommand(program: Command) {
  program
    .command('status')
    .description(
      'Show deployment status. With --config-dir: diff desired JSON vs applied inventory (adds/changes/stale).'
    )
    .option('-o, --output <dir>', 'Directory containing Terraform files', './generated')
    .option(
      '--config-dir <path>',
      'Desired-state root (from Core: GRID_CONFIG_ROOT). Source of truth for adds/changes/stale detection'
    )
    .action(async (options) => {
      try {
        if (options.configDir) {
          await statusConfigDir(options.configDir);
          return;
        }
        await statusWorkspace(options.output);
      } catch (error) {
        console.error(chalk.red('Status check failed:'));
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}

async function statusWorkspace(output: string) {
  const outputDir = path.resolve(output);
  if (!fs.existsSync(outputDir)) {
    console.log(chalk.yellow(`No deployment found at: ${outputDir}`));
    console.log(chalk.gray('Run "grid deploy" to start a deployment.'));
    console.log(
      chalk.gray('Or pass --config-dir / set GRID_CONFIG_ROOT (owned by grid-core) to diff desired state.')
    );
    return;
  }

  const stateFile = path.join(outputDir, 'terraform.tfstate');
  const hasState = fs.existsSync(stateFile);

  if (hasState) {
    console.log(chalk.green('Infrastructure is deployed'));
    console.log(chalk.gray(`\nState file: ${stateFile}`));
  } else {
    console.log(chalk.yellow('No active deployment found'));
    console.log(chalk.gray(`\nGenerated files exist at: ${outputDir}`));
    console.log(chalk.gray('Run "grid deploy" to deploy infrastructure.'));
  }
}

async function statusConfigDir(configDirOpt: string) {
  const configRoot = resolveConfigRoot(configDirOpt);
  if (!(await fs.pathExists(configRoot))) {
    console.error(chalk.red(`Config root not found: ${configRoot}`));
    process.exit(1);
  }

  const desired = await discoverDesiredUnits(configRoot);
  const inventory = await loadInventory(configRoot);
  const diff = diffConfig(desired, inventory);

  console.log(chalk.bold(`\nGrid desired state: ${configRoot}`));
  console.log(chalk.gray(`Tracked in inventory: ${inventory.units.length}`));
  console.log(chalk.gray(`JSON configs found:   ${desired.length}\n`));

  printSection('Added (new JSON — not applied yet)', diff.added.map((a) => a.configPath), 'cyan');
  printSection(
    'Changed (JSON edited since last apply)',
    diff.changed.map((c) => c.desired.configPath),
    'yellow'
  );
  printSection(
    'Unchanged',
    diff.unchanged.map((u) => u.desired.configPath),
    'gray'
  );
  printSection(
    'Stale (JSON deleted — live/workspace still tracked; NOT auto-destroyed)',
    diff.stale.map((s) => `${s.configPath}  [${s.name}]`),
    'red'
  );

  if (diff.stale.length > 0) {
    console.log(
      chalk.yellow(
        `\nSuggestion: review stale units, then destroy with confirmation:\n  grid prune --config-dir ${configRoot}\n`
      )
    );
  } else if (diff.added.length + diff.changed.length > 0) {
    console.log(
      chalk.cyan(
        `\nTo apply adds/changes:\n  grid deploy --config-dir ${configRoot} --reconcile\n`
      )
    );
  } else {
    console.log(chalk.green('\nDesired state matches inventory (no stale units).\n'));
  }
}

function printSection(title: string, lines: string[], color: 'cyan' | 'yellow' | 'gray' | 'red') {
  const paint = chalk[color];
  console.log(paint.bold(`${title} (${lines.length})`));
  if (lines.length === 0) {
    console.log(chalk.gray('  (none)'));
  } else {
    for (const line of lines.slice(0, 50)) {
      console.log(paint(`  • ${line}`));
    }
    if (lines.length > 50) {
      console.log(chalk.gray(`  … and ${lines.length - 50} more`));
    }
  }
  console.log('');
}
