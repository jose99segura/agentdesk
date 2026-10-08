"""Create or update the ElevenLabs voice agent and its two server tools from code.

    uv run agentdesk voice-setup --api-url https://agentdesk-api-...run.app

Like the n8n workflows, the agent is generated, never hand-edited in the ElevenLabs UI:
the prompt and the tool schemas live here and are reviewed with the rest of the code.
Re-running updates the existing tools (matched by name) and the agent in
ELEVENLABS_AGENT_ID; without it, a new agent is created and its id printed.
"""

import logging

import httpx

from .config import settings

log = logging.getLogger(__name__)
ELEVEN = "https://api.elevenlabs.io"
LLM = "gemini-2.5-flash"

PROMPT = """You are the phone support agent of Hearth & Co., a small online homeware store \
(a demo store: say so if asked). You are talking to {{customer_name}}, who is signed in.

What you can do:
- Look up their orders with `order_status` (with an order id for one order, without it for \
their recent orders). Read back status, carrier and dates in plain words, never raw JSON.
- File a ticket with `open_ticket` for anything that needs an action: a refund, a broken or \
missing item, a cancellation, a complaint. Summarise the problem in the customer's words, \
with the order id when there is one.

Rules:
- You cannot refund, cancel or change anything yourself, and you must not say that you did. \
After `open_ticket`, explain that a person on the team reviews it, usually within minutes, \
and the answer appears in the store's support chat.
- Never promise an amount, a date or an outcome the tools did not give you.
- Only talk about this customer's orders. If they ask about someone else's, say you can't.
- Keep answers short: this is a phone call. One question at a time.
- Speak the customer's language if they switch."""

FIRST_MESSAGE = "Hi {{customer_name}}, this is Hearth and Co. support. How can I help you today?"


def _tools(api_url: str, secret: str) -> list[dict]:
    headers = {"X-Agentdesk-Voice": secret}
    caller = {"type": "string", "dynamic_variable": "caller"}
    conversation = {"type": "string", "dynamic_variable": "system__conversation_id"}
    order = {"type": "string", "description": "Order id as the customer says it, e.g. ORD-90003. "
                                              "Omit to list their recent orders."}
    return [
        {"type": "webhook", "name": "order_status",
         "description": "Status, items, tracking and refunds of the caller's orders.",
         "api_schema": {"url": f"{api_url}/voice/tools/order_status", "method": "POST",
                        "request_headers": headers,
                        "request_body_schema": {"type": "object", "required": ["caller", "conversation_id"],
                                                "properties": {"caller": caller,
                                                               "conversation_id": conversation,
                                                               "order_id": order}}}},
        {"type": "webhook", "name": "open_ticket",
         "description": "File the caller's request for a person on the team to review "
                        "(refunds, damaged or missing items, cancellations, complaints).",
         "api_schema": {"url": f"{api_url}/voice/tools/open_ticket", "method": "POST",
                        "request_headers": headers,
                        "request_body_schema": {
                            "type": "object", "required": ["caller", "conversation_id", "summary"],
                            "properties": {
                                "caller": caller, "conversation_id": conversation,
                                "summary": {"type": "string",
                                            "description": "What the customer needs, in their words, "
                                                           "in one to three sentences."},
                                "order_id": {**order,
                                             "description": "Order id the request is about, if any."},
                            }}}},
    ]


def _agent(tool_ids: list[str]) -> dict:
    return {
        "name": "agentdesk · Hearth & Co. phone support",
        "conversation_config": {
            "agent": {
                "first_message": FIRST_MESSAGE,
                "language": "en",
                "prompt": {"prompt": PROMPT, "llm": LLM, "temperature": 0.2, "tool_ids": tool_ids},
                "dynamic_variables": {"dynamic_variable_placeholders": {
                    "customer_name": "there", "caller": "unverified"}},
            },
            "conversation": {"max_duration_seconds": 300},
        },
        # Only a conversation token minted by agentdesk's API can start a call.
        "platform_settings": {"auth": {"enable_auth": True}},
        "tags": ["agentdesk"],
    }


def _check(res: httpx.Response, what: str) -> dict:
    if res.status_code >= 400:
        raise SystemExit(f"{what}: HTTP {res.status_code}\n{res.text[:1500]}")
    return res.json() if res.content else {}


def setup(api_url: str) -> str:
    cfg = settings()
    if not cfg.elevenlabs_api_key or not cfg.voice_tool_secret:
        raise SystemExit("ELEVENLABS_API_KEY and VOICE_TOOL_SECRET must be set")
    api = httpx.Client(base_url=ELEVEN, headers={"xi-api-key": cfg.elevenlabs_api_key}, timeout=30)

    existing = {t["tool_config"]["name"]: t["id"]
                for t in _check(api.get("/v1/convai/tools"), "list tools").get("tools", [])}
    ids = []
    for tool in _tools(api_url.rstrip("/"), cfg.voice_tool_secret):
        if tid := existing.get(tool["name"]):
            _check(api.patch(f"/v1/convai/tools/{tid}", json={"tool_config": tool}), f"update {tool['name']}")
        else:
            created = api.post("/v1/convai/tools", json={"tool_config": tool})
            tid = _check(created, f"create {tool['name']}")["id"]
        ids.append(tid)
        print(f"tool {tool['name']}: {tid}")

    body = _agent(ids)
    if cfg.elevenlabs_agent_id:
        _check(api.patch(f"/v1/convai/agents/{cfg.elevenlabs_agent_id}", json=body), "update agent")
        agent_id = cfg.elevenlabs_agent_id
    else:
        agent_id = _check(api.post("/v1/convai/agents/create", json=body), "create agent")["agent_id"]
        print("New agent: set ELEVENLABS_AGENT_ID in core/.env and in Secret Manager.")
    print(f"agent: {agent_id}")
    return agent_id
