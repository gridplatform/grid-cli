# Terraform module for GCP Subnet
# Used by Grid Platform to generate infrastructure

variable "name" {
  description = "Name of the subnet"
  type        = string
}

variable "vpc_name" {
  description = "Name of the VPC network this subnet belongs to"
  type        = string
}

variable "cidr" {
  description = "CIDR block for the subnet"
  type        = string
}

variable "region" {
  description = "Region for the subnet"
  type        = string
}

variable "description" {
  description = "Description of the subnet"
  type        = string
  default     = ""
}

variable "private_ip_google_access" {
  description = "Whether VMs in this subnet can access Google services without external IP"
  type        = bool
  default     = false
}

# Get the VPC network (assumes VPC is created by Grid's VPC module)
data "google_compute_network" "vpc" {
  name = var.vpc_name
}

resource "google_compute_subnetwork" "subnet" {
  name          = var.name
  ip_cidr_range = var.cidr
  network       = data.google_compute_network.vpc.id
  region        = var.region
  description   = var.description != "" ? var.description : null
  private_ip_google_access = var.private_ip_google_access
}

output "id" {
  description = "Subnet ID"
  value       = google_compute_subnetwork.subnet.id
}

output "name" {
  description = "Subnet name"
  value       = google_compute_subnetwork.subnet.name
}

output "self_link" {
  description = "Subnet self link"
  value       = google_compute_subnetwork.subnet.self_link
}

