import type { GridConfig } from '../validators/config';
import type { ModuleCopySpec } from '../generators/terraform/moduleBank';

/**
 * Stable provider IDs used in grid.json `provider` field.
 * Add new clouds here first, then implement an adapter when ready.
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
 * Generate pipeline only talks to this interface — never to cloud-specific files directly.
 */
export interface ProviderAdapter {
  id: ProviderId;
  /** Display name */
  label: string;
  status: ProviderStatus;
  /** Default region/zone hint for demos */
  defaultRegion: string;
  /** Folder under grid-terraform (e.g. "aws") */
  moduleRoot: string;
  /** Modules copied for a Day-1 generate of this provider */
  moduleSpecsForGenerate: ModuleCopySpec[];
  renderResources(config: GridConfig, region: string): string;
  renderOutputs(config: GridConfig): string;
  renderProviderBlock(config: GridConfig): string;
  /**
   * Optional note shown when status !== supported
   */
  statusMessage?: string;
}
