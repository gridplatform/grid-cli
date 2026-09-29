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

Provider `status` is discovery metadata for listing/UI — it does not block generate.
Apply still needs a module bank entry and credentials.

## Speed

```bash
npm run grid -- generate -c … -o …
# or, after npm link:
grid generate -c …
```

`bin/grid.js` rebuilds when `src/` changed, then runs the compiled CLI.
Generate symlinks modules from `grid-terraform` by default; archive/deploy uses copy.
For a portable copy without symlinks: `GRID_MODULE_COPY=1`.
