import type { GridConfig } from '../validators/config';

/**
 * Stable provider IDs used in grid.json `provider` field.
 * Add new clouds here first, then register an adapter.
 */
export type ProviderId =
  | 'aws'
  | 'gcp'
  | 'azure'
  | 'oracle'
  | 'ibm'
  | 'alibaba'
  | 'tencent'
  | 'huawei'
  | 'ovh'
  | 'deutsche-telekom'
  | 'ctrls'
  | 'yotta'
  | 'rancher'
  | 'openshift';

export const PROVIDER_IDS: readonly ProviderId[] = [
  'aws',
  'gcp',
  'azure',
  'oracle',
  'ibm',
  'alibaba',
  'tencent',
  'huawei',
  'ovh',
  'deutsche-telekom',
  'ctrls',
  'yotta',
  'rancher',
  'openshift',
] as const;

export type ProviderStatus = 'supported' | 'coming_soon' | 'planned';

/**
 * One cloud/platform adapter.
 *
 * Generate uses the same catalog path for every provider. Adapters only supply
 * identity + the Terraform `provider` block — never cloud-specific generators.
 * See generators/terraform/README.md.
 */
export interface ProviderAdapter {
  id: ProviderId;
  label: string;
  /**
   * Discovery metadata for `grid providers` / UI — does NOT block generate.
   * Apply still needs module bank + credentials.
   */
  status: ProviderStatus;
  defaultRegion: string;
  /** Folder under grid-terraform (e.g. "aws") */
  moduleRoot: string;
  renderProviderBlock(config: GridConfig): string;
  statusMessage?: string;
}
