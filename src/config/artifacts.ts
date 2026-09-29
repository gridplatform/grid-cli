import path from 'path';
import fs from 'fs-extra';

/** Top-level folder in every desired-state repo that holds generated Terraform. */
export const ARCHIVE_DIR = 'archive';

/** Marker file written into each Terraform buffer directory. */
export const GENERATED_MARKER = '.grid-generated';

/** Root *.tf files regenerated from Grid JSON on every generate (instance / stack code). */
export const ARCHIVE_INSTANCE_FILES = [
  'main.tf',
  'provider.tf',
  'backend.tf',
  'variables.tf',
  'outputs.tf',
] as const;

const ARTIFACT_GITIGNORE = `# Local Terraform runtime — keep instance *.tf + vendored modules/ in Git
.terraform/
*.tfstate
*.tfstate.*
*.tfplan
tfplan
crash.log
crash.*.log
`;

/**
 * Deployable Terraform buffer for one unit JSON (committed under archive/).
 *
 * Intent (humans edit):
 *   <root>/<cloud>/<env>/<type>/<name>.json
 *
 * Instance HCL (CLI regenerates; not the module bank):
 *   <root>/archive/<cloud>/<env>/<type>/<name>/
 *     main.tf, provider.tf, …   — rewritten from JSON
 *     modules/…                 — vendored from GRID_MODULE_BANK (bank is read-only)
 */
export function artifactDirForConfig(configFilePath: string, configRoot: string): string {
  const root = path.resolve(configRoot);
  const abs = path.resolve(configFilePath);
  const rel = path.relative(root, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(
      `Config ${abs} is outside desired-state root ${root}. ` +
        `Pass -o <dir> for scratch output, or put the JSON under the config root.`
    );
  }
  if (rel.split(path.sep)[0] === ARCHIVE_DIR) {
    throw new Error(`Refusing to treat archive path as intent config: ${rel}`);
  }
  const unitPath = rel.replace(/\.json$/i, '');
  return path.join(root, ARCHIVE_DIR, unitPath);
}

/** Relative archive path for a config gitPath like aws/development/vpc/x.json */
export function archiveRelFromGitPath(gitPath: string): string {
  const cleaned = gitPath.replace(/\\/g, '/').replace(/^\.\//, '');
  if (cleaned.startsWith(`${ARCHIVE_DIR}/`)) {
    throw new Error(`gitPath already under archive/: ${gitPath}`);
  }
  return `${ARCHIVE_DIR}/${cleaned.replace(/\.json$/i, '')}`;
}

export async function isGeneratedArtifactDir(dir: string): Promise<boolean> {
  return fs.pathExists(path.join(dir, GENERATED_MARKER));
}

/** Write marker + .gitignore so instance *.tf and modules/ can be committed; state stays local. */
export async function writeArtifactMeta(
  artifactDir: string,
  opts: { configPath: string; format: string }
): Promise<void> {
  await fs.ensureDir(artifactDir);
  await fs.writeJSON(
    path.join(artifactDir, GENERATED_MARKER),
    {
      by: 'grid',
      generatedAt: new Date().toISOString(),
      config: opts.configPath,
      format: opts.format,
      archive: ARCHIVE_DIR,
      role: 'instance-terraform',
      note:
        'Instance Terraform regenerated from Grid JSON on generate/plan/deploy. ' +
        'modules/ is vendored from GRID_MODULE_BANK; the bank is never modified. ' +
        'Without Grid: terraform -chdir=<this-dir> init && plan',
    },
    { spaces: 2 }
  );
  const gi = path.join(artifactDir, '.gitignore');
  if (!(await fs.pathExists(gi))) {
    await fs.writeFile(gi, ARTIFACT_GITIGNORE);
  }
}
