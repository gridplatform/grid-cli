import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { resolveConfigRoot, toPosix } from '../inventory/store';
import {
  CANONICAL_ENVIRONMENTS,
  EPHEMERAL_DIR,
  assertCanonicalEnv,
  cloneRootPath,
  isCloneExpired,
  parseTtlToMs,
  readCloneManifest,
  type CloneManifest,
  type CanonicalEnvironment,
} from '../project/marker';
import { ephemeralCloneDirName, parseEphemeralCloneDirName } from '../project/environments';

/**
 * grid env — list canonical envs / clone development (etc.) with TTL for isolated tests.
 * No sandbox env: use clones under .ephemeral/ so shared development is not contested.
 */
export function envCommand(program: Command) {
  const env = program.command('env').description('Canonical environments and ephemeral clones');

  env
    .command('list')
    .description('List development|staging|production and any .ephemeral clones')
    .option('--config-dir <path>', 'Desired-state root (GRID_CONFIG_ROOT)')
    .action(async (options: { configDir?: string }) => {
      try {
        const root = resolveConfigRoot(options.configDir);
        console.log(chalk.bold(`\nCanonical environments (${root})\n`));
        for (const e of CANONICAL_ENVIRONMENTS) {
          const dir = path.join(root, e);
          const exists = await fs.pathExists(dir);
          const stacks = exists ? await countStacks(dir) : 0;
          console.log(
            exists
              ? chalk.green(`  • ${e}  (${stacks} stack folder(s))`)
              : chalk.dim(`  • ${e}  (missing — run grid init)`)
          );
        }

        const eph = path.join(root, EPHEMERAL_DIR);
        console.log(chalk.bold(`\nEphemeral clones (${EPHEMERAL_DIR}/)\n`));
        if (!(await fs.pathExists(eph))) {
          console.log(chalk.dim('  (none — grid env clone development --name <slug> --ttl 24h)'));
          console.log('');
          return;
        }
        const entries = await fs.readdir(eph, { withFileTypes: true });
        let any = false;
        for (const ent of entries) {
          if (!ent.isDirectory()) continue;
          const parsed = parseEphemeralCloneDirName(ent.name);
          if (!parsed) continue;
          any = true;
          const cloneRoot = path.join(eph, ent.name);
          const manifest = await readCloneManifest(cloneRoot);
          const stacks = await countStacks(cloneRoot);
          if (!manifest) {
            console.log(chalk.yellow(`  • ${ent.name}  (${stacks} stacks, no manifest)`));
            continue;
          }
          const expired = isCloneExpired(manifest);
          const line = `  • ${ent.name}  base=${manifest.baseEnv}  ttl=${manifest.ttl}  expires=${manifest.expiresAt}  stacks=${stacks}`;
          console.log(expired ? chalk.red(`${line}  EXPIRED`) : chalk.cyan(line));
        }
        if (!any) console.log(chalk.dim('  (none)'));
        console.log('');
      } catch (error) {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  env
    .command('clone')
    .description(
      'Copy an environment (e.g. development) into .ephemeral/<env>--<name> with a TTL so tests do not contest shared resources'
    )
    .argument('<base>', 'Canonical env to copy: development | staging | production')
    .requiredOption('--name <slug>', 'Clone slug (letters, numbers, dashes)')
    .option('--ttl <duration>', 'Time to live (e.g. 2h, 24h, 7d)', '24h')
    .option('--config-dir <path>', 'Desired-state root')
    .option('--force', 'Overwrite an existing clone with the same name', false)
    .action(
      async (
        base: string,
        options: { name: string; ttl: string; configDir?: string; force?: boolean }
      ) => {
        try {
          const baseEnv = assertCanonicalEnv(base);
          const slug = normalizeSlug(options.name);
          const root = resolveConfigRoot(options.configDir);
          const sourceDir = path.join(root, baseEnv);
          if (!(await fs.pathExists(sourceDir))) {
            throw new Error(`Source env folder not found: ${sourceDir}`);
          }

          const dest = cloneRootPath(root, baseEnv, slug);
          if ((await fs.pathExists(dest)) && !options.force) {
            throw new Error(`Clone already exists: ${dest} (use --force to replace)`);
          }

          const ttlMs = parseTtlToMs(options.ttl);
          const createdAt = new Date();
          const expiresAt = new Date(createdAt.getTime() + ttlMs);

          await fs.remove(dest);
          await fs.ensureDir(dest);

          const suffix = `-${slug}`;
          const copied = await copyEnvStacks(sourceDir, dest, {
            baseEnv,
            slug,
            nameSuffix: suffix,
          });

          const manifest: CloneManifest = {
            version: 1,
            kind: 'grid-env-clone',
            baseEnv,
            slug,
            sourcePath: toPosix(path.relative(root, sourceDir)),
            createdAt: createdAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
            ttl: options.ttl,
          };
          await fs.writeJSON(path.join(dest, '.grid-clone.json'), manifest, { spaces: 2 });

          console.log(chalk.green(`\nCloned ${baseEnv} → ${toPosix(path.relative(root, dest))}`));
          console.log(chalk.gray(`  stacks:  ${copied}`));
          console.log(chalk.gray(`  TTL:     ${options.ttl} (expires ${manifest.expiresAt})`));
          console.log(chalk.gray(`  names:   resources suffixed with "${suffix}" to avoid collisions`));
          console.log(`
${chalk.bold('Next')}
  grid generate -c ${EPHEMERAL_DIR}/${ephemeralCloneDirName(baseEnv, slug)}/<stack>/grid.json \\
    --config-dir ${root} -o ./out

  When done (or after TTL): remove the folder or grid env prune-expired
`);
        } catch (error) {
          console.error(chalk.red(error instanceof Error ? error.message : String(error)));
          process.exit(1);
        }
      }
    );

  env
    .command('prune-expired')
    .description('Delete ephemeral clones whose TTL has expired (files only — does not terraform destroy)')
    .option('--config-dir <path>', 'Desired-state root')
    .option('--yes', 'Skip confirmation', false)
    .action(async (options: { configDir?: string; yes?: boolean }) => {
      try {
        const root = resolveConfigRoot(options.configDir);
        const eph = path.join(root, EPHEMERAL_DIR);
        if (!(await fs.pathExists(eph))) {
          console.log(chalk.green('No ephemeral clones.'));
          return;
        }
        const expired: string[] = [];
        for (const ent of await fs.readdir(eph, { withFileTypes: true })) {
          if (!ent.isDirectory()) continue;
          const cloneRoot = path.join(eph, ent.name);
          const manifest = await readCloneManifest(cloneRoot);
          if (manifest && isCloneExpired(manifest)) expired.push(ent.name);
        }
        if (expired.length === 0) {
          console.log(chalk.green('No expired clones.'));
          return;
        }
        console.log(chalk.yellow(`Expired clones (${expired.length}):`));
        for (const n of expired) console.log(`  • ${n}`);
        if (!options.yes) {
          console.log(chalk.gray('\nRe-run with --yes to delete these folders (terraform destroy is separate).'));
          return;
        }
        for (const n of expired) {
          await fs.remove(path.join(eph, n));
          console.log(chalk.green(`Removed ${n}`));
        }
      } catch (error) {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}

function normalizeSlug(raw: string): string {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  if (!slug || !/^[a-z0-9]/.test(slug)) {
    throw new Error('--name must start with a letter or digit (e.g. try-rds, alice-feat)');
  }
  return slug;
}

async function countStacks(envDir: string): Promise<number> {
  const entries = await fs.readdir(envDir, { withFileTypes: true });
  let n = 0;
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (ent.name.startsWith('.')) continue;
    if (await fs.pathExists(path.join(envDir, ent.name, 'grid.json'))) n += 1;
  }
  return n;
}

async function copyEnvStacks(
  sourceEnvDir: string,
  destEnvDir: string,
  opts: { baseEnv: CanonicalEnvironment; slug: string; nameSuffix: string }
): Promise<number> {
  const entries = await fs.readdir(sourceEnvDir, { withFileTypes: true });
  let copied = 0;
  for (const ent of entries) {
    if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
    const srcJson = path.join(sourceEnvDir, ent.name, 'grid.json');
    if (!(await fs.pathExists(srcJson))) continue;

    const destStack = `${ent.name}${opts.nameSuffix}`;
    const destDir = path.join(destEnvDir, destStack);
    await fs.ensureDir(destDir);

    const raw = (await fs.readJSON(srcJson)) as Record<string, unknown>;
    const rewritten = rewriteCloneConfig(raw, opts);
    await fs.writeJSON(path.join(destDir, 'grid.json'), rewritten, { spaces: 2 });
    copied += 1;
  }
  if (copied === 0) {
    throw new Error(`No grid.json stacks found under ${sourceEnvDir}`);
  }
  return copied;
}

/** Suffix resource names + fix vpc/subnet refs; tag metadata.clone with TTL context. */
function rewriteCloneConfig(
  config: Record<string, unknown>,
  opts: { baseEnv: CanonicalEnvironment; slug: string; nameSuffix: string }
): Record<string, unknown> {
  const resources = Array.isArray(config.resources) ? config.resources : [];
  const nameMap = new Map<string, string>();

  for (const r of resources) {
    if (!r || typeof r !== 'object') continue;
    const rec = r as Record<string, unknown>;
    if (typeof rec.name === 'string') {
      nameMap.set(rec.name, `${rec.name}${opts.nameSuffix}`);
    }
  }

  const nextResources = resources.map((r) => {
    if (!r || typeof r !== 'object') return r;
    const rec = { ...(r as Record<string, unknown>) };
    if (typeof rec.name === 'string') rec.name = nameMap.get(rec.name) || rec.name;
    if (typeof rec.vpc === 'string' && nameMap.has(rec.vpc)) rec.vpc = nameMap.get(rec.vpc);
    if (typeof rec.subnet === 'string' && nameMap.has(rec.subnet)) {
      rec.subnet = nameMap.get(rec.subnet);
    }
    return rec;
  });

  const meta =
    config.metadata && typeof config.metadata === 'object'
      ? { ...(config.metadata as Record<string, unknown>) }
      : {};
  if (typeof meta.name === 'string') {
    meta.name = `${meta.name}${opts.nameSuffix}`;
  }
  meta.environment = opts.baseEnv;
  meta.clone = {
    of: opts.baseEnv,
    slug: opts.slug,
    isolated: true,
  };

  return {
    ...config,
    metadata: meta,
    resources: nextResources,
  };
}
