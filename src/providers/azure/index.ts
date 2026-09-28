import type { GridConfig } from '../../validators/config';
import type { ModuleCopySpec } from '../../generators/terraform/moduleBank';
import type { ProviderAdapter } from '../types';

/** Composer modules for vpc / subnet / vm, which Azure does not implement yet. */
const AZURE_SPECS: ModuleCopySpec[] = [
  { bankPath: 'azure/network', destPath: 'azure/network' },
  { bankPath: 'azure/virtual-machine', destPath: 'azure/virtual-machine' },
];

const COMPOSER_UNSUPPORTED =
  'Azure has no vpc/subnet/vm composer yet. Use the Azure catalog types ' +
  '(for example virtual-network, storage-account) which generate through the module bank.';

/**
 * Azure generates through the generic catalog path. The vpc / subnet / vm
 * composers are the one gap, so those types still raise a clear error.
 */
export const azureProvider: ProviderAdapter = {
  id: 'azure',
  label: 'Microsoft Azure',
  status: 'supported',
  defaultRegion: 'eastus',
  moduleRoot: 'azure',
  moduleSpecsForGenerate: AZURE_SPECS,
  renderResources(): string {
    throw new Error(COMPOSER_UNSUPPORTED);
  },
  renderOutputs(): string {
    throw new Error(COMPOSER_UNSUPPORTED);
  },
  renderProviderBlock(_config: GridConfig): string {
    return `terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
  required_version = ">= 1.0"
}

provider "azurerm" {
  features {}
}
`;
  },
};
