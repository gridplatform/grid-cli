# Terraform / OpenTofu generation

Providers differ only by the Terraform `provider` block; resource HCL comes from the shared catalog.

```text
Unit JSON (<cloud>/<env>/<type>/<name>.json)
   │
   ▼
resourceCatalog.ts     type → modulePath (+ optional inputMap / foldInto)
   │
   ▼
catalogResources.ts    emit module blocks; fold children into parents
   │
   ▼
moduleBank.ts          link/copy from grid-terraform/
   │
   ▼
archive/… or -o dir → main.tf + provider.tf + …
```

## Files

| File | Role |
|------|------|
| `index.ts` | Orchestrator |
| `resourceCatalog.ts` | Data: every provider × type → module (+ fold/input maps) |
| `catalogResources.ts` | Shared renderer for all clouds |
| `moduleBank.ts` | Resolve/copy modules from `grid-terraform` |
| `backend.ts` / `hcl.ts` | Shared helpers |

## Adding a type or cloud

1. **New type:** row in `resourceCatalog.ts` + module under `grid-terraform/<cloud>/…`
2. **New cloud:** register under `src/providers/` (provider.tf only) + catalog rows
3. **Subnet-into-VPC (any cloud):** set `foldInto` on the subnet catalog entry
   (only within the **same** unit JSON — e.g. the VPC unit owns its subnets)

## Cross-unit network (`metadata.dependsOn`)

Product rule: a VPC/subnet unit keeps its own Terraform workspace. A VM / SG / cluster
unit **references** it — it never recreates those resources.

- Put `metadata.dependsOn: ["aws/<env>/vpc/<name>.json"]` on the consumer
- Point `vpc` / `subnet` fields at logical Grid names from that unit
- Generate emits `terraform_remote_state` into the dependency’s `archive/…/terraform.tfstate`
- Deploy VPC first (so outputs exist), then plan/apply the consumer

Provider `status` is discovery metadata for listing/UI — it does not block generate.
Apply still needs a module bank entry and credentials.

## Speed

```bash
npm run grid -- generate -c … -o …
# or, after npm link:
grid generate -c …
```

`bin/grid.js` rebuilds when `src/` changed, then runs the compiled CLI.

## Module sources

| Mode | When | `source =` |
|------|------|------------|
| **remote** | Default if `GRID_MODULE_BANK` is a git URL | `git::https://…/grid-terraform.git//aws/vpc?ref=main` |
| **link** | Default for local bank path | `./modules/…` (symlink) |
| **copy** | `GRID_MODULE_SOURCE=copy` or `GRID_MODULE_COPY=1` | `./modules/…` (full copy) |

Override: `GRID_MODULE_SOURCE=remote|copy|link` or `grid generate --module-source remote`.  
Pin the bank with `GRID_MODULE_BANK_REF` (tag/commit recommended for prod).
