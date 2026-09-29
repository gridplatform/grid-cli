import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import path from 'path';
import fs from 'fs-extra';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  discoverDesiredUnits,
  loadInventory,
  removeInventoryUnit,
  resolveConfigRoot,
} from '../inventory/store';
import { diffConfig } from '../inventory/diff';
import type { InventoryUnit } from '../inventory/types';

const execAsync = promisify(exec);

/**
 * grid prune — list stale units (JSON removed) and destroy only after confirmation.
 * Never auto-destroys when a config file disappears.
 */
export function pruneCommand(program: Command) {
  program
    .command('prune')
    .description(
      'List stale infrastructure (JSON deleted from config-dir) and optionally destroy with confirmation'
    )
    .requiredOption(
      '--config-dir <path>',
      'Desired-state root (grid-config). Source of truth for stale detection'
    )
    .option('--format <format>', 'IaC tool (terraform|opentofu)', 'terraform')
    .option('--destroy', 'Interactively confirm and destroy selected stale units', false)
    .option('--all', 'With --destroy: select all stale units (still requires final confirmation)', false)
    .option('--auto-approve', 'Skip final confirmation (dangerous)', false)
    .action(async (options) => {
      try {
        const configRoot = resolveConfigRoot(options.configDir);
        if (!(await fs.pathExists(configRoot))) {
          console.error(chalk.red(`Config root not found: ${configRoot}`));
          process.exit(1);
        }

        const desired = await discoverDesiredUnits(configRoot);
        const inventory = await loadInventory(configRoot);
        const diff = diffConfig(desired, inventory);

        if (diff.stale.length === 0) {
          console.log(chalk.green('No stale units. Inventory matches desired-state JSON files.'));
          return;
        }

        console.log(chalk.bold.red(`\nStale units (${diff.stale.length})`));
        console.log(
          chalk.gray(
            'These were applied (or tracked) but their JSON is gone from the config tree.\n' +
              'Grid will NOT destroy them unless you confirm.\n'
          )
        );
        for (const s of diff.stale) {
          console.log(chalk.red(`  • ${s.configPath}`));
          console.log(chalk.gray(`      name=${s.name}  workspace=${s.workspaceDir}`));
        }

        if (!options.destroy) {
          console.log(
            chalk.yellow(
              `\nTo destroy stale units with confirmation:\n  grid prune --config-dir ${configRoot} --destroy\n`
            )
          );
          return;
        }

        let selected: InventoryUnit[] = diff.stale;
        if (!options.all) {
          const { picked } = await inquirer.prompt([
            {
              type: 'checkbox',
              name: 'picked',
              message: 'Select stale units to destroy',
              choices: diff.stale.map((s) => ({
                name: `${s.configPath} (${s.name})`,
                value: s.id,
              })),
            },
          ]);
          selected = diff.stale.filter((s) => (picked as string[]).includes(s.id));
        }

        if (selected.length === 0) {
          console.log(chalk.yellow('Nothing selected. Cancelled.'));
          return;
        }

        console.log(chalk.red(`\nAbout to destroy ${selected.length} unit(s):`));
        for (const s of selected) {
          console.log(chalk.red(`  • ${s.configPath}`));
        }

        if (!options.autoApprove) {
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: 'Permanently destroy these workspaces in the cloud?',
              default: false,
            },
          ]);
          if (!confirm) {
            console.log(chalk.yellow('Destroy cancelled'));
            return;
          }
        }

        const tool = options.format === 'opentofu' ? 'tofu' : 'terraform';
        for (const unit of selected) {
          await destroyStaleUnit(configRoot, unit, tool);
        }

        console.log(chalk.green('\nDone.'));
      } catch (error) {
        console.error(chalk.red('Prune failed'));
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}

async function destroyStaleUnit(
  configRoot: string,
  unit: InventoryUnit,
  tool: string
): Promise<void> {
  const spinner = ora(`Destroying ${unit.configPath}...`).start();
  const cwd = unit.workspaceDir;

  if (!(await fs.pathExists(cwd))) {
    spinner.warn(
      chalk.yellow(
        `${unit.configPath}: workspace missing (${cwd}). Removing from inventory only.`
      )
    );
    await removeInventoryUnit(configRoot, unit.id);
    return;
  }

  const stateFile = path.join(cwd, 'terraform.tfstate');
  const hasState = await fs.pathExists(stateFile);

  try {
    if (hasState) {
      spinner.text = `terraform init (${unit.configPath})...`;
      await execAsync(`${tool} init -input=false`, { cwd });
      spinner.text = `terraform destroy (${unit.configPath})...`;
      await execAsync(`${tool} destroy -input=false -no-color -auto-approve`, {
        cwd,
        maxBuffer: 10 * 1024 * 1024,
      });
    } else {
      spinner.info(chalk.gray(`${unit.configPath}: no state file; inventory cleanup only`));
    }
    await removeInventoryUnit(configRoot, unit.id);
    spinner.succeed(chalk.green(`Destroyed / untracked: ${unit.configPath}`));
  } catch (err) {
    spinner.fail(chalk.red(`Failed: ${unit.configPath}`));
    throw err;
  }
}
