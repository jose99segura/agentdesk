from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Every setting comes from the environment (or `.env` in local dev)."""

    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    # Two connection strings, two database roles: the worker can never act as the API.
    database_url_agent: str = "postgresql://desk_agent:desk_agent_dev@127.0.0.1:54322/postgres"
    database_url_api: str = "postgresql://desk_api:desk_api_dev@127.0.0.1:54322/postgres"

    # Bearer token for the HTTP API (ingest, approvals, dead letter retries, chaos).
    api_token: str = "dev-token"
    api_url: str = "http://127.0.0.1:8000"

    # Providers are tried in this order; one without a key is skipped.
    model_chain: str = "mistral,anthropic,offline"
    mistral_api_key: str | None = None
    mistral_model: str = "mistral-small-latest"
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-haiku-4-5"
    # The offline model is a deterministic stand-in for development, tests and
    # demos without keys. Turn it off in production.
    allow_offline_model: bool = True

    langfuse_public_key: str | None = None
    langfuse_secret_key: str | None = None
    langfuse_host: str = Field(
        default="https://langfuse.senaproject.online",
        validation_alias=AliasChoices("langfuse_host", "langfuse_base_url"),
    )
    # Found through the API when unset; only used to link runs to their trace.
    langfuse_project_id: str | None = None
    # Separates these traces from other apps sharing the same Langfuse project.
    langfuse_environment: str = "agentdesk-dev"

    telegram_bot_token: str | None = None
    telegram_chat_id: str | None = None
    telegram_cards_per_hour: int = 20
    # Production only: Telegram calls POST /telegram/webhook with this secret in a header.
    telegram_webhook_secret: str | None = None
    # Production only: "projects/<p>/topics/<t>"; the API publishes a wake-up per new ticket.
    pubsub_topic: str | None = None
    dashboard_url: str = "http://localhost:3020"

    worker_id: str = "worker-1"
    worker_concurrency: int = 3


@lru_cache
def settings() -> Settings:
    return Settings()
