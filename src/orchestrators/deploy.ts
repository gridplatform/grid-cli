import { GridConfig } from '../validators/config';
import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import fs from 'fs-extra';
import inquirer from 'inquirer';

const execAsync = promisify(exec);

export interface DeployOptions {
  config: GridConfig;
  outputDir: string;
  tool: 'terraform' | 'tofu';
  autoApprove: boolean;
}

/**
 * Deploy with Terraform/OpenTofu: init → plan → (confirm) → apply.
 */
export async function deployInfrastructure(options: DeployOptions): Promise<void> {
  const { outputDir, tool, autoApprove } = options;
  
  await verifyToolInstalled(tool);

  if (!fs.existsSync(outputDir)) {
    throw new Error(`Output directory does not exist: ${outputDir}`);
  }

  const mainTfPath = path.join(outputDir, 'main.tf');
  if (!fs.existsSync(mainTfPath)) {
    throw new Error(`Terraform files not found in ${outputDir}. Run "grid generate" first.`);
  }

  const spinner = ora('Initializing Terraform...').start();
  try {
    await execAsync(`${tool} init`, { cwd: outputDir });
    spinner.succeed('Terraform initialized');
  } catch (error) {
    spinner.fail('Terraform initialization failed');
    throw error;
  }

  spinner.start('Running plan...');
  try {
    const { stdout } = await execAsync(`${tool} plan`, { cwd: outputDir });
    spinner.succeed('Plan completed');
    
    console.log('\n' + chalk.cyan('Planning Results:'));
    console.log(stdout);
  } catch (error) {
    spinner.fail('Plan failed');
    throw error;
  }

  if (!autoApprove) {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Do you want to apply these changes?',
        default: false,
      },
    ]);

    if (!confirm) {
      console.log(chalk.yellow('Deployment cancelled by user'));
      process.exit(0);
    }
  }

  spinner.start('Applying changes...');
  try {
    const { stdout, stderr } = await execAsync(
      `${tool} apply ${autoApprove ? '-auto-approve' : ''}`,
      { cwd: outputDir }
    );
    
    spinner.succeed('Deployment completed successfully!');
    
    if (stdout) {
      console.log('\n' + chalk.green(stdout));
    }
    if (stderr && !stderr.includes('Warning')) {
      console.warn(chalk.yellow(stderr));
    }
  } catch (error) {
    spinner.fail('Deployment failed');
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    throw error;
  }
}

async function verifyToolInstalled(tool: 'terraform' | 'tofu'): Promise<void> {
  try {
    await execAsync(`${tool} --version`);
  } catch (error) {
    throw new Error(
      `${tool} is not installed. Please install it first:\n` +
      `  - Terraform: https://terraform.io/downloads\n` +
      `  - OpenTofu: https://opentofu.org/docs/install`
    );
  }
}

