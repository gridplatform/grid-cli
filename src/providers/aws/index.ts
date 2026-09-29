import type { GridConfig } from '../../validators/config';
import type { ProviderAdapter } from '../types';

/** Same generate path as every other cloud — catalog only. */
export const awsProvider: ProviderAdapter = {
  id: 'aws',
  label: 'Amazon Web Services',
  status: 'supported',
  defaultRegion: 'ap-south-1',
  moduleRoot: 'aws',
  renderProviderBlock(_config: GridConfig): string {
    return `terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  required_version = ">= 1.0"
}

provider "aws" {
  region = var.region
}
`;
  },
};
