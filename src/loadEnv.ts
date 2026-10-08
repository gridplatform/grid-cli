import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

export type GridAppEnv = 'development' | 'production';

/**
 * CLI env loading only — no production boot gate.
 *
 * Hard production checks live on **grid-core** (and install/Compose). Core spawns
 * the CLI with `cliChildEnv()` after it has already validated production config.
 * `npm run build` is compile-only and does not need runtime env.
 */
export function resolveAppEnv(): GridAppEnv {
  const raw = (
    process.env.GRID_APP_ENV ||
    process.env.GRID_ENV ||
    (process.env.NODE_ENV === 'production' ? 'production' : 'development')
  )
    .trim()
    .toLowerCase();
  return raw === 'production' || raw === 'prod' ? 'production' : 'development';
}

/**
 * File name is the mode:
 * - development → `.env.development`
 * - production  → `.env` (optional; usually inherited from Core)
 */
export function loadAppEnv(cwd = process.cwd()): GridAppEnv {
  const appEnv = resolveAppEnv();
  process.env.GRID_APP_ENV = appEnv;

  const file =
    appEnv === 'development'
      ? path.join(cwd, '.env.development')
      : path.join(cwd, '.env');

  if (fs.existsSync(file)) {
    dotenv.config({ path: file, override: true });
  } else if (appEnv === 'development' && fs.existsSync(path.join(cwd, '.env'))) {
    console.warn(
      '[grid-cli] GRID_APP_ENV=development but .env.development is missing — falling back to .env'
    );
    dotenv.config({ path: path.join(cwd, '.env'), override: true });
  }

  process.env.GRID_APP_ENV = appEnv;
  return appEnv;
}
