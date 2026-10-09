import { describe, expect, it } from 'vitest';
import {
  generateBackend,
  normalizeBackendMode,
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

  it('emits oci backend', () => {
    const hcl = generateBackend(cfg, {
      mode: 'oci',
      stateBucket: 'oci-bucket',
      ociNamespace: 'mytenancy',
      stateRegion: 'us-ashburn-1',
      unitRelPath: unit,
    });
    expect(hcl).toContain('backend "oci"');
    expect(hcl).toContain('namespace = "mytenancy"');
    expect(hcl).toContain(remoteStateKey(unit));
  });

  it('emits oss backend', () => {
    const hcl = generateBackend(cfg, {
      mode: 'oss',
      stateBucket: 'oss-bucket',
      stateRegion: 'cn-hangzhou',
      unitRelPath: unit,
    });
    expect(hcl).toContain('backend "oss"');
    expect(hcl).toContain('prefix = "grid/projects/grid-labs/aws/development/vpc/demo-vpc"');
  });

  it('emits cos backend for Tencent', () => {
    const hcl = generateBackend(cfg, {
      mode: 'cos',
      stateBucket: 'tf-1258798060',
      stateRegion: 'ap-guangzhou',
      unitRelPath: unit,
    });
    expect(hcl).toContain('backend "cos"');
    expect(hcl).toContain('ap-guangzhou');
    expect(hcl).toContain('prefix = "grid/projects/grid-labs/aws/development/vpc/demo-vpc"');
  });

  it('emits s3compat backend with custom endpoint', () => {
    const hcl = generateBackend(cfg, {
      mode: 's3compat',
      stateBucket: 'obs-bucket',
      stateRegion: 'cn-north-1',
      s3Endpoint: 'https://obs.cn-north-1.myhuaweicloud.com',
      unitRelPath: unit,
    });
    expect(hcl).toContain('backend "s3"');
    expect(hcl).toContain('obs.cn-north-1.myhuaweicloud.com');
    expect(hcl).toContain('skip_credentials_validation');
    expect(hcl).toContain('skip_s3_checksum');
    expect(hcl).not.toContain('dynamodb_table');
  });

  it('maps module-bank provider aliases onto backend modes', () => {
    expect(normalizeBackendMode('tencent')).toBe('cos');
    expect(normalizeBackendMode('huawei')).toBe('s3compat');
    expect(normalizeBackendMode('ovh')).toBe('s3compat');
    expect(normalizeBackendMode('deutsche-telekom')).toBe('s3compat');
    expect(normalizeBackendMode('ibm')).toBe('s3compat');
    expect(normalizeBackendMode('ctrls')).toBe('s3compat');
    expect(normalizeBackendMode('yotta')).toBe('s3compat');
    expect(normalizeBackendMode('alibaba')).toBe('oss');
    expect(normalizeBackendMode('oracle')).toBe('oci');
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
