import { Resource } from '../../validators/config';

/**
 * Generate Terraform code for VPC/Network resource
 */
export function generateVpc(resource: Resource): string {
  if (resource.type !== 'vpc') {
    throw new Error('Resource is not a VPC');
  }

  // GCP uses google_compute_network
  // This will be expanded to support AWS VPC and Azure VNet later
  return `resource "google_compute_network" "${resource.name}" {
  name                    = "${resource.name}"
  auto_create_subnetworks = false
  ${resource.description ? `description = "${resource.description}"` : ''}
}
`;
}

