# GCP Terraform Modules

Reusable Terraform modules for Google Cloud Platform resources, used by Grid Platform to generate infrastructure.

## Modules

- **vpc** - VPC (Network) module
- **subnet** - Subnet module  
- **vm** - VM (Compute Instance) module

## Usage

These modules are automatically copied to generated infrastructure directories and called from `main.tf`:

```hcl
module "production_vpc_vpc" {
  source = "./modules/gcp/vpc"
  name   = "production-vpc"
  cidr   = "10.0.0.0/16"
}
```

## Contributing

To add new modules:
1. Create module directory: `templates/terraform/modules/gcp/<resource-type>/`
2. Add `main.tf` with resource definition
3. Add variables and outputs
4. Update Grid generator to use the module

