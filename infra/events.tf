# How the worker gets woken: a Pub/Sub message per new ticket, and a sweep every minute.

resource "google_pubsub_topic" "jobs" {
  name                       = "agentdesk-jobs"
  message_retention_duration = "600s"
  depends_on                 = [google_project_service.apis]
}

resource "google_pubsub_topic_iam_member" "api_publishes" {
  topic  = google_pubsub_topic.jobs.id
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:${google_service_account.api.email}"
}

resource "google_pubsub_subscription" "worker_push" {
  count                = local.deployed ? 1 : 0
  name                 = "agentdesk-worker-push"
  topic                = google_pubsub_topic.jobs.id
  ack_deadline_seconds = 300
  push_config {
    push_endpoint = "${google_cloud_run_v2_service.worker[0].uri}/pubsub"
    oidc_token {
      service_account_email = google_service_account.invoker.email
      audience              = google_cloud_run_v2_service.worker[0].uri
    }
  }
  # The message is only a wake-up call; the job lives in Postgres, so few retries suffice.
  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "60s"
  }
  expiration_policy {
    ttl = ""
  }
}

# Pub/Sub's own agent must be allowed to mint tokens for the invoker account.
resource "google_service_account_iam_member" "pubsub_token_creator" {
  service_account_id = google_service_account.invoker.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:service-${data.google_project.this.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

resource "google_cloud_scheduler_job" "sweep" {
  count            = local.deployed ? 1 : 0
  name             = "agentdesk-sweep"
  region           = var.region
  description      = "Reclaim expired leases, run due retries, send Telegram cards and alerts."
  schedule         = "* * * * *"
  time_zone        = "Europe/Luxembourg"
  attempt_deadline = "320s"
  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.worker[0].uri}/sweep"
    oidc_token {
      service_account_email = google_service_account.invoker.email
      audience              = google_cloud_run_v2_service.worker[0].uri
    }
  }
  retry_config {
    retry_count = 0
  }
}
