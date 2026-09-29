import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import { describe, expect, it } from 'vitest';
import { loadConfigWithDependencies } from '@/config/resolveDependencies';

describe('loadConfigWithDependencies', () => {
  it('resolves dependsOn under projects/<slug> as references (does not merge VPC into VM)', async () => {
    const platform = await fs.mkdtemp(path.join(os.tmpdir(), 'grid-depends-'));
    const projectRoot = path.join(platform, 'projects', 'grid-labs');
    await fs.ensureDir(path.join(projectRoot, '.grid'));
    await fs.writeJSON(path.join(projectRoot, '.grid', 'project.json'), {
      version: 1,
      kind: 'grid-desired-state',
      createdAt: new Date().toISOString(),
    });

    const vpcDir = path.join(projectRoot, 'aws', 'development', 'vpc');
    const ec2Dir = path.join(projectRoot, 'aws', 'development', 'ec2');
    await fs.ensureDir(vpcDir);
    await fs.ensureDir(ec2Dir);

    await fs.writeJSON(path.join(vpcDir, 'grid-labs-vpc.json'), {
      provider: 'aws',
      project: 'grid-labs',
      region: 'us-east-1',
      metadata: { name: 'grid-labs-vpc', environment: 'development' },
      resources: [
        {
          type: 'vpc',
          name: 'grid-labs-vpc',
          cidr: '10.20.0.0/16',
        },
        {
          type: 'subnet',
          name: 'grid-labs-public',
          vpc: 'grid-labs-vpc',
          cidr: '10.20.1.0/24',
        },
      ],
    });

    const vmPath = path.join(ec2Dir, 'grid-labs-vm.json');
    await fs.writeJSON(vmPath, {
      provider: 'aws',
      project: 'grid-labs',
      region: 'us-east-1',
      metadata: {
        name: 'grid-labs-vm',
        environment: 'development',
        dependsOn: ['aws/development/vpc/grid-labs-vpc.json'],
      },
      resources: [
        {
          type: 'vm',
          name: 'grid-labs-vm',
          machineType: 't3.micro',
          subnet: 'grid-labs-public',
        },
      ],
    });

    const resolved = await loadConfigWithDependencies(vmPath, { configDir: platform });
    expect(resolved.dependsRoot).toBe(path.resolve(projectRoot));
    expect(resolved.configRoot).toBe(path.resolve(platform));
    expect(resolved.mergedFrom).toEqual([]);
    expect(resolved.dependencies).toHaveLength(1);
    expect(resolved.dependencies[0].relPath).toBe('aws/development/vpc/grid-labs-vpc.json');
    expect(resolved.dependencies[0].network.vpcs).toEqual(['grid-labs-vpc']);
    expect(resolved.dependencies[0].network.subnets.map((s) => s.name)).toEqual([
      'grid-labs-public',
    ]);
    // Leaf stack keeps only its own resources — VPC/subnet stay in the VPC unit.
    expect(resolved.config.resources.map((r) => r.name).sort()).toEqual(['grid-labs-vm']);
    expect(resolved.warnings.some((w) => /reference-only/i.test(w))).toBe(true);

    await fs.remove(platform);
  });
});
