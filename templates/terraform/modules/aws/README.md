# AWS modules are not vendored under grid-cli.

# Product source of truth:
#   ../grid-terraform/aws|gcp|azure
#
# `grid generate` copies modules from grid-terraform into each workspace.
# Override: GRID_MODULE_BANK=/path/to/grid-terraform
