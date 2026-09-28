import {
  GridConfig,
  isSubnetResource,
  isVmResource,
  isVpcResource,
} from '../../validators/config';
import { renderModuleCall } from './hcl';
import type { ModuleCopySpec } from './moduleBank';

export const GCP_MODULE_SPECS: ModuleCopySpec[] = [
  { bankPath: 'gcp/network', destPath: 'gcp/network' },
  { bankPath: 'gcp/compute-engine-instance', destPath: 'gcp/compute-engine-instance' },
];

/**
 * Render GCP using module bank:
 * - gcp/network (VPC + subnets)
 * - gcp/compute-engine-instance
 *
 * Requires config.project and, for each VM, metadata.serviceAccountEmail
 * (or resource field serviceAccountEmail once schema is extended).
 */
export function renderGcpResources(config: GridConfig, defaultRegion: string): string {
  const blocks: string[] = [];
  const vpcs = config.resources.filter(isVpcResource);
  const subnets = config.resources.filter(isSubnetResource);
  const vms = config.resources.filter(isVmResource);

  for (const vpc of vpcs) {
    const vpcSubnets = subnets.filter((s) => s.vpc === vpc.name);

    const subnetObjects =
      vpcSubnets.length > 0
        ? vpcSubnets.map((s) => {
            return {
              raw: `{ subnet_name = "${s.name}", subnet_ip = "${s.cidr}", subnet_region = "${s.region || defaultRegion}", description = "${s.description || ''}" }`,
            };
          })
        : [
            {
              raw: `{ subnet_name = "${vpc.name}-subnet", subnet_ip = "10.0.1.0/24", subnet_region = "${defaultRegion}" }`,
            },
          ];

    // renderModuleCall doesn't support list of raw objects well — emit HCL manually for subnets
    const subnetHcl = subnetObjects
      .filter(Boolean)
      .map((o) => `    ${o!.raw}`)
      .join(',\n');

    blocks.push(`module "${vpc.name}_network" {
  source = "./modules/gcp/network"

  project_id              = var.project
  network_name            = "${vpc.name}"
  auto_create_subnetworks = false
  description             = "${vpc.description || ''}"
  subnets = [
${subnetHcl}
  ]
}`);
  }

  for (const vm of vms) {
    const subnetResource = subnets.find((s) => s.name === vm.subnet);
    const vpcName = subnetResource ? subnetResource.vpc : vpcs[0]?.name;

    if (!vpcName) {
      throw new Error(`VM "${vm.name}" could not resolve a VPC`);
    }

    const sa =
      (config.metadata as { serviceAccountEmail?: string } | undefined)?.serviceAccountEmail ||
      process.env.GRID_GCP_SERVICE_ACCOUNT_EMAIL;

    if (!sa) {
      throw new Error(
        `GCP VM "${vm.name}" requires a service account email. ` +
          `Set metadata.serviceAccountEmail in grid.json or GRID_GCP_SERVICE_ACCOUNT_EMAIL.`
      );
    }

    const zone = vm.zone || `${subnetResource?.region || defaultRegion}-a`;
    const subnetName = vm.subnet;

    blocks.push(
      renderModuleCall(`${vm.name}_vm`, {
        source: './modules/gcp/compute-engine-instance',
        project_id: { raw: 'var.project' },
        zone,
        instance_name: vm.name,
        machine_type: vm.machineType || 'e2-micro',
        boot_disk_size_gb: vm.diskSize || 10,
        boot_disk_type: vm.diskType || 'pd-standard',
        gcp_image: vm.image || 'ubuntu-os-cloud/ubuntu-2204-lts',
        subnetwork: {
          raw: `module.${vpcName}_network.subnet_self_links["${subnetName}"]`,
        },
        network_tags: vm.tags || [],
        service_account_email: sa,
        assign_public_ip: true,
        labels: {
          raw: `{ managed-by = "grid-platform" }`,
        },
      })
    );
  }

  return blocks.join('\n\n');
}

export function renderGcpOutputs(config: GridConfig): string {
  const parts: string[] = ['# Outputs', ''];

  for (const resource of config.resources) {
    if (isVpcResource(resource)) {
      parts.push(`output "${resource.name}_network_id" {
  value = module.${resource.name}_network.network_id
}

output "${resource.name}_subnet_self_links" {
  value = module.${resource.name}_network.subnet_self_links
}
`);
    } else if (isVmResource(resource)) {
      parts.push(`output "${resource.name}_vm_id" {
  value = module.${resource.name}_vm.instance_id
}

output "${resource.name}_vm_internal_ip" {
  value = module.${resource.name}_vm.internal_ip
}

output "${resource.name}_vm_external_ip" {
  value = module.${resource.name}_vm.external_ip
}
`);
    }
  }

  return parts.join('\n');
}
