#!/usr/bin/env node

/**
 * Grid CLI - Infrastructure Orchestration Platform
 * 
 * Command-line interface for managing infrastructure deployments
 * via Grid Platform.
 */

import { Command } from 'commander';
import { generateCommand } from './commands/generate';
import { deployCommand } from './commands/deploy';
import { validateCommand } from './commands/validate';
import { statusCommand } from './commands/status';
import { providersCommand } from './commands/providers';
import { bootstrapProviders } from './providers';
import { version } from '../package.json';

bootstrapProviders();

const program = new Command();

program
  .name('grid')
  .description('Grid Platform CLI - Infrastructure Orchestration Tool')
  .version(version || '0.1.0');

// Register commands
generateCommand(program);
deployCommand(program);
validateCommand(program);
statusCommand(program);
providersCommand(program);

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

