terraform {
  required_version = ">= 1.9"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
  # Local state for a one-person project. Move to a GCS bucket before anyone else applies.
}

provider "google" {
  project = var.project_id
  region  = var.region
}
