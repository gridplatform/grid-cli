#!/usr/bin/env node

/**
 * Grid CLI — Infrastructure Orchestration Platform
 *
 * Commands are lazy-loaded so cold start only pays for the command you run.
 */

import { Command } from 'commander';
import { version } from '../package.json';

type CommandRegistrar = (program: Command) => void;

const COMMAND_LOADERS: Record<string, () => Promise<CommandRegistrar>> = {
  generate: async () => (await import('./commands/generate')).generateCommand,
  gen: async () => (await import('./commands/generate')).generateCommand,
  plan: async () => (await import('./commands/plan')).planCommand,
  deploy: async () => (await import('./commands/deploy')).deployCommand,
  destroy: async () => (await import('./commands/destroy')).destroyCommand,
  validate: async () => (await import('./commands/validate')).validateCommand,
  status: async () => (await import('./commands/status')).statusCommand,
  providers: async () => (await import('./commands/providers')).providersCommand,
  prune: async () => (await import('./commands/prune')).pruneCommand,
};

const ALL_COMMAND_KEYS = [
  'generate',
  'plan',
  'deploy',
  'destroy',
  'validate',
  'status',
  'providers',
  'prune',
] as const;

async function loadRegistrar(name: string): Promise<CommandRegistrar | undefined> {
  const loader = COMMAND_LOADERS[name];
  return loader ? loader() : undefined;
}

/** First positional token, or undefined when help/version/no-command. */
function primaryArg(argv: string[]): string | undefined {
  const args = argv.slice(2);
  for (const a of args) {
    if (a === '-h' || a === '--help' || a === '-V' || a === '--version') {
      return undefined;
    }
    if (!a.startsWith('-')) return a;
  }
  return undefined;
}

async function registerCommands(program: Command, argv: string[]): Promise<void> {
  const name = primaryArg(argv);

  if (name) {
    const registrar = await loadRegistrar(name);
    if (registrar) {
      registrar(program);
      return;
    }
    // Unknown command: register all so Commander can print a proper error + help.
  }

  await Promise.all(
    ALL_COMMAND_KEYS.map(async (key) => {
      const registrar = await loadRegistrar(key);
      registrar?.(program);
    })
  );
}

async function main(): Promise<void> {
  // Providers bootstrap lives inside generate/deploy paths and providers command —
  // avoid paying for it on --help / -V.
  const program = new Command();

  program
    .name('grid')
    .description('Grid Platform CLI - Infrastructure Orchestration Tool')
    .version(version || '0.1.0');

  await registerCommands(program, process.argv);
  await program.parseAsync(process.argv);

  if (!process.argv.slice(2).length) {
    program.outputHelp();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
