#!/usr/bin/env bash
# Build both images with Cloud Build (native amd64, no local Docker needed), then let
# Terraform roll them out, then point Telegram's webhook at the API.
#
#   bash infra/deploy.sh <project-id>
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT="${1:?usage: bash infra/deploy.sh <project-id>}"
REGION="europe-west1"
REGISTRY="$REGION-docker.pkg.dev/$PROJECT/agentdesk"
TAG="$(git rev-parse --short=12 HEAD)"
SUPABASE_URL="https://cinyqwetgzjgfcgzinxo.supabase.co"
TF="terraform -chdir=infra"

echo "== images ($TAG)"
gcloud builds submit core --project "$PROJECT" --region "$REGION" --tag "$REGISTRY/core:$TAG" --quiet
ANON_KEY="$(npx -y supabase@2.120.0 projects api-keys --project-ref cinyqwetgzjgfcgzinxo -o json \
  | python -c "import sys,json; print(next(k['api_key'] for k in json.load(sys.stdin) if k.get('name')=='anon'))")"
gcloud builds submit dashboard --project "$PROJECT" --region "$REGION" --config infra/cloudbuild-dashboard.yaml \
  --substitutions "_IMAGE=$REGISTRY/dashboard:$TAG,_SUPABASE_URL=$SUPABASE_URL,_ANON_KEY=$ANON_KEY" --quiet

echo "== services"
$TF apply -auto-approve -input=false \
  -var "project_id=$PROJECT" \
  -var "core_image=$REGISTRY/core:$TAG" \
  -var "dashboard_image=$REGISTRY/dashboard:$TAG"

API_URL="$($TF output -raw api_url)"
echo "== telegram webhook -> $API_URL/telegram/webhook"
BOT="$(gcloud secrets versions access latest --secret agentdesk-telegram-bot-token --project "$PROJECT")"
SECRET="$(gcloud secrets versions access latest --secret agentdesk-telegram-webhook-secret --project "$PROJECT")"
curl -s "https://api.telegram.org/bot$BOT/setWebhook" \
  -d "url=$API_URL/telegram/webhook" -d "secret_token=$SECRET" -d 'allowed_updates=["callback_query"]' \
  | python -c "import sys,json; r=json.load(sys.stdin); print('webhook:', r.get('ok'), r.get('description'))"

echo "== done"
$TF output
