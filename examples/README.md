# Grid CLI Examples

Prefer the canonical demos under **[`../demo-infra`](../demo-infra/)** (organized by environment). Files here are thin copies for quick `cd grid-cli && … examples/…` workflows.

Configs assume a sibling **grid-terraform** module bank (or set **`GRID_MODULE_BANK`**). Full AWS/GCP deploy guide: [`../docs/CLI_AWS_GCP.md`](../docs/CLI_AWS_GCP.md).

## Composer path — GCP VPC + VM

**File:** `simple-vpc-vm.json` (same shape as `demo-infra/development/gcp-vpc-vm`)

```bash
grid generate --config examples/simple-vpc-vm.json --format terraform
```

Before a live GCP apply:

- Set `project` to your GCP project ID.
- Set `metadata.serviceAccountEmail` (or export **`GRID_GCP_SERVICE_ACCOUNT_EMAIL`**) — the GCP composer requires a service account email for VM resources.

## Composer path — AWS VPC + VM

**File:** `simple-vpc-vm-aws.json`

```bash
grid generate --config examples/simple-vpc-vm-aws.json --format terraform --output ./generated-aws
```

## Catalog path — AWS S3 / GCP GCS

**Files:** `aws-s3-bucket.json`; see also `demo-infra/sandbox/gcp-gcs-logs/grid.json`.

```bash
grid generate --config examples/aws-s3-bucket.json --format terraform --output ./generated-s3
```

Change bucket / GCS `names` to globally unique values before apply.
