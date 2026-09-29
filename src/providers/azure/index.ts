import type { GridConfig } from '../../validators/config';
import type { ProviderAdapter } from '../types';

/** Same generate path as every other cloud — catalog only. */
export const azureProvider: ProviderAdapter = {
  id: 'azure',
  label: 'Microsoft Azure',
  status: 'coming_soon',
  defaultRegion: 'eastus',
  moduleRoot: 'azure',
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
