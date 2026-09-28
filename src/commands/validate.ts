import { Command } from 'commander';
import { validateConfig } from '../validators/config';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';

/**
 * Register the 'validate' command
 */
export function validateCommand(program: Command) {
  program
    .command('validate')
    .description('Validate Grid configuration file')
    .option('-c, --config <path>', 'Path to Grid configuration file (JSON)', 'grid.json')
    .action(async (options) => {
      try {
        const configPath = path.resolve(options.config);
        
        if (!fs.existsSync(configPath)) {
          console.error(chalk.red(`Configuration file not found: ${configPath}`));
          process.exit(1);
        }

        const config = await fs.readJSON(configPath);
        const result = validateConfig(config);

        if (result.valid) {
          console.log(chalk.green('✅ Configuration is valid!'));
          if (result.warnings && result.warnings.length > 0) {
            console.warn(chalk.yellow('\nWarnings:'));
            result.warnings.forEach(warning => console.warn(chalk.yellow(`  - ${warning}`)));
          }
          process.exit(0);
        } else {
          console.error(chalk.red('❌ Configuration validation failed:'));
          if (result.errors) {
            result.errors.forEach(error => console.error(chalk.red(`  - ${error}`)));
          }
          process.exit(1);
        }

      } catch (error) {
        console.error(chalk.red('Validation failed:'));
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}

