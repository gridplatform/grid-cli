# Terraform module for GCP VPC (Network)
# Used by Grid Platform to generate infrastructure

variable "name" {
  description = "Name of the VPC network"
  type        = string
}

variable "cidr" {
  description = "CIDR block for the VPC (not used in GCP, but kept for compatibility)"
  type        = string
  default     = ""
}

variable "description" {
  description = "Description of the VPC"
  type        = string
  default     = ""
}

variable "auto_create_subnetworks" {
  description = "Whether to automatically create subnetworks"
  type        = bool
  default     = false
}

resource "google_compute_network" "vpc" {
  name                    = var.name
  auto_create_subnetworks = var.auto_create_subnetworks
  description             = var.description != "" ? var.description : null
}

output "id" {
  description = "VPC network ID"
  value       = google_compute_network.vpc.id
}

output "name" {
  description = "VPC network name"
  value       = google_compute_network.vpc.name
}

output "self_link" {
  description = "VPC network self link"
  value       = google_compute_network.vpc.self_link
}

