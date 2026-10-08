#!/usr/bin/env bash
# Production secrets, in two steps. Nothing printed here contains a secret value.
#
#   bash infra/secrets.sh generate   creates infra/.secrets/generated.env (role passwords, API
#                                    token, Telegram webhook secret) once, and writes
#                                    infra/.secrets/bootstrap.sql: role passwords plus the
#                                    demo store, to paste into Supabase's SQL editor.
#   bash infra/secrets.sh push       adds a version to every Secret Manager secret, from that
#                                    file and core/.env (Mistral, Langfuse, Telegram).
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT_REF="cinyqwetgzjgfcgzinxo"
POOLER="aws-0-eu-west-1.pooler.supabase.com:5432"
DIR="infra/.secrets"
GEN="$DIR/generated.env"
mkdir -p "$DIR"

rand() { python -c "import secrets; print(secrets.token_urlsafe(32).replace('-', 'x').replace('_', 'y'))"; }
val() { grep -E "^$1=" "$2" | tail -1 | cut -d= -f2-; }

generate() {
  if [ ! -f "$GEN" ]; then
    {
      echo "DESK_AGENT_PASSWORD=$(rand)"
      echo "DESK_API_PASSWORD=$(rand)"
      echo "API_TOKEN=$(rand)"
      echo "TELEGRAM_WEBHOOK_SECRET=$(rand)"
    } > "$GEN"
    echo "created $GEN"
  else
    echo "kept existing $GEN"
  fi
  {
    echo "-- agentdesk production bootstrap. Paste into Supabase > SQL Editor and run once."
    echo "-- Contains passwords: never commit, delete after use."
    echo "alter role desk_agent with login password '$(val DESK_AGENT_PASSWORD "$GEN")';"
    echo "alter role desk_api with login password '$(val DESK_API_PASSWORD "$GEN")';"
    echo
    # The demo store and evaluation fixtures, without the dev-only role passwords.
    grep -v -i "^alter role" supabase/seed.sql
  } > "$DIR/bootstrap.sql"
  echo "wrote $DIR/bootstrap.sql"
}

put() {  # put <secret> <value>
  if [ -z "$2" ]; then echo "skip agentdesk-$1 (no value)"; return; fi
  printf '%s' "$2" | gcloud secrets versions add "agentdesk-$1" --data-file=- --quiet >/dev/null
  echo "set agentdesk-$1"
}

push() {
  [ -f "$GEN" ] || { echo "run 'generate' first"; exit 1; }
  local env="core/.env"
  put database-url-agent "postgresql://desk_agent.$PROJECT_REF:$(val DESK_AGENT_PASSWORD "$GEN")@$POOLER/postgres?sslmode=require"
  put database-url-api "postgresql://desk_api.$PROJECT_REF:$(val DESK_API_PASSWORD "$GEN")@$POOLER/postgres?sslmode=require"
  put api-token "$(val API_TOKEN "$GEN")"
  put telegram-webhook-secret "$(val TELEGRAM_WEBHOOK_SECRET "$GEN")"
  put mistral-api-key "$(val MISTRAL_API_KEY "$env")"
  put anthropic-api-key "$(val ANTHROPIC_API_KEY "$env")"
  put langfuse-public-key "$(val LANGFUSE_PUBLIC_KEY "$env")"
  put langfuse-secret-key "$(val LANGFUSE_SECRET_KEY "$env")"
  put telegram-bot-token "$(val TELEGRAM_BOT_TOKEN "$env")"
}

case "${1:-}" in
  generate) generate ;;
  push) push ;;
  *) echo "usage: bash infra/secrets.sh generate|push"; exit 2 ;;
esac
