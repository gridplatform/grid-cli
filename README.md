# Grid CLI

Command-line engine for Grid: turn `grid.json` into Terraform/OpenTofu using the
**grid-terraform** module bank, then optionally apply.

grid-core calls this CLI on deploy (`grid generate`). You can also run it alone.

## Where Terraform modules live

**Not vendored in this repo.** Modules are copied at generate time from sibling
`../grid-terraform` (or `GRID_MODULE_BANK`). The `templates/terraform/` folder
is intentionally empty of modules — see [templates/terraform/README.md](templates/terraform/README.md).

## How generate works

1. Validate `grid.json` (open schema: any catalog type + passthrough fields).
2. Look up each resource `type` in the CLI resource catalog → `modulePath`.
3. Copy that folder from the module bank into `generated/modules/`.
4. Emit a `module` block; request fields become Terraform variables.

**Convenience only on AWS/GCP:** `vpc` / `subnet` / `vm` still use dedicated
composers that wire a small network graph. Every other type (and every type on
other clouds) uses the catalog path.

## Who can deploy what (by design)

| Path | Feature flags | What you need |
|------|---------------|---------------|
| **Console (UI)** | Yes — hides / does not send off types | Flag `true` in `grid-ui` `featureFlags.ts` |
| **HTTP API (grid-core)** | No | Correct `POST /deployments` body + working CLI/bank/creds |
| **CLI** | No | Valid `grid.json` + module in grid-terraform + cloud/provider creds |

Someone who knows the API body can deploy a type the console hides. That is intentional.

## Quick start

```bash
cd grid-cli
npm install
npm run build

# Sibling module bank required (or set GRID_MODULE_BANK)
grid generate --config examples/simple-vpc-vm.json --output ./generated --format terraform
grid validate --config examples/aws-s3-bucket.json
```

Canonical demos (by environment) and a no-apply smoke script live in
[`../demo-infra`](../demo-infra/README.md). Step-by-step AWS/GCP plan & deploy:
[`../docs/CLI_AWS_GCP.md`](../docs/CLI_AWS_GCP.md). Product design for Admin /
environments / approvals (website, later): [`../docs/ADMIN_RBAC.md`](../docs/ADMIN_RBAC.md).

## Example config

```json
{
  "provider": "aws",
  "project": "demo",
  "region": "ap-south-1",
  "resources": [
    {
      "type": "s3",
      "name": "logs",
      "bucket": "my-unique-grid-logs-bucket"
    }
  ]
}
```

`type` must exist in the catalog for that provider. Extra keys must match the
module’s `variables.tf` in grid-terraform.

## Commands

| Command | Purpose |
|---------|---------|
| `grid generate` | JSON → Terraform/OpenTofu under `--output` |
| `grid plan` | generate + `terraform plan` (preview create/change/destroy) |
| `grid deploy` | generate + init/plan/apply (converge); updates local inventory when under a config root |
| `grid deploy --config-dir … --reconcile` | apply **added + changed** units only (never destroys stale) |
| `grid destroy` | `terraform destroy` for a workspace (+ inventory cleanup) |
| `grid validate` | schema check |
| `grid status` | inspect a generated workspace |
| `grid status --config-dir …` | diff desired JSON vs inventory: added / changed / unchanged / **stale** |
| `grid prune --config-dir …` | list stale units (JSON deleted); suggest destroy |
| `grid prune --config-dir … --destroy` | confirm, then destroy selected stale workspaces |
| `grid providers` | list registered cloud adapters |

### Desired-state root (`grid-config`)

`grid-config` (or any tree of `*.json` Grid configs) is the source of truth.

```bash
# See what changed / what is stale
grid status --config-dir ../grid-config

# Apply new/edited JSON only
grid deploy --config-dir ../grid-config --reconcile

# JSON deleted → listed as stale; destroy only after confirmation
grid prune --config-dir ../grid-config
grid prune --config-dir ../grid-config --destroy
```

Inventory + workspaces live under `<config-dir>/.grid/` (gitignored automatically).

## Env

| Variable | Purpose |
|----------|---------|
| `GRID_MODULE_BANK` | Absolute path to grid-terraform (optional) |
| `GRID_CONFIG_ROOT` | Default desired-state root for `--config-dir` resolution |

## License

MIT — see [LICENSE](LICENSE).
