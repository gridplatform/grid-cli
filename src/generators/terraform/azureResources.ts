import { GridConfig } from '../../validators/config';
import { renderModuleCall } from './hcl';
import type { ModuleCopySpec } from './moduleBank';

export const AZURE_MODULE_SPECS: ModuleCopySpec[] = [
  { bankPath: 'azure/network', destPath: 'azure/network' },
  { bankPath: 'azure/virtual-machine', destPath: 'azure/virtual-machine' },
];

/**
 * Render Azure using module bank:
 * - azure/network (VNet + subnets)
 * - azure/virtual-machine
 *
 * Creates an azurerm_resource_group in the generated root for Day-1 demos.
 * Requires metadata.adminSshPublicKey (or GRID_AZURE_SSH_PUBLIC_KEY) for Linux VMs.
 */
export function renderAzureResources(config: GridConfig, defaultRegion: string): string {
  const blocks: string[] = [];
  const location = defaultRegion || 'eastus';
  const rgName = `grid-${config.project}-rg`;

  blocks.push(`resource "azurerm_resource_group" "grid" {
  name     = "${rgName}"
  location = "${location}"
  tags     = { ManagedBy = "grid-platform" }
}`);

  const vpcs = config.resources.filter((r) => r.type === 'vpc');
  const subnets = config.resources.filter((r) => r.type === 'subnet');
  const vms = config.resources.filter((r) => r.type === 'vm');

  for (const vpc of vpcs) {
    if (vpc.type !== 'vpc') continue;
    const vpcSubnets = subnets.filter((s) => s.type === 'subnet' && s.vpc === vpc.name);

    const subnetMapEntries =
      vpcSubnets.length > 0
        ? vpcSubnets
            .map((s) =>
              s.type === 'subnet'
                ? `    "${s.name}" = { address_prefix = "${s.cidr}" }`
                : ''
            )
            .filter(Boolean)
            .join('\n')
        : `    "default" = { address_prefix = "10.0.1.0/24" }`;

    blocks.push(`module "${vpc.name}_network" {
  source = "./modules/azure/network"

  vnet_name           = "${vpc.name}"
  resource_group_name = azurerm_resource_group.grid.name
  location            = azurerm_resource_group.grid.location
  address_space       = ["${vpc.cidr}"]
  subnets = {
${subnetMapEntries}
  }
  tags = { ManagedBy = "grid-platform" }
}`);
  }

  for (const vm of vms) {
    if (vm.type !== 'vm') continue;
    const subnetResource = subnets.find((s) => s.name === vm.subnet);
    const vpcName =
      subnetResource && subnetResource.type === 'subnet'
        ? subnetResource.vpc
        : vpcs[0]?.type === 'vpc'
          ? vpcs[0].name
          : null;

    if (!vpcName) {
      throw new Error(`VM "${vm.name}" could not resolve a VNet`);
    }

    const sshKey =
      (config.metadata as { adminSshPublicKey?: string } | undefined)?.adminSshPublicKey ||
      process.env.GRID_AZURE_SSH_PUBLIC_KEY;

    if (!sshKey) {
      throw new Error(
        `Azure VM "${vm.name}" requires an SSH public key. ` +
          `Set metadata.adminSshPublicKey in grid.json or GRID_AZURE_SSH_PUBLIC_KEY.`
      );
    }

    const subnetKey = vm.subnet;

    blocks.push(
      renderModuleCall(`${vm.name}_vm`, {
        source: './modules/azure/virtual-machine',
        vm_name: vm.name,
        resource_group_name: { raw: 'azurerm_resource_group.grid.name' },
        location: { raw: 'azurerm_resource_group.grid.location' },
        subnet_id: {
          raw: `module.${vpcName}_network.subnet_ids["${subnetKey}"]`,
        },
        vm_size: vm.machineType || 'Standard_B1s',
        os_type: 'linux',
        admin_username: 'gridadmin',
        admin_ssh_public_key: sshKey,
        os_disk_size_gb: vm.diskSize || 30,
        tags: {
          raw: `{ ManagedBy = "grid-platform" }`,
        },
      })
    );
  }

  return blocks.join('\n\n');
}

export function renderAzureOutputs(config: GridConfig): string {
  const parts: string[] = [
    '# Outputs',
    '',
    `output "resource_group_name" {
  value = azurerm_resource_group.grid.name
}
`,
  ];

  for (const resource of config.resources) {
    if (resource.type === 'vpc') {
      parts.push(`output "${resource.name}_vnet_id" {
  value = module.${resource.name}_network.vnet_id
}
`);
    } else if (resource.type === 'vm') {
      parts.push(`output "${resource.name}_vm_id" {
  value = module.${resource.name}_vm.vm_id
}
`);
    }
  }

  return parts.join('\n');
}
