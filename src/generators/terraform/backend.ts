import { GridConfig } from '../../validators/config';

/**
 * Remote state / archive object-store modes Grid supports.
 *
 * Native Terraform backends: s3, gcs, azurerm, oci, oss, cos.
 * s3compat → Terraform `backend "s3"` with a custom endpoint (Huawei OBS,
 * MinIO, and other S3-compatible stores used in agent / regional clouds).
 */
export type TerraformBackendMode =
  | 'local'
  | 's3'
  | 'gcs'
  | 'azurerm'
  | 'oci'
  | 'oss'
  | 'cos'
  | 's3compat';

export interface BackendOptions {
  /** Override via GRID_TF_BACKEND. Default: local. */
  mode?: TerraformBackendMode;
  stateBucket?: string;
  lockTable?: string;
  stateRegion?: string;
  azureResourceGroup?: string;
  azureStorageAccount?: string;
  azureContainer?: string;
  /** OCI Object Storage namespace (GRID_TF_OCI_NAMESPACE). */
  ociNamespace?: string;
  /** S3-compatible / custom endpoint (GRID_TF_S3_ENDPOINT). */
  s3Endpoint?: string;
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
    | 'ociNamespace'
    | 's3Endpoint'
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

/** S3 / Azure / OCI blob key for a unit. */
export function remoteStateKey(unitRelPath: string): string {
  const rel = unitStateRelPath(unitRelPath);
  return `grid/${rel}/terraform.tfstate`;
}

/** GCS / OSS / COS prefix for a unit (object lives under this prefix). */
export function remoteStatePrefix(unitRelPath: string): string {
  return `grid/${unitStateRelPath(unitRelPath)}`;
}

/** Object-store prefix for mirrored instance Terraform (exit buffer). */
export function remoteArchivePrefix(unitRelPath: string): string {
  return `archive/${unitStateRelPath(unitRelPath)}`;
}

/**
 * Map GRID_TF_BACKEND (and friendly aliases aligned with grid-terraform
 * provider folders) onto a concrete backend mode.
 *
 * Deploying modules for provider X does not require the state bucket to live
 * on X — but when operators do host state on that cloud, these aliases pick
 * the right Terraform backend / S3-compatible endpoint mode.
 */
export function normalizeBackendMode(raw: string | undefined): TerraformBackendMode {
  const m = (raw || 'local').toLowerCase().trim();
  if (
    m === 's3' ||
    m === 'gcs' ||
    m === 'oci' ||
    m === 'oss' ||
    m === 'cos' ||
    m === 's3compat'
  ) {
    return m;
  }
  if (m === 'azurerm' || m === 'azure') return 'azurerm';
  if (m === 'gcp' || m === 'google') return 'gcs';
  if (m === 'aws' || m === 'amazon') return 's3';
  if (m === 'alibaba' || m === 'aliyun') return 'oss';
  if (m === 'oracle') return 'oci';
  if (m === 'tencent' || m === 'tencentcloud') return 'cos';
  // S3-compatible object stores used by module-bank / agent-space clouds:
  // Huawei OBS, OVH, Deutsche Telekom OTC, IBM COS, CtrlS, Yotta, MinIO, …
  if (
    m === 'obs' ||
    m === 'huawei' ||
    m === 'minio' ||
    m === 'ovh' ||
    m === 'ovhcloud' ||
    m === 'deutsche-telekom' ||
    m === 'dt' ||
    m === 'otc' ||
    m === 'ibm' ||
    m === 'ibmcloud' ||
    m === 'ctrls' ||
    m === 'yotta'
  ) {
    return 's3compat';
  }
  return 'local';
}
/**
 * Resolve Terraform backend settings from options or env.
 *
 * Env:
 *   GRID_TF_BACKEND=local|s3|gcs|azurerm|oci|oss|cos|s3compat
 *   GRID_TF_STATE_BUCKET, GRID_TF_LOCK_TABLE, GRID_TF_STATE_REGION
 *   GRID_TF_AZURE_*, GRID_TF_OCI_NAMESPACE, GRID_TF_S3_ENDPOINT
 */
export function resolveBackendOptions(
  config: Pick<GridConfig, 'provider' | 'project' | 'region'>,
  overrides: BackendOptions = {}
): ResolvedBackend {
  const mode = normalizeBackendMode(overrides.mode || process.env.GRID_TF_BACKEND);

  const stateRegion =
    overrides.stateRegion ||
    process.env.GRID_TF_STATE_REGION ||
    config.region ||
    'us-east-1';

  const unitRelPath =
    overrides.unitRelPath ||
    process.env.GRID_TF_UNIT_REL ||
    `${config.provider}/${config.project}`;

  const alias = (overrides.mode || process.env.GRID_TF_BACKEND || '')
    .toString()
    .trim()
    .toLowerCase();
  const ociNamespace =
    overrides.ociNamespace || process.env.GRID_TF_OCI_NAMESPACE || '';
  const s3Endpoint =
    overrides.s3Endpoint ||
    process.env.GRID_TF_S3_ENDPOINT ||
    defaultS3EndpointForAlias(alias, mode, stateRegion, ociNamespace) ||
    '';

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
    ociNamespace,
    s3Endpoint,
    unitRelPath,
  };
}

/** Same defaults as grid-core archive mirror for module-bank / regional clouds. */
function defaultS3EndpointForAlias(
  alias: string,
  mode: TerraformBackendMode,
  region: string,
  ociNamespace: string
): string {
  const a = alias.toLowerCase();
  const r = region.trim().toLowerCase();
  if (mode === 'cos' || a === 'tencent' || a === 'tencentcloud') {
    return r ? `https://cos.${r}.myqcloud.com` : '';
  }
  if (mode === 'oss' || a === 'alibaba' || a === 'aliyun') {
    return r ? `https://oss-${r}.aliyuncs.com` : '';
  }
  if (mode === 'oci' || a === 'oracle') {
    return r && ociNamespace
      ? `https://${ociNamespace}.compat.objectstorage.${r}.oraclecloud.com`
      : '';
  }
  if (a === 'huawei' || a === 'obs') {
    return r ? `https://obs.${r}.myhuaweicloud.com` : '';
  }
  if (a === 'ovh' || a === 'ovhcloud') {
    return r ? `https://s3.${r}.io.cloud.ovh.net` : '';
  }
  if (a === 'deutsche-telekom' || a === 'dt' || a === 'otc') {
    return r ? `https://obs.${r}.otc.t-systems.com` : '';
  }
  return '';
}
function s3CompatExtraHcl(endpoint: string): string {
  // skip_s3_checksum: required by OVH and several regional S3 APIs (TF ≥ 1.6).
  return `
    endpoint                    = "${endpoint}"
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
    use_path_style              = true`;
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
    const endpointExtra = backend.s3Endpoint
      ? s3CompatExtraHcl(backend.s3Endpoint)
      : '';
    return `# Remote S3 backend (GRID_TF_BACKEND=s3) — create bucket + DynamoDB lock table first

terraform {
  backend "s3" {
    bucket         = "${backend.stateBucket}"
    key            = "${key}"
    region         = "${backend.stateRegion}"
    dynamodb_table = "${backend.lockTable}"
    encrypt        = true${endpointExtra}
  }
}
`;
  }

  if (backend.mode === 's3compat') {
    if (!backend.stateBucket || !backend.s3Endpoint) {
      throw new Error(
        'GRID_TF_BACKEND=s3compat requires GRID_TF_STATE_BUCKET and GRID_TF_S3_ENDPOINT ' +
          '(Huawei OBS, MinIO, or any S3-compatible object store)'
      );
    }
    return `# S3-compatible object store (GRID_TF_BACKEND=s3compat) — Huawei OBS, MinIO, etc.

terraform {
  backend "s3" {
    bucket  = "${backend.stateBucket}"
    key     = "${key}"
    region  = "${backend.stateRegion}"
    encrypt = true${s3CompatExtraHcl(backend.s3Endpoint)}
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

  if (backend.mode === 'oci') {
    if (!backend.stateBucket || !backend.ociNamespace) {
      throw new Error(
        'GRID_TF_BACKEND=oci requires GRID_TF_STATE_BUCKET and GRID_TF_OCI_NAMESPACE'
      );
    }
    return `# Remote OCI Object Storage backend (GRID_TF_BACKEND=oci)

terraform {
  backend "oci" {
    bucket    = "${backend.stateBucket}"
    namespace = "${backend.ociNamespace}"
    key       = "${key}"
    region    = "${backend.stateRegion}"
  }
}
`;
  }

  if (backend.mode === 'oss') {
    if (!backend.stateBucket) {
      throw new Error('GRID_TF_BACKEND=oss requires GRID_TF_STATE_BUCKET');
    }
    return `# Remote Alibaba Cloud OSS backend (GRID_TF_BACKEND=oss)

terraform {
  backend "oss" {
    bucket = "${backend.stateBucket}"
    prefix = "${prefix}"
    key    = "terraform.tfstate"
    region = "${backend.stateRegion}"
  }
}
`;
  }

  if (backend.mode === 'cos') {
    if (!backend.stateBucket) {
      throw new Error('GRID_TF_BACKEND=cos requires GRID_TF_STATE_BUCKET');
    }
    return `# Remote Tencent Cloud COS backend (GRID_TF_BACKEND=cos)

terraform {
  backend "cos" {
    region = "${backend.stateRegion}"
    bucket = "${backend.stateBucket}"
    prefix = "${prefix}"
  }
}
`;
  }

  return `# Local backend (lab / single-node only).
# Self-host / multi-VM: set GRID_TF_BACKEND=s3|gcs|azurerm|oci|oss|cos|s3compat
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
    const endpointLines = backend.s3Endpoint
      ? `\n    endpoint                    = "${backend.s3Endpoint}"\n    skip_credentials_validation = true\n    skip_metadata_api_check     = true\n    skip_requesting_account_id  = true\n    use_path_style              = true`
      : '';
    return `data "terraform_remote_state" "${remoteStateId}" {
  backend = "s3"
  config = {
    bucket = "${backend.stateBucket}"
    key    = "${key}"
    region = "${backend.stateRegion}"${endpointLines}
  }
}`;
  }

  if (backend.mode === 's3compat') {
    return `data "terraform_remote_state" "${remoteStateId}" {
  backend = "s3"
  config = {
    bucket                      = "${backend.stateBucket}"
    key                         = "${key}"
    region                      = "${backend.stateRegion}"
    endpoint                    = "${backend.s3Endpoint}"
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_requesting_account_id  = true
    use_path_style              = true
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

  if (backend.mode === 'oci') {
    return `data "terraform_remote_state" "${remoteStateId}" {
  backend = "oci"
  config = {
    bucket    = "${backend.stateBucket}"
    namespace = "${backend.ociNamespace}"
    key       = "${key}"
    region    = "${backend.stateRegion}"
  }
}`;
  }

  if (backend.mode === 'oss') {
    return `data "terraform_remote_state" "${remoteStateId}" {
  backend = "oss"
  config = {
    bucket = "${backend.stateBucket}"
    prefix = "${prefix}"
    key    = "terraform.tfstate"
    region = "${backend.stateRegion}"
  }
}`;
  }

  if (backend.mode === 'cos') {
    return `data "terraform_remote_state" "${remoteStateId}" {
  backend = "cos"
  config = {
    region = "${backend.stateRegion}"
    bucket = "${backend.stateBucket}"
    prefix = "${prefix}"
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
