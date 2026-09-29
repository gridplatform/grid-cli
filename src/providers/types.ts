import type { GridConfig } from '../validators/config';

/**
 * Stable provider IDs used in unit JSON `provider` field.
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
 * Cloud adapter: identity + Terraform `provider` block only.
 * Resource HCL always goes through the shared catalog (see generators/terraform/).
 */
export interface ProviderAdapter {
  id: ProviderId;
  label: string;
  /**
   * Discovery metadata for `grid providers` / UI — does not block generate.
   * Apply still needs module bank + credentials.
   */
  status: ProviderStatus;
  defaultRegion: string;
  /** Folder under grid-terraform (e.g. "aws") */
  moduleRoot: string;
  renderProviderBlock(config: GridConfig): string;
  statusMessage?: string;
}
