/**
 * Canonical Grid environments — only these three.
 * Temporary copies of an env live under `.ephemeral/` (see env clone), not as a 4th env.
 */
export const CANONICAL_ENVIRONMENTS = ['development', 'staging', 'production'] as const;
export type CanonicalEnvironment = (typeof CANONICAL_ENVIRONMENTS)[number];

export const ENV_FOLDERS = CANONICAL_ENVIRONMENTS;

export const EPHEMERAL_DIR = '.ephemeral';

export function isCanonicalEnvironment(value: string): value is CanonicalEnvironment {
  return (CANONICAL_ENVIRONMENTS as readonly string[]).includes(value);
}

/** Clone folder name: development--try-rds */
export function ephemeralCloneDirName(baseEnv: CanonicalEnvironment, slug: string): string {
  return `${baseEnv}--${slug}`;
}

export function parseEphemeralCloneDirName(
  dirName: string
): { baseEnv: CanonicalEnvironment; slug: string } | null {
  const m = /^(development|staging|production)--([a-z0-9][a-z0-9-]{0,62})$/.exec(dirName);
  if (!m) return null;
  return { baseEnv: m[1] as CanonicalEnvironment, slug: m[2] };
}
