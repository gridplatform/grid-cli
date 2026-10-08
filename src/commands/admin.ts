import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import inquirer from 'inquirer';
import { hashPassword } from '../auth/password';

interface StoredUser {
  id: string;
  email: string;
  name: string;
  role: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
  disabled: boolean;
}

interface UserStoreShape {
  version: 1;
  users: StoredUser[];
  sessions: unknown[];
}

function resolveDataDir(explicit?: string): string {
  if (explicit) return path.resolve(explicit);
  if (process.env.GRID_DATA_DIR) return path.resolve(process.env.GRID_DATA_DIR);
  return path.resolve(process.cwd(), 'data');
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function loadUsers(dataDir: string): Promise<{ file: string; store: UserStoreShape }> {
  const file = path.join(dataDir, 'users.json');
  if (!(await fs.pathExists(file))) {
    throw new Error(
      `No users.json at ${file}. Point --data-dir at grid-core GRID_DATA_DIR (or run core once to bootstrap).`
    );
  }
  const store = (await fs.readJSON(file)) as UserStoreShape;
  if (!Array.isArray(store.users)) {
    throw new Error(`Invalid users.json at ${file}`);
  }
  return { file, store };
}

async function writeUsers(file: string, store: UserStoreShape): Promise<void> {
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeJSON(tmp, store, { spaces: 2 });
  await fs.move(tmp, file, { overwrite: true });
}

function findEnvCandidates(cwd: string): string[] {
  const candidates = [
    path.resolve(cwd, '.env'),
    path.resolve(cwd, 'install/.env'),
    path.resolve(cwd, '../grid-core/.env'),
    path.resolve(cwd, '../grid-core/install/.env'),
  ];
  return candidates;
}

async function patchEnvFile(
  envFile: string,
  email: string,
  password: string
): Promise<void> {
  let text = '';
  if (await fs.pathExists(envFile)) {
    text = await fs.readFile(envFile, 'utf8');
  }
  const setLine = (key: string, value: string) => {
    const re = new RegExp(`^${key}=.*$`, 'm');
    const line = `${key}=${value}`;
    if (re.test(text)) text = text.replace(re, line);
    else text = `${text.replace(/\s*$/, '')}\n${line}\n`;
  };
  setLine('GRID_AUTH_ADMIN_EMAIL', email);
  setLine('GRID_AUTH_ADMIN_PASSWORD', password);
  await fs.writeFile(envFile, text, 'utf8');
}

/**
 * grid admin — maintain control-plane local auth (superadmin).
 */
export function adminCommand(program: Command) {
  const admin = program.command('admin').description('Control-plane admin utilities');

  admin
    .command('superadmin')
    .description('Update the bootstrap superadmin email and/or password in GRID_DATA_DIR/users.json')
    .option('--data-dir <path>', 'grid-core data directory (contains users.json)')
    .option('--env-file <path>', 'Also write GRID_AUTH_ADMIN_* into this .env file')
    .option('--email <email>', 'New superadmin email')
    .option('--password <password>', 'New superadmin password (min 8 chars)')
    .option('--yes', 'Skip confirmation prompts', false)
    .action(
      async (options: {
        dataDir?: string;
        envFile?: string;
        email?: string;
        password?: string;
        yes?: boolean;
      }) => {
        try {
          const dataDir = resolveDataDir(options.dataDir);
          const { file, store } = await loadUsers(dataDir);

          let superUser =
            store.users.find((u) => u.role === 'superadmin') ||
            store.users.find((u) => u.role === 'admin');

          if (!superUser) {
            throw new Error(`No superadmin (or legacy admin) user found in ${file}`);
          }

          console.log(chalk.bold('\nUpdate Grid superadmin\n'));
          console.log(chalk.dim(`  data file: ${file}`));
          console.log(chalk.dim(`  current:   ${superUser.email} (${superUser.role})\n`));

          let email = options.email?.trim();
          let password = options.password;

          if (!email || !password) {
            let typedPassword = '';
            const answers = await inquirer.prompt<{ email: string; password: string; confirm: string }>([
              {
                type: 'input',
                name: 'email',
                message: 'Superadmin email',
                default: email || superUser.email,
                when: () => !email,
                validate: (v: string) =>
                  /.+@.+\..+/.test(v.trim()) ? true : 'Enter a valid email',
              },
              {
                type: 'password',
                name: 'password',
                message: 'New password (min 8 characters)',
                mask: '*',
                when: () => !password,
                validate: (v: string) =>
                  v.length >= 8 ? true : 'Password must be at least 8 characters',
                filter: (v: string) => {
                  typedPassword = v;
                  return v;
                },
              },
              {
                type: 'password',
                name: 'confirm',
                message: 'Confirm password',
                mask: '*',
                when: () => !password,
                validate: (v: string) =>
                  v === typedPassword ? true : 'Passwords do not match',
              },
            ]);
            email = email || answers.email;
            password = password || answers.password;
          }

          email = normalizeEmail(email!);
          if (!password || password.length < 8) {
            throw new Error('Password must be at least 8 characters');
          }

          const taken = store.users.find(
            (u) => normalizeEmail(u.email) === email && u.id !== superUser!.id
          );
          if (taken) {
            throw new Error(`Email already used by another user: ${email}`);
          }

          if (!options.yes) {
            const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
              {
                type: 'confirm',
                name: 'proceed',
                message: `Update superadmin to ${email}?`,
                default: true,
              },
            ]);
            if (!proceed) {
              console.log(chalk.yellow('Aborted.'));
              return;
            }
          }

          const now = new Date().toISOString();
          superUser.email = email;
          superUser.role = 'superadmin';
          superUser.passwordHash = await hashPassword(password);
          superUser.updatedAt = now;
          superUser.disabled = false;
          // Invalidate sessions for safety
          store.sessions = [];

          await writeUsers(file, store);
          console.log(chalk.green(`\n✓ Superadmin updated: ${email}`));
          console.log(chalk.dim('  Existing sessions cleared — sign in again in the console.\n'));

          let envFile = options.envFile;
          if (!envFile) {
            const existing = [];
            for (const c of findEnvCandidates(process.cwd())) {
              if (await fs.pathExists(c)) existing.push(c);
            }
            if (existing.length > 0) {
              const { chosen } = await inquirer.prompt<{ chosen: string }>([
                {
                  type: 'list',
                  name: 'chosen',
                  message: chalk.yellow(
                    'Update GRID_AUTH_ADMIN_* in an env file too? (recommended so Compose/restarts keep the same account)'
                  ),
                  choices: [
                    ...existing.map((p) => ({ name: p, value: p })),
                    { name: 'Skip — I will edit the env manually', value: '' },
                  ],
                },
              ]);
              envFile = chosen || undefined;
            } else {
              console.log(
                chalk.yellow(
                  'No .env file found nearby. Update GRID_AUTH_ADMIN_EMAIL and GRID_AUTH_ADMIN_PASSWORD in your install/.env (or Compose env) so a restart does not drift from users.json.\n'
                )
              );
              console.log(chalk.dim(`  GRID_AUTH_ADMIN_EMAIL=${email}`));
              console.log(chalk.dim(`  GRID_AUTH_ADMIN_PASSWORD=<the password you set>\n`));
            }
          }

          if (envFile) {
            await patchEnvFile(path.resolve(envFile), email, password);
            console.log(chalk.green(`✓ Wrote GRID_AUTH_ADMIN_* to ${path.resolve(envFile)}`));
            console.log(
              chalk.dim(
                '  After Compose or process restart, bootstrap will match this superadmin.\n'
              )
            );
          }
        } catch (err) {
          console.error(chalk.red(err instanceof Error ? err.message : String(err)));
          process.exitCode = 1;
        }
      }
    );
}
