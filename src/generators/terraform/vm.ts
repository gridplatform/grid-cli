import { Resource } from '../../validators/config';

/**
 * Generate Terraform code for VM/Compute Instance resource
 */
export function generateVm(resource: Resource, provider: 'gcp' | 'aws' | 'azure'): string {
  if (resource.type !== 'vm') {
    throw new Error('Resource is not a VM');
  }

  // GCP implementation (AWS EC2 and Azure VM to be added in Month 2)
  if (provider === 'gcp') {
    const zone = resource.zone || 'us-central1-a';
    const image = resource.image || 'ubuntu-os-cloud/ubuntu-2204-lts';
    const diskSize = resource.diskSize || 10;
    const diskType = resource.diskType || 'pd-standard';
    
    return `resource "google_compute_instance" "${resource.name}" {
  name         = "${resource.name}"
  machine_type = "${resource.machineType}"
  zone         = "${zone}"

  boot_disk {
    initialize_params {
      image = "${image}"
      size  = ${diskSize}
      type  = "${diskType}"
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.${resource.subnet}.id
    access_config {
      // Ephemeral public IP
    }
  }

  ${resource.tags && resource.tags.length > 0 
    ? `tags = [${resource.tags.map(t => `"${t}"`).join(', ')}]` 
    : ''}
  
  ${resource.description ? `labels = {\n    description = "${resource.description}"\n  }` : ''}
}
`;
  }

  // Placeholder for AWS and Azure
  throw new Error(`VM generation for ${provider} is not yet implemented`);
}

