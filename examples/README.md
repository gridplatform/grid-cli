# Grid CLI Examples

Prefer the canonical demos under **[`../demo-infra`](../demo-infra/)** (`<cloud>/<env>/<type>/<name>.json`). Files here are thin copies for quick `cd grid-cli && … examples/…` workflows.

Configs assume a sibling **grid-terraform** module bank (or set **`GRID_MODULE_BANK`**). Full AWS/GCP deploy guide: [grid-docs → CLI](https://github.com/gridplatform/grid-docs/blob/main/docs/cli/aws-gcp.md).

## Catalog path — GCP VPC + VM

**File:** `simple-vpc-vm.json` (same resource shape as `demo-infra/gcp/development/vpc` + `vm`)

```bash
grid generate --config examples/simple-vpc-vm.json --format terraform
```

Before a live GCP apply:

- Set `project` to your GCP project ID.
- Set `metadata.serviceAccountEmail` (or export **`GRID_GCP_SERVICE_ACCOUNT_EMAIL`**) — required for VM resources.

## Catalog path — AWS VPC + VM

**File:** `simple-vpc-vm-aws.json` (same shape as `demo-infra/aws/development/vpc` + `ec2`)

```bash
grid generate --config examples/simple-vpc-vm-aws.json --format terraform --output ./generated-aws
```

## Catalog path — AWS S3 / GCP GCS

**Files:** `aws-s3-bucket.json`; see also `demo-infra/gcp/development/gcs/logs.json`.

```bash
grid generate --config examples/aws-s3-bucket.json --format terraform --output ./generated-s3
```

Change bucket / GCS `names` to globally unique values before apply.
