# The three Cloud Run services. Created once images exist (see variables core_image and
# dashboard_image); the first `terraform apply` only lays the groundwork.

locals {
  secret_env = {
    api = {
      DATABASE_URL_API          = "database-url-api"
      DATABASE_URL_AGENT        = "database-url-api" # the API never runs agents; keep it off the agent role
      API_TOKEN                 = "api-token"
      MISTRAL_API_KEY           = "mistral-api-key"
      ANTHROPIC_API_KEY         = "anthropic-api-key"
      LANGFUSE_PUBLIC_KEY       = "langfuse-public-key"
      LANGFUSE_SECRET_KEY       = "langfuse-secret-key"
      TELEGRAM_BOT_TOKEN        = "telegram-bot-token"
      TELEGRAM_WEBHOOK_SECRET   = "telegram-webhook-secret"
      ELEVENLABS_API_KEY        = "elevenlabs-api-key"
      VOICE_TOOL_SECRET         = "voice-tool-secret"
      ELEVENLABS_WEBHOOK_SECRET = "elevenlabs-webhook-secret"
    }
    worker = {
      DATABASE_URL_AGENT  = "database-url-agent"
      DATABASE_URL_API    = "database-url-api"
      MISTRAL_API_KEY     = "mistral-api-key"
      ANTHROPIC_API_KEY   = "anthropic-api-key"
      LANGFUSE_PUBLIC_KEY = "langfuse-public-key"
      LANGFUSE_SECRET_KEY = "langfuse-secret-key"
      TELEGRAM_BOT_TOKEN  = "telegram-bot-token"
    }
  }
  # Cloud Run refuses a secret with no version, so optional ones join once they have a value.
  optional_secrets = {
    "anthropic-api-key"         = var.with_anthropic
    "elevenlabs-api-key"        = var.with_voice
    "voice-tool-secret"         = var.with_voice
    "elevenlabs-webhook-secret" = var.with_voice_webhook
  }
  common_env = {
    MODEL_CHAIN          = var.model_chain
    MISTRAL_MODEL        = var.mistral_model
    ALLOW_OFFLINE_MODEL  = "true"
    LANGFUSE_HOST        = var.langfuse_host
    LANGFUSE_PROJECT_ID  = var.langfuse_project_id
    LANGFUSE_ENVIRONMENT = "production"
    TELEGRAM_CHAT_ID     = var.telegram_chat_id
    WORKER_CONCURRENCY   = "1"
  }
}

resource "google_cloud_run_v2_service" "api" {
  count               = local.deployed ? 1 : 0
  name                = "agentdesk-api"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  template {
    service_account = google_service_account.api.email
    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }
    containers {
      image = var.core_image
      resources {
        limits            = { cpu = "1", memory = "512Mi" }
        cpu_idle          = true
        startup_cpu_boost = true
      }
      dynamic "env" {
        for_each = merge(local.common_env, {
          WORKER_ID           = "api"
          PUBSUB_TOPIC        = google_pubsub_topic.jobs.id
          DASHBOARD_URL       = "https://agentdesk-dashboard-${data.google_project.this.number}.${var.region}.run.app"
          ELEVENLABS_AGENT_ID = var.elevenlabs_agent_id
        })
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = { for k, v in local.secret_env.api : k => v if lookup(local.optional_secrets, v, true) }
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.s[env.value].secret_id
              version = "latest"
            }
          }
        }
      }
      # The process, not the database: a slow first connection must not get the instance killed.
      startup_probe {
        http_get { path = "/livez" }
        initial_delay_seconds = 2
        period_seconds        = 5
        failure_threshold     = 24
      }
    }
  }
  depends_on = [google_secret_manager_secret_iam_member.read]
}

resource "google_cloud_run_v2_service" "worker" {
  count               = local.deployed ? 1 : 0
  name                = "agentdesk-worker"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL" # authentication, not network, keeps it private
  deletion_protection = false

  template {
    service_account = google_service_account.worker.email
    timeout         = "300s"
    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }
    max_instance_request_concurrency = 4
    containers {
      image = var.core_image
      resources {
        limits            = { cpu = "1", memory = "512Mi" }
        cpu_idle          = true
        startup_cpu_boost = true
      }
      dynamic "env" {
        for_each = merge(local.common_env, {
          APP_MODULE     = "agentdesk.cloud:app"
          WORKER_ID      = "cloud"
          DRAIN_BUDGET_S = "240"
          DASHBOARD_URL  = "https://agentdesk-dashboard-${data.google_project.this.number}.${var.region}.run.app"
        })
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = { for k, v in local.secret_env.worker : k => v if lookup(local.optional_secrets, v, true) }
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.s[env.value].secret_id
              version = "latest"
            }
          }
        }
      }
      # The process, not the database: a slow first connection must not get the instance killed.
      startup_probe {
        http_get { path = "/livez" }
        initial_delay_seconds = 2
        period_seconds        = 5
        failure_threshold     = 24
      }
    }
  }
  depends_on = [google_secret_manager_secret_iam_member.read]
}

resource "google_cloud_run_v2_service" "dashboard" {
  count               = local.deployed ? 1 : 0
  name                = "agentdesk-dashboard"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  template {
    service_account = google_service_account.dashboard.email
    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }
    containers {
      image = var.dashboard_image
      ports {
        container_port = 3000
      }
      resources {
        limits            = { cpu = "1", memory = "512Mi" }
        cpu_idle          = true
        startup_cpu_boost = true
      }
      env {
        name  = "CORE_API_URL"
        value = google_cloud_run_v2_service.api[0].uri
      }
      env {
        # No login yet: a public dashboard must not approve refunds or take providers down.
        name  = "DASHBOARD_ACTIONS_ENABLED"
        value = "false"
      }
      env {
        # The demo store's chat enters through n8n, like a real website's would.
        name  = "SHOP_INTAKE_URL"
        value = var.shop_intake_url
      }
      env {
        name = "CORE_API_TOKEN"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.s["api-token"].secret_id
            version = "latest"
          }
        }
      }
    }
  }
  depends_on = [google_secret_manager_secret_iam_member.read]
}

data "google_project" "this" {}

# Public: the API checks its bearer token itself; the dashboard is a read-only demo.
resource "google_cloud_run_v2_service_iam_member" "api_public" {
  count    = local.deployed ? 1 : 0
  name     = google_cloud_run_v2_service.api[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "dashboard_public" {
  count    = local.deployed ? 1 : 0
  name     = google_cloud_run_v2_service.dashboard[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Private: only Pub/Sub and Scheduler, through the invoker account, may call the worker.
resource "google_cloud_run_v2_service_iam_member" "worker_invoker" {
  count    = local.deployed ? 1 : 0
  name     = google_cloud_run_v2_service.worker[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.invoker.email}"
}

# The dashboard on its own hostname: a CNAME to ghs.googlehosted.com at Hostinger, the domain
# verified in Search Console by the same Google account; Google issues the certificate.
resource "google_cloud_run_domain_mapping" "dashboard" {
  count    = local.deployed && var.dashboard_domain != "" ? 1 : 0
  location = var.region
  name     = var.dashboard_domain
  metadata {
    namespace = var.project_id
  }
  spec {
    route_name = google_cloud_run_v2_service.dashboard[0].name
  }
}
