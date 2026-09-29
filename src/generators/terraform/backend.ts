import { GridConfig } from '../../validators/config';

export type TerraformBackendMode = 'local' | 's3';

export interface BackendOptions {
  /** Override via GRID_TF_BACKEND=local|s3. Default: local. */
  mode?: TerraformBackendMode;
  stateBucket?: string;
  lockTable?: string;
  stateRegion?: string;
}

/**
 * Resolve Terraform backend settings from options or env
 * (GRID_TF_BACKEND, GRID_TF_STATE_BUCKET, GRID_TF_LOCK_TABLE, GRID_TF_STATE_REGION).
 */
export function resolveBackendOptions(
  config: Pick<GridConfig, 'provider' | 'project' | 'region'>,
  overrides: BackendOptions = {}
): Required<BackendOptions> {
  const mode = (overrides.mode ||
    process.env.GRID_TF_BACKEND ||
    'local') as TerraformBackendMode;

  // S3 remote-state region only; default stays AWS-centric for the state backend.
  const stateRegion =
    overrides.stateRegion ||
    process.env.GRID_TF_STATE_REGION ||
    config.region ||
    'ap-south-1';

  return {
    mode: mode === 's3' ? 's3' : 'local',
    stateBucket: overrides.stateBucket || process.env.GRID_TF_STATE_BUCKET || '',
    lockTable: overrides.lockTable || process.env.GRID_TF_LOCK_TABLE || '',
    stateRegion,
  };
}

export function generateBackend(
  config: Pick<GridConfig, 'provider' | 'project' | 'region'>,
  overrides: BackendOptions = {}
): string {
  const backend = resolveBackendOptions(config, overrides);

  if (backend.mode === 's3') {
    if (!backend.stateBucket || !backend.lockTable) {
      throw new Error(
        'GRID_TF_BACKEND=s3 requires GRID_TF_STATE_BUCKET and GRID_TF_LOCK_TABLE'
      );
    }

    return `# Remote S3 backend (enabled via GRID_TF_BACKEND=s3)

terraform {
  backend "s3" {
    bucket         = "${backend.stateBucket}"
    key            = "grid/${config.project}/terraform.tfstate"
    region         = "${backend.stateRegion}"
    dynamodb_table = "${backend.lockTable}"
    encrypt        = true
  }
}
`;
  }

  return `# Local backend (default). Toggle remote with:
#   GRID_TF_BACKEND=s3
#   GRID_TF_STATE_BUCKET=...
#   GRID_TF_LOCK_TABLE=...
#   GRID_TF_STATE_REGION=${backend.stateRegion}

terraform {
  backend "local" {
    path = "terraform.tfstate"
  }
}
`;
}
