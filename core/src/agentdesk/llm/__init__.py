from collections.abc import Callable

from ..config import Settings
from .offline import OfflineProvider
from .providers import AnthropicProvider, MistralProvider, Provider
from .router import CircuitBreaker, ModelRouter


def build_providers(cfg: Settings) -> list[Provider]:
    """The configured chain, minus providers that have no key (or offline when disallowed)."""
    available: dict[str, Callable[[], Provider]] = {}
    if cfg.mistral_api_key:
        available["mistral"] = lambda: MistralProvider(cfg.mistral_api_key, cfg.mistral_model)
    if cfg.anthropic_api_key:
        available["anthropic"] = lambda: AnthropicProvider(cfg.anthropic_api_key, cfg.anthropic_model)
    if cfg.allow_offline_model:
        available["offline"] = OfflineProvider
    chain = [name.strip() for name in cfg.model_chain.split(",") if name.strip()]
    return [available[name]() for name in chain if name in available]


def build_router(
    cfg: Settings,
    is_faulted: Callable[[str], bool],
    on_health: Callable[[str, CircuitBreaker], None],
) -> ModelRouter:
    return ModelRouter(build_providers(cfg), is_faulted=is_faulted, on_health=on_health)
