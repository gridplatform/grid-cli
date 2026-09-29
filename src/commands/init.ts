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

/** Clouds scaffolded by grid init (same layout as grid-config / demo-infra). */
const INIT_CLOUDS = ['aws', 'gcp'] as const;

/**
 * grid init — scaffold desired-state: <cloud>/<env>/<type>/<name>.json
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

        for (const cloud of INIT_CLOUDS) {
          for (const env of ENV_FOLDERS) {
            const folder = path.join(root, cloud, env);
            await fs.ensureDir(folder);
            const keep = path.join(folder, '.gitkeep');
            if (!(await fs.pathExists(keep))) {
              await fs.writeFile(keep, '');
            }
          }
        }

        await writeProjectMarker(root);

        const gi = path.join(root, '.gitignore');
        if (!(await fs.pathExists(gi))) {
          await fs.writeFile(
            gi,
            `# Grid local state
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

Configuration root (\`GRID_CONFIG_ROOT\`). Layout matches platform desired-state:

\`\`\`text
<cloud>/                         # aws | gcp | …
  <environment>/                 # development | staging | production
    <infra-type>/                # vpc | ec2 | s3 | …
      <name>.json                # intent
archive/<cloud>/…/<name>/        # Terraform buffer (grid generate)
\`\`\`

Ephemeral copy of an env (TTL):

\`\`\`bash
grid env clone development --name try-rds --ttl 24h
\`\`\`

\`\`\`bash
export GRID_CONFIG_ROOT=${root}
\`\`\`
`
          );
        }

        if (options.sample) {
          const sampleDir = path.join(root, 'aws', 'development', 'vpc');
          await fs.ensureDir(sampleDir);
          const sampleJson = path.join(sampleDir, 'example-vpc.json');
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
                  description: 'Sample stack from grid init --sample',
                },
                resources: [
                  {
                    type: 'vpc',
                    name: 'example-vpc',
                    cidr: '10.60.0.0/16',
                    description: 'Example VPC',
                    enable_nat_gateway: false,
                    private_subnets: [],
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
        console.log(chalk.gray(`  layout: <cloud>/{${ENV_FOLDERS.join(',')}}/…`));
        console.log(`
${chalk.bold('Normal workflow')}
  1. Add units under aws|gcp / development|staging|production / <type> / <name>.json
  2. export GRID_CONFIG_ROOT=${root}
  3. grid generate -c aws/development/vpc/<name>.json --config-dir "$GRID_CONFIG_ROOT" -o ./out
`);
      } catch (error) {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}
