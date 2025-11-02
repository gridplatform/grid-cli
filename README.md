# Grid CLI

![Grid Banner](readme-assets/banner.png)

> **Command-line interface for Grid Platform** - Infrastructure Orchestration Tool

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?logo=node.js&logoColor=white)](https://nodejs.org/)

## 🎯 Purpose

Grid CLI is the command-line interface for the Grid Infrastructure Orchestration Platform. It generates standard Terraform/OpenTofu files from simple JSON configurations and orchestrates deployments using your existing tools.

## ✨ Key Features

- **JSON → Terraform/OpenTofu** - Generate standard IaC files from simple JSON configs
- **Multi-Cloud Support** - Deploy to GCP, AWS, and Azure (GCP in v0.1.0)
- **CLI-First Design** - Fast, scriptable, and flexible
- **Zero Vendor Lock-in** - Generated files work independently
- **Deployment Orchestration** - Automates Terraform/OpenTofu workflows

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/gridplatform/grid-cli.git
cd grid-cli

# Install dependencies
npm install

# Build the project
npm run build

# Link globally (optional)
npm link
```

### Basic Usage

```bash
# Generate Terraform files from config
grid generate --config grid.json

# Deploy infrastructure
grid deploy --config grid.json

# Validate configuration
grid validate --config grid.json

# Check deployment status
grid status
```

## 📋 Configuration Format

Create a `grid.json` file:

```json
{
  "provider": "gcp",
  "project": "my-gcp-project",
  "region": "us-central1",
  "resources": [
    {
      "type": "vpc",
      "name": "production-vpc",
      "cidr": "10.0.0.0/16"
    },
    {
      "type": "subnet",
      "name": "production-subnet",
      "vpc": "production-vpc",
      "cidr": "10.0.1.0/24"
    },
    {
      "type": "vm",
      "name": "app-server",
      "machineType": "e2-standard-2",
      "subnet": "production-subnet",
      "zone": "us-central1-a"
    }
  ]
}
```

## 📚 Commands

### `grid generate`

Generate Terraform/OpenTofu files from configuration:

```bash
grid generate --config grid.json --output ./generated
```

Options:
- `-c, --config <path>` - Path to Grid configuration file (default: `grid.json`)
- `-o, --output <dir>` - Output directory (default: `./generated`)
- `--format <format>` - Output format: `terraform` or `opentofu` (default: `opentofu`)

### `grid deploy`

Generate files and deploy infrastructure:

```bash
grid deploy --config grid.json --auto-approve
```

Options:
- `-c, --config <path>` - Path to Grid configuration file
- `-o, --output <dir>` - Output directory
- `--format <format>` - IaC tool: `terraform` or `opentofu`
- `--auto-approve` - Skip confirmation prompt
- `--skip-generate` - Use existing generated files

### `grid validate`

Validate configuration file:

```bash
grid validate --config grid.json
```

### `grid status`

Check deployment status:

```bash
grid status --output ./generated
```

## 🏗️ Supported Resources (v0.1.0)

**GCP:**
- ✅ VPC (Google Compute Network)
- ✅ Subnet (Google Compute Subnetwork)
- ✅ VM (Google Compute Instance)

**Coming in v0.2.0:**
- 🔜 Load Balancer
- 🔜 Storage Bucket
- 🔜 Managed Database (Cloud SQL)

**Coming in v0.3.0:**
- 🔜 AWS support
- 🔜 Azure support

## 📖 Documentation

- **📖 [Full Documentation](https://github.com/gridplatform/grid-docs)** - Complete CLI reference
- **💬 [Discord Community](https://discord.gg/gridplatform)** - Get help and connect
- **🐛 [Report Issues](https://github.com/gridplatform/grid-cli/issues)** - Found a bug?

## 🤝 Contributing

We welcome contributions! See our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Built with ❤️ by the Grid Platform team**

