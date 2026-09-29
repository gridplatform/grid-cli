import type { GridConfig } from '../../validators/config';
import type { ProviderAdapter } from '../types';

export const gcpProvider: ProviderAdapter = {
  id: 'gcp',
  label: 'Google Cloud',
  status: 'supported',
  defaultRegion: 'us-central1',
  moduleRoot: 'gcp',
  renderProviderBlock(_config: GridConfig): string {
    return `terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
  required_version = ">= 1.0"
}

provider "google" {
  project = var.project
  region  = var.region
}
`;
  },
};
