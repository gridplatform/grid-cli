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
import { parseEphemeralCloneDirName } from '../project/environments';
import { ARCHIVE_DIR } from '../config/artifacts';

/**
 * grid env — list canonical envs / clone with TTL.
 * Desired-state layout: <cloud>/<env>/<infra-type>/<name>.json
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
          const stacks = await countUnitsForEnv(root, e);
          console.log(
            stacks > 0
              ? chalk.green(`  • ${e}  (${stacks} unit file(s))`)
              : chalk.dim(`  • ${e}  (0 units)`)
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
          const stacks = await countUnitsForEnv(cloneRoot, parsed.baseEnv);
          if (!manifest) {
            console.log(chalk.yellow(`  • ${ent.name}  (${stacks} units, no manifest)`));
            continue;
          }
          const expired = isCloneExpired(manifest);
          const line = `  • ${ent.name}  base=${manifest.baseEnv}  ttl=${manifest.ttl}  expires=${manifest.expiresAt}  units=${stacks}`;
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
      'Copy an environment into .ephemeral/<env>--<name> with a TTL (isolated names; no sandbox env)'
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
          const units = await listUnitFilesForEnv(root, baseEnv);
          if (units.length === 0) {
            throw new Error(
              `No units found for environment "${baseEnv}" under ${root} ` +
                `(expected <cloud>/${baseEnv}/<type>/<name>.json)`
            );
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
          const copied = await copyUnitsToClone(root, dest, units, {
            baseEnv,
            slug,
            nameSuffix: suffix,
          });

          const manifest: CloneManifest = {
            version: 1,
            kind: 'grid-env-clone',
            baseEnv,
            slug,
            sourcePath: baseEnv,
            createdAt: createdAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
            ttl: options.ttl,
          };
          await fs.writeJSON(path.join(dest, '.grid-clone.json'), manifest, { spaces: 2 });

          console.log(chalk.green(`\nCloned ${baseEnv} → ${toPosix(path.relative(root, dest))}`));
          console.log(chalk.gray(`  units:   ${copied}`));
          console.log(chalk.gray(`  TTL:     ${options.ttl} (expires ${manifest.expiresAt})`));
          console.log(chalk.gray(`  names:   resources suffixed with "${suffix}"`));
          console.log(`
${chalk.bold('Next')} (use the clone folder as --config-dir)
  grid generate -c aws/${baseEnv}/ec2/<name>${suffix}.json \\
    --config-dir ${dest} -o ./out
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

/** List <cloud>/<env>/<type>/<file>.json relative paths. */
async function listUnitFilesForEnv(configRoot: string, env: string): Promise<string[]> {
  const found: string[] = [];
  if (!(await fs.pathExists(configRoot))) return found;
  const top = await fs.readdir(configRoot, { withFileTypes: true });
  for (const cloudEnt of top) {
    if (!cloudEnt.isDirectory()) continue;
    if (cloudEnt.name.startsWith('.') || cloudEnt.name === 'scripts' || cloudEnt.name === ARCHIVE_DIR) {
      continue;
    }
    if ((CANONICAL_ENVIRONMENTS as readonly string[]).includes(cloudEnt.name)) continue;
    const envDir = path.join(configRoot, cloudEnt.name, env);
    if (!(await fs.pathExists(envDir))) continue;
    const types = await fs.readdir(envDir, { withFileTypes: true });
    for (const typeEnt of types) {
      if (!typeEnt.isDirectory()) continue;
      const typeDir = path.join(envDir, typeEnt.name);
      const files = await fs.readdir(typeDir);
      for (const f of files) {
        if (!f.endsWith('.json') || f.startsWith('.')) continue;
        found.push(toPosix(path.join(cloudEnt.name, env, typeEnt.name, f)));
      }
    }
  }
  return found.sort();
}

async function countUnitsForEnv(configRoot: string, env: string): Promise<number> {
  return (await listUnitFilesForEnv(configRoot, env)).length;
}

async function copyUnitsToClone(
  configRoot: string,
  cloneRoot: string,
  relPaths: string[],
  opts: { baseEnv: CanonicalEnvironment; slug: string; nameSuffix: string }
): Promise<number> {
  const pathMap = new Map<string, string>();
  for (const rel of relPaths) {
    const parts = rel.split('/');
    // cloud/env/type/file.json
    if (parts.length < 4) continue;
    const file = parts[parts.length - 1];
    const base = file.replace(/\.json$/, '');
    const newFile = `${base}${opts.nameSuffix}.json`;
    const newRel = [...parts.slice(0, -1), newFile].join('/');
    pathMap.set(rel, newRel);
  }

  let copied = 0;
  for (const rel of relPaths) {
    const newRel = pathMap.get(rel);
    if (!newRel) continue;
    const src = path.join(configRoot, rel);
    const dest = path.join(cloneRoot, newRel);
    await fs.ensureDir(path.dirname(dest));
    const raw = (await fs.readJSON(src)) as Record<string, unknown>;
    const rewritten = rewriteCloneConfig(raw, opts, pathMap);
    await fs.writeJSON(dest, rewritten, { spaces: 2 });
    copied += 1;
  }
  return copied;
}

function rewriteCloneConfig(
  config: Record<string, unknown>,
  opts: { baseEnv: CanonicalEnvironment; slug: string; nameSuffix: string },
  pathMap: Map<string, string>
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
  meta.clone = { of: opts.baseEnv, slug: opts.slug, isolated: true };

  if (Array.isArray(meta.dependsOn)) {
    meta.dependsOn = meta.dependsOn.map((d) => {
      if (typeof d !== 'string') return d;
      return pathMap.get(toPosix(d)) || d;
    });
  }

  return {
    ...config,
    metadata: meta,
    resources: nextResources,
  };
}
