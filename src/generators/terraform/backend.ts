import { GridConfig } from '../../validators/config';

export type TerraformBackendMode = 'local' | 's3' | 'gcs' | 'azurerm';

export interface BackendOptions {
  /** Override via GRID_TF_BACKEND=local|s3|gcs|azurerm. Default: local. */
  mode?: TerraformBackendMode;
  stateBucket?: string;
  lockTable?: string;
  stateRegion?: string;
  azureResourceGroup?: string;
  azureStorageAccount?: string;
  azureContainer?: string;
  /**
   * Desired-state relative path (…/vpc/name.json or without .json).
   * Used to build a unique remote state object key / prefix per unit.
   */
  unitRelPath?: string;
}

export interface ResolvedBackend extends Required<
  Pick<
    BackendOptions,
    | 'mode'
    | 'stateBucket'
    | 'lockTable'
    | 'stateRegion'
    | 'azureResourceGroup'
    | 'azureStorageAccount'
    | 'azureContainer'
  >
> {
  unitRelPath: string;
}

/** Normalize unit path for state addressing (posix, no .json). */
export function unitStateRelPath(unitRelPath: string): string {
  return unitRelPath
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\.json$/i, '')
    .replace(/^\/+/, '');
}

/** S3 / Azure blob key for a unit. */
export function remoteStateKey(unitRelPath: string): string {
  const rel = unitStateRelPath(unitRelPath);
  return `grid/${rel}/terraform.tfstate`;
}

/** GCS prefix for a unit (object lives under this prefix). */
export function remoteStatePrefix(unitRelPath: string): string {
  return `grid/${unitStateRelPath(unitRelPath)}`;
}

function normalizeMode(raw: string | undefined): TerraformBackendMode {
  const m = (raw || 'local').toLowerCase().trim();
  if (m === 's3' || m === 'gcs' || m === 'azurerm' || m === 'azure') {
    return m === 'azure' ? 'azurerm' : m;
  }
  return 'local';
}

/**
 * Resolve Terraform backend settings from options or env.
 *
 * Env:
 *   GRID_TF_BACKEND=local|s3|gcs|azurerm
 *   GRID_TF_STATE_BUCKET, GRID_TF_LOCK_TABLE, GRID_TF_STATE_REGION  (s3 / gcs bucket)
 *   GRID_TF_AZURE_RESOURCE_GROUP, GRID_TF_AZURE_STORAGE_ACCOUNT, GRID_TF_AZURE_CONTAINER
 */
export function resolveBackendOptions(
  config: Pick<GridConfig, 'provider' | 'project' | 'region'>,
  overrides: BackendOptions = {}
): ResolvedBackend {
  const mode = normalizeMode(overrides.mode || process.env.GRID_TF_BACKEND);

  const stateRegion =
    overrides.stateRegion ||
    process.env.GRID_TF_STATE_REGION ||
    config.region ||
    'us-east-1';

  const unitRelPath =
    overrides.unitRelPath ||
    process.env.GRID_TF_UNIT_REL ||
    `${config.provider}/${config.project}`;

  return {
    mode,
    stateBucket: overrides.stateBucket || process.env.GRID_TF_STATE_BUCKET || '',
    lockTable: overrides.lockTable || process.env.GRID_TF_LOCK_TABLE || '',
    stateRegion,
    azureResourceGroup:
      overrides.azureResourceGroup || process.env.GRID_TF_AZURE_RESOURCE_GROUP || '',
    azureStorageAccount:
      overrides.azureStorageAccount || process.env.GRID_TF_AZURE_STORAGE_ACCOUNT || '',
    azureContainer:
      overrides.azureContainer || process.env.GRID_TF_AZURE_CONTAINER || 'grid-tfstate',
    unitRelPath,
  };
}

export function generateBackend(
  config: Pick<GridConfig, 'provider' | 'project' | 'region'>,
  overrides: BackendOptions = {}
): string {
  const backend = resolveBackendOptions(config, overrides);
  const key = remoteStateKey(backend.unitRelPath);
  const prefix = remoteStatePrefix(backend.unitRelPath);

  if (backend.mode === 's3') {
    if (!backend.stateBucket || !backend.lockTable) {
      throw new Error(
        'GRID_TF_BACKEND=s3 requires GRID_TF_STATE_BUCKET and GRID_TF_LOCK_TABLE'
      );
    }
    return `# Remote S3 backend (GRID_TF_BACKEND=s3) — create bucket + DynamoDB lock table first

terraform {
  backend "s3" {
    bucket         = "${backend.stateBucket}"
    key            = "${key}"
    region         = "${backend.stateRegion}"
    dynamodb_table = "${backend.lockTable}"
    encrypt        = true
  }
}
`;
  }

  if (backend.mode === 'gcs') {
    if (!backend.stateBucket) {
      throw new Error('GRID_TF_BACKEND=gcs requires GRID_TF_STATE_BUCKET');
    }
    return `# Remote GCS backend (GRID_TF_BACKEND=gcs) — create the bucket first

terraform {
  backend "gcs" {
    bucket = "${backend.stateBucket}"
    prefix = "${prefix}"
  }
}
`;
  }

  if (backend.mode === 'azurerm') {
    if (
      !backend.azureResourceGroup ||
      !backend.azureStorageAccount ||
      !backend.azureContainer
    ) {
      throw new Error(
        'GRID_TF_BACKEND=azurerm requires GRID_TF_AZURE_RESOURCE_GROUP, GRID_TF_AZURE_STORAGE_ACCOUNT, GRID_TF_AZURE_CONTAINER'
      );
    }
    return `# Remote AzureRM backend (GRID_TF_BACKEND=azurerm) — create RG + storage + container first

terraform {
  backend "azurerm" {
    resource_group_name  = "${backend.azureResourceGroup}"
    storage_account_name = "${backend.azureStorageAccount}"
    container_name       = "${backend.azureContainer}"
    key                  = "${key}"
  }
}
`;
  }

  return `# Local backend (lab / single-node only).
# Self-host / multi-VM: set GRID_TF_BACKEND=s3|gcs|azurerm and create the remote store first.
#   See https://github.com/gridplatform/grid-docs/blob/main/docs/install/remote-state.md

terraform {
  backend "local" {
    path = "terraform.tfstate"
  }
}
`;
}

/**
 * HCL for data.terraform_remote_state — must match the dependency unit's backend.
 */
export function renderRemoteStateDataBlock(
  remoteStateId: string,
  depUnitRelPath: string,
  config: Pick<GridConfig, 'provider' | 'project' | 'region'>,
  localArchiveStatePath?: string
): string {
  const backend = resolveBackendOptions(config, { unitRelPath: depUnitRelPath });
  const key = remoteStateKey(depUnitRelPath);
  const prefix = remoteStatePrefix(depUnitRelPath);

  if (backend.mode === 's3') {
    return `data "terraform_remote_state" "${remoteStateId}" {
  backend = "s3"
  config = {
    bucket = "${backend.stateBucket}"
    key    = "${key}"
    region = "${backend.stateRegion}"
  }
}`;
  }

  if (backend.mode === 'gcs') {
    return `data "terraform_remote_state" "${remoteStateId}" {
  backend = "gcs"
  config = {
    bucket = "${backend.stateBucket}"
    prefix = "${prefix}"
  }
}`;
  }

  if (backend.mode === 'azurerm') {
    return `data "terraform_remote_state" "${remoteStateId}" {
  backend = "azurerm"
  config = {
    resource_group_name  = "${backend.azureResourceGroup}"
    storage_account_name = "${backend.azureStorageAccount}"
    container_name       = "${backend.azureContainer}"
    key                  = "${key}"
  }
}`;
  }

  const statePath = (localArchiveStatePath || 'terraform.tfstate').replace(/\\/g, '/');
  return `data "terraform_remote_state" "${remoteStateId}" {
  backend = "local"
  config = {
    path = "${statePath}"
  }
}`;
}
