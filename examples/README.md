# Grid CLI Examples

Example configurations for Grid CLI.

## Simple VPC + VM

**File:** `simple-vpc-vm.json`

Creates a VPC, subnet, and VM on GCP.

```bash
grid generate --config examples/simple-vpc-vm.json
grid deploy --config examples/simple-vpc-vm.json
```

**Note:** Update the `project` field with your GCP project ID before deploying.

## More Examples Coming Soon

- Multi-VM setup
- VPC with multiple subnets
- Load balancer configuration
- Storage bucket setup

