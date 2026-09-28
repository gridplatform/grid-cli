import {
  GridConfig,
  isSubnetResource,
  isVmResource,
  isVpcResource,
} from '../../validators/config';
import { renderModuleCall } from './hcl';
import type { ModuleCopySpec } from './moduleBank';

/** Modules copied from Terrafrom-Module for an AWS generate. */
export const AWS_MODULE_SPECS: ModuleCopySpec[] = [
  { bankPath: 'aws/vpc', destPath: 'aws/vpc' },
  { bankPath: 'aws/security-group', destPath: 'aws/security-group' },
  { bankPath: 'aws/ec2-instance', destPath: 'aws/ec2-instance' },
];

/**
 * Render AWS resources using the module bank contracts:
 * - aws/vpc (VPC + public/private subnets)
 * - aws/security-group
 * - aws/ec2-instance
 *
 * Grid JSON still uses vpc / subnet / vm types; subnets are folded into the VPC module.
 * Demo default: public subnets only, NAT disabled (cost control).
 */
export function renderAwsResources(config: GridConfig, defaultRegion: string): string {
  const blocks: string[] = [];
  const region = defaultRegion;
  const vpcs = config.resources.filter(isVpcResource);
  const subnets = config.resources.filter(isSubnetResource);
  const vms = config.resources.filter(isVmResource);

  // Shared AMI lookup for EC2 modules that need an AMI ID
  if (vms.length > 0) {
    blocks.push(`data "aws_ami" "grid_al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}`);
  }

  for (const vpc of vpcs) {
    const vpcSubnets = subnets.filter((s) => s.vpc === vpc.name);
    const publicCidrs =
      vpcSubnets.length > 0
        ? vpcSubnets.map((s) => s.cidr).filter(Boolean)
        : [cidrSibling(vpc.cidr, 1)];

    // One AZ per public subnet CIDR (cheap demo)
    const azs = publicCidrs.map((_, i) => `${region}${String.fromCharCode(97 + i)}`);

    blocks.push(
      renderModuleCall(`${vpc.name}_vpc`, {
        source: './modules/aws/vpc',
        name: vpc.name,
        cidr: vpc.cidr,
        azs,
        public_subnets: publicCidrs,
        private_subnets: [],
        enable_nat_gateway: false,
        single_nat_gateway: true,
        map_public_ip_on_launch: true,
        tags: {
          raw: `{ ManagedBy = "grid-platform", Name = "${vpc.name}" }`,
        },
      })
    );
  }

  for (const vm of vms) {
    const subnetResource = subnets.find((s) => s.name === vm.subnet);
    const vpcName = subnetResource ? subnetResource.vpc : vpcs[0]?.name;

    if (!vpcName) {
      throw new Error(`VM "${vm.name}" could not resolve a VPC (check subnet.vpc)`);
    }

    const subnetIndex = Math.max(
      0,
      subnets.filter((s) => s.vpc === vpcName).findIndex((s) => s.name === vm.subnet)
    );

    blocks.push(
      renderModuleCall(`${vm.name}_sg`, {
        source: './modules/aws/security-group',
        name: `${vm.name}-sg`,
        description: `Grid demo SG for ${vm.name}`,
        vpc_id: { raw: `module.${vpcName}_vpc.vpc_id` },
        ingress_rules: {
          raw: `[
    { from_port = 22, to_port = 22, protocol = "tcp", cidr_blocks = ["0.0.0.0/0"], description = "SSH" },
    { from_port = 80, to_port = 80, protocol = "tcp", cidr_blocks = ["0.0.0.0/0"], description = "HTTP" },
    { from_port = 443, to_port = 443, protocol = "tcp", cidr_blocks = ["0.0.0.0/0"], description = "HTTPS" }
  ]`,
        },
        egress_rules: {
          raw: `[{ from_port = 0, to_port = 0, protocol = "-1", cidr_blocks = ["0.0.0.0/0"], description = "all egress" }]`,
        },
        tags: {
          raw: `{ ManagedBy = "grid-platform", Name = "${vm.name}-sg" }`,
        },
      })
    );

    const ami =
      vm.image && vm.image.startsWith('ami-')
        ? `"${vm.image}"`
        : 'data.aws_ami.grid_al2023.id';

    blocks.push(
      renderModuleCall(`${vm.name}_ec2`, {
        source: './modules/aws/ec2-instance',
        name: vm.name,
        ami: { raw: ami },
        instance_type: vm.machineType || 't3.micro',
        subnet_id: {
          raw: `module.${vpcName}_vpc.public_subnet_ids[${subnetIndex}]`,
        },
        associate_public_ip_address: true,
        vpc_security_group_ids: {
          raw: `[module.${vm.name}_sg.security_group_id]`,
        },
        tags: {
          raw: `{ ManagedBy = "grid-platform", Name = "${vm.name}" }`,
        },
      })
    );
  }

  return blocks.join('\n\n');
}

export function renderAwsOutputs(config: GridConfig): string {
  const parts: string[] = ['# Outputs', ''];
  const vpcs = config.resources.filter(isVpcResource);
  const vms = config.resources.filter(isVmResource);

  for (const vpc of vpcs) {
    parts.push(`output "${vpc.name}_vpc_id" {
  description = "VPC ID for ${vpc.name}"
  value       = module.${vpc.name}_vpc.vpc_id
}

output "${vpc.name}_public_subnet_ids" {
  description = "Public subnet IDs for ${vpc.name}"
  value       = module.${vpc.name}_vpc.public_subnet_ids
}
`);
  }

  for (const vm of vms) {
    parts.push(`output "${vm.name}_ec2_id" {
  description = "EC2 ID for ${vm.name}"
  value       = module.${vm.name}_ec2.id
}

output "${vm.name}_ec2_private_ip" {
  description = "EC2 private IP for ${vm.name}"
  value       = module.${vm.name}_ec2.private_ip
}

output "${vm.name}_ec2_public_ip" {
  description = "EC2 public IP for ${vm.name}"
  value       = module.${vm.name}_ec2.public_ip
}
`);
  }

  return parts.join('\n');
}

/** Derive a /24 from a /16-style VPC CIDR for demo when no subnet resources exist. */
function cidrSibling(vpcCidr: string, thirdOctet: number): string {
  const match = /^(\d+)\.(\d+)\.(\d+)\.(\d+)\/(\d+)$/.exec(vpcCidr);
  if (!match) return '10.0.1.0/24';
  return `${match[1]}.${match[2]}.${thirdOctet}.0/24`;
}
