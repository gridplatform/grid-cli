import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { spawnSync } from 'child_process';
import {
  ENV_FOLDERS,
  PROJECT_FILE,
  writeProjectMarker,
  EPHEMERAL_DIR,
} from '../project/marker';

/**
 * grid init — scaffold a normal desired-state repo (like git init for Grid).
 *
 * demo-infra is a test fixture only. Real use: git init → grid init → edit JSON → generate/deploy.
 */
export function initCommand(program: Command) {
  program
    .command('init')
    .description('Initialize a Grid desired-state directory (customer config root)')
    .argument('[dir]', 'Directory to initialize (default: current directory)', '.')
    .option('--git', 'Run git init if .git is missing', false)
    .option('--sample', 'Add a minimal development sample stack', false)
    .option('--force', 'Allow init when .grid/project.json already exists', false)
    .action(async (dir: string, options: { git?: boolean; sample?: boolean; force?: boolean }) => {
      try {
        const root = path.resolve(dir);
        await fs.ensureDir(root);

        const marker = path.join(root, PROJECT_FILE);
        if ((await fs.pathExists(marker)) && !options.force) {
          console.error(
            chalk.red(
              `Already a Grid project (${PROJECT_FILE}). Use --force to refresh marker/folders.`
            )
          );
          process.exit(1);
        }

        for (const env of ENV_FOLDERS) {
          await fs.ensureDir(path.join(root, env));
          const keep = path.join(root, env, '.gitkeep');
          if (!(await fs.pathExists(keep))) {
            await fs.writeFile(keep, '');
          }
        }

        await writeProjectMarker(root);

        const gi = path.join(root, '.gitignore');
        if (!(await fs.pathExists(gi))) {
          await fs.writeFile(
            gi,
            `# Grid local state (do not commit workspaces / inventory / ephemeral clones)
.grid/workspaces/
.grid/inventory.json
${EPHEMERAL_DIR}/
`
          );
        }

        const readme = path.join(root, 'README.md');
        if (!(await fs.pathExists(readme))) {
          await fs.writeFile(
            readme,
            `# Grid desired state

This directory is your **configuration root** (\`GRID_CONFIG_ROOT\`).

Canonical environments (only three):

\`\`\`text
development/   staging/   production/
  <stack-name>/
    grid.json
\`\`\`

Need an isolated copy of development so shared resources are not contested?

\`\`\`bash
grid env clone development --name try-rds --ttl 24h
# → .ephemeral/development--try-rds/  (TTL; auto-suffixes resource names)
\`\`\`

Point grid-core at this folder:

\`\`\`bash
export GRID_CONFIG_ROOT=${root}
\`\`\`
`
          );
        }

        if (options.sample) {
          const sampleDir = path.join(root, 'development', 'example-vpc');
          await fs.ensureDir(sampleDir);
          const sampleJson = path.join(sampleDir, 'grid.json');
          if (!(await fs.pathExists(sampleJson))) {
            await fs.writeJSON(
              sampleJson,
              {
                provider: 'aws',
                project: 'REPLACE_PROJECT',
                region: 'ap-south-1',
                metadata: {
                  name: 'example-vpc',
                  environment: 'development',
                  description: 'Sample stack from grid init --sample (edit before apply)',
                },
                resources: [
                  {
                    type: 'vpc',
                    name: 'example-vpc',
                    cidr: '10.60.0.0/16',
                    description: 'Example VPC',
                  },
                  {
                    type: 'subnet',
                    name: 'example-public',
                    vpc: 'example-vpc',
                    cidr: '10.60.1.0/24',
                    region: 'ap-south-1',
                  },
                ],
              },
              { spaces: 2 }
            );
          }
        }

        if (options.git) {
          const gitDir = path.join(root, '.git');
          if (!(await fs.pathExists(gitDir))) {
            const r = spawnSync('git', ['init'], { cwd: root, stdio: 'inherit' });
            if (r.status !== 0) {
              console.warn(chalk.yellow('git init failed — create the repo manually if needed.'));
            }
          }
        }

        console.log(chalk.green(`\nInitialized Grid desired state at ${root}`));
        console.log(chalk.gray(`  marker: ${PROJECT_FILE}`));
        console.log(chalk.gray(`  envs:   ${ENV_FOLDERS.join(', ')}`));
        console.log(`
${chalk.bold('Normal workflow')}
  1. ${chalk.cyan('git init')} / ${chalk.cyan('grid init --git')}   (repo for desired state)
  2. Add stacks under development|staging|production/<name>/grid.json
     (isolated test copy: grid env clone development --name <slug> --ttl 24h)
  3. Point the API (grid-core) at this folder:
       ${chalk.cyan(`export GRID_CONFIG_ROOT=${root}`)}
  4. Generate (CLI add-on):
       ${chalk.cyan('grid generate -c development/…/grid.json --config-dir "$GRID_CONFIG_ROOT" -o ./out')}

${chalk.dim('Note: ../demo-infra is a test fixture only — not your production config root.')}
`);
      } catch (error) {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}
