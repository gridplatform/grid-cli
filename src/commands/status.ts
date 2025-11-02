import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';

/**
 * Register the 'status' command
 */
export function statusCommand(program: Command) {
  program
    .command('status')
    .description('Show deployment status and infrastructure state')
    .option('-o, --output <dir>', 'Directory containing Terraform files', './generated')
    .action(async (options) => {
      try {
        const outputDir = path.resolve(options.output);
        
        if (!fs.existsSync(outputDir)) {
          console.log(chalk.yellow(`No deployment found at: ${outputDir}`));
          console.log(chalk.gray('Run "grid deploy" to start a deployment.'));
          process.exit(0);
        }

        // Check for Terraform state file
        const stateFile = path.join(outputDir, 'terraform.tfstate');
        const hasState = fs.existsSync(stateFile);

        if (hasState) {
          const state = await fs.readJSON(stateFile);
          console.log(chalk.green('✅ Infrastructure is deployed'));
          console.log(chalk.gray(`\nState file: ${stateFile}`));
          // TODO: Parse and display resource status
        } else {
          console.log(chalk.yellow('⚠️  No active deployment found'));
          console.log(chalk.gray(`\nGenerated files exist at: ${outputDir}`));
          console.log(chalk.gray('Run "grid deploy" to deploy infrastructure.'));
        }

      } catch (error) {
        console.error(chalk.red('Status check failed:'));
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}

