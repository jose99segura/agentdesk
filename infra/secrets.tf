# The secrets exist here; their values do not. infra/secrets.sh adds a version to each
# from core/.env and infra/.secrets/, which never leave the machine except into Secret
# Manager. Who may read what is decided here.

locals {
  secrets = {
    database-url-agent      = ["worker"]
    database-url-api        = ["api", "worker"]
    api-token               = ["api", "dashboard"]
    mistral-api-key         = ["worker", "api"]
    anthropic-api-key       = ["worker", "api"]
    langfuse-public-key     = ["worker", "api"]
    langfuse-secret-key     = ["worker", "api"]
    telegram-bot-token      = ["worker", "api"]
    telegram-webhook-secret = ["api"]
    # Voice channel (ElevenAgents): only the API talks to ElevenLabs.
    elevenlabs-api-key        = ["api"]
    voice-tool-secret         = ["api"]
    elevenlabs-webhook-secret = ["api"]
  }
  accounts = {
    api       = google_service_account.api.email
    worker    = google_service_account.worker.email
    dashboard = google_service_account.dashboard.email
  }
  grants = flatten([
    for secret, readers in local.secrets : [for r in readers : { secret = secret, reader = r }]
  ])
}

resource "google_secret_manager_secret" "s" {
  for_each  = local.secrets
  secret_id = "agentdesk-${each.key}"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_iam_member" "read" {
  for_each  = { for g in local.grants : "${g.secret}/${g.reader}" => g }
  secret_id = google_secret_manager_secret.s[each.value.secret].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${local.accounts[each.value.reader]}"
}
