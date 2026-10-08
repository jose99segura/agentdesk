"""Provider-neutral shapes. Each provider adapter translates to and from these."""

from dataclasses import dataclass, field
from typing import Any, Literal


@dataclass
class ToolSpec:
    name: str
    description: str
    parameters: dict[str, Any]  # JSON schema of the arguments


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class Message:
    role: Literal["system", "user", "assistant", "tool"]
    content: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    tool_call_id: str | None = None
    name: str | None = None


@dataclass
class Completion:
    text: str
    tool_calls: list[ToolCall]
    provider: str
    model: str
    input_tokens: int
    output_tokens: int
    latency_ms: int


class ProviderError(Exception):
    """A call to a model provider failed. `transient` errors are worth retrying."""

    def __init__(self, provider: str, message: str, *, transient: bool, status: int | None = None):
        super().__init__(f"{provider}: {message}")
        self.provider = provider
        self.transient = transient
        self.status = status


class AllProvidersFailed(Exception):
    """Every provider in the chain failed or had its circuit open."""
