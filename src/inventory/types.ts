import { createHash } from 'crypto';

export interface InventoryUnit {
  /** Stable id from relative config path */
  id: string;
  /** Path relative to config root, posix-style */
  configPath: string;
  /** Absolute workspace with generated Terraform + state */
  workspaceDir: string;
  /** Hash of config JSON last recorded as applied */
  contentHash: string;
  name: string;
  provider: string;
  environment: string;
  lastAppliedAt?: string;
  status: 'applied' | 'pending' | 'stale';
}

export interface InventoryFile {
  version: 1;
  configRoot: string;
  updatedAt: string;
  units: InventoryUnit[];
}

export type DesiredUnit = {
  configPath: string;
  absPath: string;
  contentHash: string;
  name: string;
  provider: string;
  environment: string;
  config: Record<string, unknown>;
};

export type ConfigDiff = {
  added: DesiredUnit[];
  changed: Array<{ desired: DesiredUnit; unit: InventoryUnit }>;
  unchanged: Array<{ desired: DesiredUnit; unit: InventoryUnit }>;
  /** Applied (or tracked) units whose JSON file is gone */
  stale: InventoryUnit[];
};

export function unitIdForConfigPath(configPath: string): string {
  return createHash('sha256').update(configPath.split(pathSep()).join('/')).digest('hex').slice(0, 32);
}

function pathSep(): string {
  return '/';
}

export function hashConfig(config: unknown): string {
  return createHash('sha256').update(stableStringify(config)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}
