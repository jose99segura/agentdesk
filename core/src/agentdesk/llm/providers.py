"""Model providers over plain HTTP. Each one raises ProviderError, never anything else."""

import json
import time
from typing import Protocol

import httpx

from .types import Completion, Message, ProviderError, ToolCall, ToolSpec

TIMEOUT = httpx.Timeout(45.0, connect=5.0)


class Provider(Protocol):
    name: str
    model: str

    def complete(
        self, messages: list[Message], tools: list[ToolSpec], force_tool: str | None
    ) -> Completion: ...


def _http_error(provider: str, exc: Exception) -> ProviderError:
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        transient = status == 429 or status >= 500
        body = exc.response.text[:300]
        return ProviderError(provider, f"HTTP {status}: {body}", transient=transient, status=status)
    return ProviderError(provider, f"{type(exc).__name__}: {exc}", transient=True)


class MistralProvider:
    name = "mistral"

    def __init__(self, api_key: str, model: str):
        self.model = model
        self._client = httpx.Client(
            base_url="https://api.mistral.ai/v1",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=TIMEOUT,
        )

    def complete(self, messages, tools, force_tool):
        body = {
            "model": self.model,
            "temperature": 0.2,
            "messages": [self._message(m) for m in messages],
        }
        if tools:
            body["tools"] = [
                {
                    "type": "function",
                    "function": {"name": t.name, "description": t.description,
                                 "parameters": t.parameters},
                }
                for t in tools
            ]
            # Forcing works by offering only the forced tool and requiring a call.
            body["tool_choice"] = "any" if force_tool else "auto"
        started = time.monotonic()
        try:
            res = self._client.post("/chat/completions", json=body)
            res.raise_for_status()
            data = res.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise _http_error(self.name, exc) from exc
        msg = data["choices"][0]["message"]
        calls = []
        for c in msg.get("tool_calls") or []:
            args = c["function"]["arguments"]
            calls.append(ToolCall(
                id=c["id"], name=c["function"]["name"],
                arguments=json.loads(args) if isinstance(args, str) else args,
            ))
        usage = data.get("usage") or {}
        return Completion(
            text=msg.get("content") or "",
            tool_calls=calls,
            provider=self.name,
            model=data.get("model", self.model),
            input_tokens=usage.get("prompt_tokens", 0),
            output_tokens=usage.get("completion_tokens", 0),
            latency_ms=int((time.monotonic() - started) * 1000),
        )

    @staticmethod
    def _message(m: Message) -> dict:
        out: dict = {"role": m.role, "content": m.content}
        if m.tool_calls:
            out["tool_calls"] = [
                {"id": c.id, "type": "function",
                 "function": {"name": c.name, "arguments": json.dumps(c.arguments)}}
                for c in m.tool_calls
            ]
        if m.role == "tool":
            out["tool_call_id"] = m.tool_call_id
            out["name"] = m.name
        return out


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, api_key: str, model: str):
        self.model = model
        self._client = httpx.Client(
            base_url="https://api.anthropic.com/v1",
            headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
            timeout=TIMEOUT,
        )

    def complete(self, messages, tools, force_tool):
        system = "\n\n".join(m.content for m in messages if m.role == "system")
        body: dict = {
            "model": self.model,
            "max_tokens": 1500,
            "temperature": 0.2,
            "system": system,
            "messages": self._messages([m for m in messages if m.role != "system"]),
        }
        if tools:
            body["tools"] = [
                {"name": t.name, "description": t.description, "input_schema": t.parameters}
                for t in tools
            ]
            body["tool_choice"] = (
                {"type": "tool", "name": force_tool} if force_tool else {"type": "auto"}
            )
        started = time.monotonic()
        try:
            res = self._client.post("/messages", json=body)
            res.raise_for_status()
            data = res.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise _http_error(self.name, exc) from exc
        text = "".join(b.get("text", "") for b in data["content"] if b["type"] == "text")
        calls = [
            ToolCall(id=b["id"], name=b["name"], arguments=b["input"])
            for b in data["content"] if b["type"] == "tool_use"
        ]
        usage = data.get("usage") or {}
        return Completion(
            text=text,
            tool_calls=calls,
            provider=self.name,
            model=data.get("model", self.model),
            input_tokens=usage.get("input_tokens", 0),
            output_tokens=usage.get("output_tokens", 0),
            latency_ms=int((time.monotonic() - started) * 1000),
        )

    @staticmethod
    def _messages(messages: list[Message]) -> list[dict]:
        """Tool results become user turns; consecutive ones share a single turn."""
        out: list[dict] = []
        for m in messages:
            if m.role == "tool":
                block = {"type": "tool_result", "tool_use_id": m.tool_call_id, "content": m.content}
                if out and out[-1]["role"] == "user" and isinstance(out[-1]["content"], list):
                    out[-1]["content"].append(block)
                else:
                    out.append({"role": "user", "content": [block]})
            elif m.role == "assistant" and m.tool_calls:
                blocks: list[dict] = [{"type": "text", "text": m.content}] if m.content else []
                blocks += [
                    {"type": "tool_use", "id": c.id, "name": c.name, "input": c.arguments}
                    for c in m.tool_calls
                ]
                out.append({"role": "assistant", "content": blocks})
            else:
                out.append({"role": m.role, "content": m.content})
        return out
