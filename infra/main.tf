# agentdesk on Google Cloud.
#
#   API        Cloud Run, public (every route but /health and /meta needs the bearer token)
#   worker     Cloud Run, private: woken by Pub/Sub on each new ticket, swept every minute
#              by Cloud Scheduler. Scales to zero between tickets.
#   dashboard  Cloud Run, public, read-only (actions are off until it has a login)
#   secrets    Secret Manager: Terraform creates the secrets, their values are added by
#              infra/secrets.sh from local files, so no secret ever lands in Terraform state.

locals {
  services = [
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "pubsub.googleapis.com",
    "cloudscheduler.googleapis.com",
    "secretmanager.googleapis.com",
    "iam.googleapis.com",
  ]
  deployed = var.core_image != "" && var.dashboard_image != ""
}

resource "google_project_service" "apis" {
  for_each           = toset(local.services)
  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "images" {
  repository_id = "agentdesk"
  location      = var.region
  format        = "DOCKER"
  description   = "agentdesk container images"
  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 10
    }
  }
  depends_on = [google_project_service.apis]
}

# One service account per workload, each with only what it needs.
resource "google_service_account" "api" {
  account_id   = "agentdesk-api"
  display_name = "agentdesk API"
}

resource "google_service_account" "worker" {
  account_id   = "agentdesk-worker"
  display_name = "agentdesk worker"
}

resource "google_service_account" "dashboard" {
  account_id   = "agentdesk-dashboard"
  display_name = "agentdesk dashboard"
}

resource "google_service_account" "invoker" {
  account_id   = "agentdesk-invoker"
  display_name = "Pub/Sub and Scheduler calling the worker"
}
