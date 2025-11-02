import { Resource } from '../../validators/config';

/**
 * Generate Terraform code for Subnet resource
 */
export function generateSubnet(resource: Resource, provider: 'gcp' | 'aws' | 'azure'): string {
  if (resource.type !== 'subnet') {
    throw new Error('Resource is not a subnet');
  }

  // GCP implementation (AWS and Azure to be added in Month 2)
  if (provider === 'gcp') {
    return `resource "google_compute_subnetwork" "${resource.name}" {
  name          = "${resource.name}"
  ip_cidr_range = "${resource.cidr}"
  network       = google_compute_network.${resource.vpc}.id
  ${resource.region ? `region = "${resource.region}"` : ''}
  ${resource.description ? `description = "${resource.description}"` : ''}
}
`;
  }

  // Placeholder for AWS and Azure
  throw new Error(`Subnet generation for ${provider} is not yet implemented`);
}

