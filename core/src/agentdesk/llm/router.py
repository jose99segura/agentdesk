"""Retries, circuit breakers and fallback across model providers.

Per call: try each provider in order. A transient error is retried on the same
provider with jittered backoff; a provider that keeps failing gets its circuit
opened for a cooldown so later calls skip it at once instead of waiting on it.
Every retry, skip and fallback is recorded as a run step, so the dashboard and the
trace show exactly which model answered and why.
"""

import random
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field

from .providers import Provider
from .types import AllProvidersFailed, Completion, Message, ProviderError, ToolSpec


@dataclass
class CircuitBreaker:
    failure_threshold: int = 3
    cooldown_s: float = 30.0
    state: str = "closed"  # closed -> open -> half_open -> closed
    consecutive_failures: int = 0
    opened_at: float = 0.0
    last_error: str | None = None
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def allow(self, now: float | None = None) -> bool:
        now = time.monotonic() if now is None else now
        with self._lock:
            if self.state == "open" and now - self.opened_at >= self.cooldown_s:
                self.state = "half_open"  # let one probe through
            return self.state != "open"

    def record_success(self) -> None:
        with self._lock:
            self.state = "closed"
            self.consecutive_failures = 0
            self.last_error = None

    def record_failure(self, error: str, now: float | None = None) -> None:
        now = time.monotonic() if now is None else now
        with self._lock:
            self.consecutive_failures += 1
            self.last_error = error
            if self.state == "half_open" or self.consecutive_failures >= self.failure_threshold:
                self.state = "open"
                self.opened_at = now


class StepSink:
    """Where the router reports what it did (implemented by the run recorder)."""

    def step(self, kind: str, name: str, status: str, **data) -> None: ...


def backoff_s(attempt: int, base: float = 0.5, cap: float = 8.0) -> float:
    return min(cap, base * 2 ** (attempt - 1)) * random.uniform(0.5, 1.5)


class ModelRouter:
    def __init__(
        self,
        providers: list[Provider],
        *,
        attempts_per_provider: int = 2,
        is_faulted: Callable[[str], bool] = lambda _: False,
        on_health: Callable[[str, CircuitBreaker], None] = lambda *_: None,
        sleep: Callable[[float], None] = time.sleep,
    ):
        if not providers:
            raise ValueError("no model providers configured")
        self.providers = providers
        self.breakers = {p.name: CircuitBreaker() for p in providers}
        self.attempts = attempts_per_provider
        self._is_faulted = is_faulted
        self._on_health = on_health
        self._sleep = sleep

    def complete(
        self,
        messages: list[Message],
        tools: list[ToolSpec],
        force_tool: str | None,
        sink: StepSink,
    ) -> Completion:
        for index, provider in enumerate(self.providers):
            breaker = self.breakers[provider.name]
            if not breaker.allow():
                sink.step("fallback", f"skip {provider.name}", "blocked",
                          output={"reason": "circuit open", "last_error": breaker.last_error})
                continue
            for attempt in range(1, self.attempts + 1):
                try:
                    if self._is_faulted(provider.name):
                        raise ProviderError(provider.name, "unavailable (fault injected)",
                                            transient=True, status=503)
                    completion = provider.complete(messages, tools, force_tool)
                except ProviderError as exc:
                    breaker.record_failure(str(exc))
                    self._on_health(provider.name, breaker)
                    retry = exc.transient and attempt < self.attempts and breaker.allow()
                    sink.step("retry" if retry else "error", f"{provider.name} attempt {attempt}",
                              "error", output={"error": str(exc), "transient": exc.transient})
                    if not retry:
                        break
                    self._sleep(backoff_s(attempt))
                    continue
                if breaker.state != "closed" or breaker.consecutive_failures:
                    breaker.record_success()
                    self._on_health(provider.name, breaker)
                return completion
            if index < len(self.providers) - 1:
                nxt = self.providers[index + 1].name
                sink.step("fallback", f"{provider.name} -> {nxt}", "ok",
                          output={"from": provider.name, "to": nxt})
        raise AllProvidersFailed("every model provider failed or is open")
