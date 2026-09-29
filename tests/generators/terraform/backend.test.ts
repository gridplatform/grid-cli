import { describe, expect, it } from 'vitest';
import {
  generateBackend,
  remoteStateKey,
  renderRemoteStateDataBlock,
} from '../../../src/generators/terraform/backend';

describe('terraform backend', () => {
  const cfg = { provider: 'aws' as const, project: 'demo', region: 'us-east-1' };
  const unit = 'projects/grid-labs/aws/development/vpc/demo-vpc.json';

  it('builds a unique s3 key per unit path', () => {
    expect(remoteStateKey(unit)).toBe(
      'grid/projects/grid-labs/aws/development/vpc/demo-vpc/terraform.tfstate'
    );
  });

  it('emits s3 backend when GRID_TF_BACKEND=s3', () => {
    process.env.GRID_TF_BACKEND = 's3';
    process.env.GRID_TF_STATE_BUCKET = 'b';
    process.env.GRID_TF_LOCK_TABLE = 't';
    process.env.GRID_TF_STATE_REGION = 'us-east-1';
    const hcl = generateBackend(cfg, { unitRelPath: unit });
    expect(hcl).toContain('backend "s3"');
    expect(hcl).toContain(remoteStateKey(unit));
    delete process.env.GRID_TF_BACKEND;
    delete process.env.GRID_TF_STATE_BUCKET;
    delete process.env.GRID_TF_LOCK_TABLE;
  });

  it('emits gcs backend', () => {
    const hcl = generateBackend(cfg, {
      mode: 'gcs',
      stateBucket: 'gcs-bucket',
      unitRelPath: unit,
    });
    expect(hcl).toContain('backend "gcs"');
    expect(hcl).toContain('prefix = "grid/projects/grid-labs/aws/development/vpc/demo-vpc"');
  });

  it('emits azurerm backend', () => {
    const hcl = generateBackend(cfg, {
      mode: 'azurerm',
      azureResourceGroup: 'rg',
      azureStorageAccount: 'sa',
      azureContainer: 'c',
      unitRelPath: unit,
    });
    expect(hcl).toContain('backend "azurerm"');
    expect(hcl).toContain(remoteStateKey(unit));
  });

  it('remote_state data block follows backend mode', () => {
    const block = renderRemoteStateDataBlock('dep_vpc', unit, cfg, undefined);
    // default local without env
    process.env.GRID_TF_BACKEND = 's3';
    process.env.GRID_TF_STATE_BUCKET = 'b';
    process.env.GRID_TF_LOCK_TABLE = 't';
    const remote = renderRemoteStateDataBlock('dep_vpc', unit, cfg);
    expect(remote).toContain('backend = "s3"');
    expect(remote).toContain(remoteStateKey(unit));
    expect(block).toContain('backend = "local"');
    delete process.env.GRID_TF_BACKEND;
    delete process.env.GRID_TF_STATE_BUCKET;
    delete process.env.GRID_TF_LOCK_TABLE;
  });
});
