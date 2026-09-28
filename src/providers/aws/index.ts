import type { GridConfig } from '../../validators/config';
import {
  AWS_MODULE_SPECS,
  renderAwsOutputs,
  renderAwsResources,
} from '../../generators/terraform/awsResources';
import type { ProviderAdapter } from '../types';

export const awsProvider: ProviderAdapter = {
  id: 'aws',
  label: 'Amazon Web Services',
  status: 'supported',
  defaultRegion: 'ap-south-1',
  moduleRoot: 'aws',
  moduleSpecsForGenerate: AWS_MODULE_SPECS,
  renderResources: renderAwsResources,
  renderOutputs: renderAwsOutputs,
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
