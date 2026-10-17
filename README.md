# Grid CLI

Command-line tool for Grid: turn desired-state JSON into Terraform using the **[grid-terraform](https://github.com/gridplatform/grid-terraform)** module bank, then preview or apply changes.

**[grid-core](https://github.com/gridplatform/grid-core)** uses this tool on every console release (`generate`, then Terraform). You can also run it alone from a terminal.

**Docs:** [CLI (AWS / GCP)](https://gridplatform.github.io/doc/CLI/Overview) · [Install](https://gridplatform.github.io/doc/Install/Overview)

## Quick start

```bash
cd grid-cli
npm install
npm run build

# Needs a module bank (sibling checkout or GRID_MODULE_BANK)
grid generate --config /path/to/unit.json --output ./generated --format terraform
grid validate --config /path/to/unit.json
```

Sample JSON shape: **[grid-config](https://github.com/gridplatform/grid-config)** (example only — use your own repository in production).

## How generate works

1. Validate the unit JSON.
2. Map each resource `type` to a module path in the catalog.
3. Copy that module from the module bank.
4. Emit Terraform that uses those modules.

## Commands

| Command | Purpose |
|---------|---------|
| `grid generate` | JSON → Terraform under `--output` (or `archive/` with a config root) |
| `grid plan` | Generate + `terraform plan` |
| `grid deploy` | Generate + apply (converge) |
| `grid destroy` | Tear down a workspace |
| `grid validate` | Schema check |
| `grid status` | Workspace status, or desired-state vs inventory (`--config-dir`) |
| `grid prune` | List or destroy units removed from JSON |
| `grid providers` | List registered cloud adapters |

### Desired-state tree

Point `--config-dir` at **your** GitHub checkout of intent JSON (not a long-term fork of `grid-config`).

```bash
grid status --config-dir /path/to/your-infra
grid deploy --config-dir /path/to/your-infra --reconcile
grid prune --config-dir /path/to/your-infra
```

Inventory and workspaces live under `<config-dir>/.grid/` (gitignored).

## Console vs CLI

| Path | Feature flags | What you need |
|------|---------------|---------------|
| Console ([grid-ui](https://github.com/gridplatform/grid-ui)) | Can hide types in the UI | Core + flags + credentials |
| This CLI / Core API | No flags | Valid JSON + module in the bank + cloud credentials |

## Environment

| Variable | Purpose |
|----------|---------|
| `GRID_MODULE_BANK` | Path or git URL for grid-terraform |
| `GRID_CONFIG_ROOT` | Default desired-state root for `--config-dir` |

## License

MIT — see [LICENSE](LICENSE).
