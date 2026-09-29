import { describe, expect, it } from 'vitest';
import { renderCatalogResources } from '../../../src/generators/terraform/catalogResources';
import type { Resource } from '../../../src/validators/config';

describe('generators/terraform — stack name binding (aws)', () => {
  it('binds subnet / vpc / sg names inside one stack', () => {
    const hcl = renderCatalogResources(
      'aws',
      [
        { type: 'vpc', name: 'lab-vpc', cidr: '10.50.0.0/16', enable_nat_gateway: false },
        { type: 'subnet', name: 'lab-public', vpc: 'lab-vpc', cidr: '10.50.1.0/24' },
        {
          type: 'security-group',
          name: 'lab-ssh',
          vpc: 'lab-vpc',
          ingress_rules: [{ from_port: 22, to_port: 22, protocol: 'tcp', cidr_blocks: ['0.0.0.0/0'] }],
        },
        {
          type: 'vm',
          name: 'lab-vm',
          subnet: 'lab-public',
          securityGroups: ['lab-ssh'],
          tags: ['grid'],
        },
      ] as Resource[],
      { project: 'grid-labs', region: 'us-east-1' }
    );

    expect(hcl).toContain('module.lab-vpc_vpc.public_subnet_ids[0]');
    expect(hcl).toContain('module.lab-vpc_vpc.vpc_id');
    expect(hcl).toContain('module.lab-ssh_security-group.security_group_id');
    expect(hcl).toMatch(/grid\s*=\s*"true"/);
    expect(hcl).not.toMatch(/^\s*ami\s*=/m);
  });

  it('keeps explicit AWS ids', () => {
    const hcl = renderCatalogResources(
      'aws',
      [
        {
          type: 'vm',
          name: 'x',
          subnet: 'subnet-abc',
          image: 'ami-abc',
          securityGroups: ['sg-abc'],
        },
      ] as Resource[],
      { project: 'grid-labs', region: 'us-east-1' }
    );

    expect(hcl).toMatch(/subnet_id\s*=\s*"subnet-abc"/);
    expect(hcl).toMatch(/ami\s*=\s*"ami-abc"/);
    expect(hcl).toContain('"sg-abc"');
  });
});
