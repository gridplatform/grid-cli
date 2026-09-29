# Terraform / OpenTofu generation

**One path for every cloud.** Providers only differ by the `provider` block.

```text
Grid JSON
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
main.tf + provider.tf + …
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
3. **Subnet-into-VPC (any cloud):** set `foldInto` on the subnet catalog entry — same mechanism for AWS/GCP/Azure/…

UI “planned” / `status` on providers is discovery metadata — it does **not**
block generate. Apply still needs a real module bank entry + credentials.

## Speed

Everyday command (fast path — you don’t choose dist vs tsx):

```bash
npm run grid -- generate -c … -o …
# or, after npm link:
grid generate -c … -o …
```

`bin/grid.js` rebuilds only when `src/` changed, then runs the compiled CLI.
Generate also **symlinks** modules from `grid-terraform` by default.

Use `npm run dev` / `tsx` only when you want a watcher. For a portable
workspace copy (no symlinks): `GRID_MODULE_COPY=1`.
