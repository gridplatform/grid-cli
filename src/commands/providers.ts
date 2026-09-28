import { Command } from 'commander';
import chalk from 'chalk';
import { bootstrapProviders } from '../providers';
import { listProviders } from '../providers/registry';
import { catalogFor } from '../generators/terraform/resourceCatalog';

/**
 * Register the 'providers' command — lists registered clouds and status.
 */
export function providersCommand(program: Command) {
  program
    .command('providers')
    .description('List registered cloud providers and their Grid CLI status')
    .option('--json', 'Output as JSON')
    .action((options) => {
      bootstrapProviders();
      const providers = listProviders();

      if (options.json) {
        const payload = providers.map((p) => ({
          id: p.id,
          label: p.label,
          status: p.status,
          defaultRegion: p.defaultRegion,
          moduleRoot: p.moduleRoot,
          statusMessage: p.statusMessage,
          resourceTypes: catalogFor(p.id).length,
        }));
        console.log(JSON.stringify(payload, null, 2));
        return;
      }

      console.log(chalk.bold('\nGrid CLI providers\n'));
      const statusColor = {
        supported: chalk.green,
        coming_soon: chalk.yellow,
        planned: chalk.dim,
      } as const;

      for (const p of providers) {
        const color = statusColor[p.status];
        const resources = catalogFor(p.id);
        const supportedCount = resources.filter((r) => r.status === 'supported').length;
        console.log(
          `  ${chalk.cyan(p.id.padEnd(18))} ${p.label.padEnd(22)} ${color(p.status.padEnd(12))} ` +
            (resources.length
              ? `${supportedCount}/${resources.length} resources ready`
              : 'no catalog yet')
        );
        if (p.status !== 'supported' && p.statusMessage) {
          console.log(chalk.dim(`    ${p.statusMessage}`));
        }
      }
      console.log();
    });
}
