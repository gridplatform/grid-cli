# Providers

Every cloud uses the **same** generate path (catalog). Adapters here only
provide identity + a Terraform `provider` block.

| File / folder | Meaning |
|---------------|---------|
| `types.ts` | `ProviderId` + `ProviderAdapter` |
| `registry.ts` | Lookup / list |
| `index.ts` | Bootstrap — register all adapters |
| `aws/`, `gcp/`, `azure/` | Provider blocks for major clouds |
| `catalogOnly.ts` | Other clouds — same shape, different provider.tf |

To add a cloud: register an adapter, add rows in
`generators/terraform/resourceCatalog.ts`, add modules under `grid-terraform/`.

See `generators/terraform/README.md`.
