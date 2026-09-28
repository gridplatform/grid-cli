# Terraform module for GCP VM (Compute Instance)
# Used by Grid Platform to generate infrastructure

variable "name" {
  description = "Name of the VM instance"
  type        = string
}

variable "machine_type" {
  description = "Machine type for the VM"
  type        = string
}

variable "zone" {
  description = "Zone for the VM"
  type        = string
}

variable "subnet_name" {
  description = "Name of the subnet this VM belongs to"
  type        = string
}

variable "subnet_region" {
  description = "Region of the subnet"
  type        = string
}

variable "image" {
  description = "VM image to use"
  type        = string
  default     = "ubuntu-os-cloud/ubuntu-2204-lts"
}

variable "disk_size" {
  description = "Boot disk size in GB"
  type        = number
  default     = 10
}

variable "disk_type" {
  description = "Boot disk type"
  type        = string
  default     = "pd-standard"
}

variable "tags" {
  description = "Tags to apply to the VM"
  type        = list(string)
  default     = []
}

variable "description" {
  description = "Description of the VM"
  type        = string
  default     = ""
}

variable "enable_public_ip" {
  description = "Whether to assign a public IP address"
  type        = bool
  default     = true
}

# Get the subnet
data "google_compute_subnetwork" "subnet" {
  name   = var.subnet_name
  region = var.subnet_region
}

resource "google_compute_instance" "vm" {
  name         = var.name
  machine_type = var.machine_type
  zone         = var.zone

  boot_disk {
    initialize_params {
      image = var.image
      size  = var.disk_size
      type  = var.disk_type
    }
  }

  network_interface {
    subnetwork = data.google_compute_subnetwork.subnet.id
    dynamic "access_config" {
      for_each = var.enable_public_ip ? [1] : []
      content {
        // Ephemeral public IP
      }
    }
  }

  tags = var.tags

  labels = var.description != "" ? {
    description = var.description
  } : {}

  metadata = {
    # Grid Platform managed instance
    managed-by = "grid-platform"
  }
}

output "id" {
  description = "VM instance ID"
  value       = google_compute_instance.vm.id
}

output "name" {
  description = "VM instance name"
  value       = google_compute_instance.vm.name
}

output "self_link" {
  description = "VM instance self link"
  value       = google_compute_instance.vm.self_link
}

output "internal_ip" {
  description = "VM internal IP address"
  value       = google_compute_instance.vm.network_interface[0].network_ip
}

output "external_ip" {
  description = "VM external IP address (if enabled)"
  value       = var.enable_public_ip ? google_compute_instance.vm.network_interface[0].access_config[0].nat_ip : null
}

