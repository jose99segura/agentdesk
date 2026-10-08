"""Builds the n8n workflow files in this folder (python n8n/build.py).

The workflows are authored here, as data, so their structure, notes and settings stay
consistent and reviewable; the generated JSON is what gets imported into n8n. Each one
carries sticky notes explaining what it does, what it needs and how it fails.

Credentials are referenced by name and created by hand in n8n, never stored here:
  "agentdesk API (Bearer)"       HTTP Bearer Auth with the API_TOKEN of the deployment
  "Telegram · Gustavo Asistente" Telegram API with the bot token
"""

import json
from pathlib import Path

HERE = Path(__file__).parent
# The production API on Cloud Run. Change here (and re-import) when a custom domain is mapped.
API = "https://agentdesk-api-pzm2fnni7a-ew.a.run.app"
CHAT_ID = "232114558"
API_CRED = {"httpBearerAuth": {"id": "YwSzDSgZ2hfqO1Ts", "name": "agentdesk API (Bearer)"}}
TG_CRED = {"telegramApi": {"id": "jpqRohOJq3akCo2G", "name": "Telegram · Gustavo Asistente"}}

_n = 0


def node(name, type_, version, position, parameters=None, **extra):
    global _n
    _n += 1
    return {"parameters": parameters or {}, "id": f"agentdesk-{_n:04d}", "name": name,
            "type": type_, "typeVersion": version, "position": position, **extra}


def note(text, position, width=320, height=200, color=7):
    return node(f"Note {_n + 1}", "n8n-nodes-base.stickyNote", 1, position,
                {"content": text, "width": width, "height": height, "color": color})


def link(*pairs):
    """connections from (source, [targets per output]) pairs."""
    out = {}
    for source, outputs in pairs:
        out[source] = {"main": [[{"node": t, "type": "main", "index": 0} for t in targets]
                                for targets in outputs]}
    return out


def workflow(name, nodes, connections, error_workflow=True):
    settings = {"executionOrder": "v1", "saveDataErrorExecution": "all",
                "saveDataSuccessExecution": "all", "timezone": "Europe/Luxembourg"}
    if error_workflow:
        settings["errorWorkflow"] = "{{ERROR_WORKFLOW_ID}}"
    return {"name": name, "nodes": nodes, "connections": connections, "settings": settings,
            "pinData": {}}


def http_create_ticket(position):
    return node(
        "Create ticket", "n8n-nodes-base.httpRequest", 4.2, position,
        {"method": "POST", "url": f"{API}/tickets", "authentication": "genericCredentialType",
         "genericAuthType": "httpBearerAuth", "sendBody": True, "specifyBody": "json",
         "jsonBody": "={{ JSON.stringify($json.ticket) }}", "options": {"timeout": 10000}},
        credentials=API_CRED, retryOnFail=True, maxTries=5, waitBetweenTries=5000,
        onError="continueErrorOutput",
    )


NORMALIZE = """// One shape for every channel: email, order number and message in, an API ticket out.
const b = $input.first().json;
const email = String(b.email ?? b.customer_email ?? '').trim().toLowerCase();
const body = String(b.message ?? b.body ?? '').trim();
const order = String(b.order ?? '').trim().toUpperCase();
if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email) || body.length < 3) {
  return [{ json: { valid: false, error: 'A valid email and a message are required.' } }];
}
return [{
  json: {
    valid: true,
    ticket: {
      channel: ['chat', 'form', 'email'].includes(b.channel) ? b.channel : 'form',
      customer_email: email,
      subject: order ? `Order ${order}` : (b.subject ?? null),
      body: (order && !body.includes(order) ? `${body}\\n\\nOrder: ${order}` : body).slice(0, 10000),
      // The sender's own message id: a redelivered message becomes one ticket, not two.
      external_id: b.id ? `n8n-${b.id}` : undefined,
    },
  },
}];"""


def shared_create_ticket():
    nodes = [
        note("## 00 · create ticket (shared)\nThe one place where a customer message becomes an "
             "agentdesk ticket. Called by **01 · intake webhook** and **02 · contact form**.\n\n"
             "Input: `email`, `message`, optional `order`, `subject`, `channel`, `id`.\n"
             "Output: `{ ok, ticket_id, duplicate }` or `{ ok: false, error }`.",
             [-60, -60], 420, 230, 4),
        note("### Failure handling\n- Invalid input never reaches the API.\n- The API call retries "
             "**3 times, 2 s apart**.\n- After that the error output alerts on Telegram and returns "
             "`ok: false`, so the caller can tell the customer to retry.\n- The API itself is "
             "idempotent on `external_id`: a retry never creates a second ticket.",
             [700, -60], 380, 230, 3),
        node("When called", "n8n-nodes-base.executeWorkflowTrigger", 1.1, [0, 300],
             {"inputSource": "passthrough"}),
        node("Normalize and validate", "n8n-nodes-base.code", 2, [220, 300], {"jsCode": NORMALIZE}),
        node("Valid?", "n8n-nodes-base.if", 2.2, [440, 300], {
            "conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict",
                                       "version": 2},
                           "conditions": [{"id": "valid", "leftValue": "={{ $json.valid }}",
                                           "rightValue": True,
                                           "operator": {"type": "boolean", "operation": "true",
                                                        "singleValue": True}}],
                           "combinator": "and"}, "options": {}}),
        http_create_ticket([680, 220]),
        node("Created", "n8n-nodes-base.set", 3.4, [920, 120], {
            "assignments": {"assignments": [
                {"id": "ok", "name": "ok", "value": True, "type": "boolean"},
                {"id": "tid", "name": "ticket_id", "value": "={{ $json.ticket_id }}", "type": "string"},
                {"id": "dup", "name": "duplicate", "value": "={{ $json.duplicate }}", "type": "boolean"},
            ]}, "options": {}}),
        node("Alert on Telegram", "n8n-nodes-base.telegram", 1.2, [920, 320], {
            "chatId": CHAT_ID,
            "text": "=🔴 agentdesk intake could not reach the API after 3 tries.\n"
                    "{{ $json.error?.message ?? 'unknown error' }}",
            "additionalFields": {"appendAttribution": False}}, credentials=TG_CRED,
             onError="continueRegularOutput"),
        node("Unavailable", "n8n-nodes-base.set", 3.4, [1140, 320], {
            "assignments": {"assignments": [
                {"id": "ok", "name": "ok", "value": False, "type": "boolean"},
                {"id": "err", "name": "error", "value": "The service is temporarily unavailable. Please try again.",
                 "type": "string"},
            ]}, "options": {}}),
        node("Invalid", "n8n-nodes-base.set", 3.4, [680, 440], {
            "assignments": {"assignments": [
                {"id": "ok", "name": "ok", "value": False, "type": "boolean"},
                {"id": "err", "name": "error", "value": "={{ $json.error }}", "type": "string"},
            ]}, "options": {}}),
    ]
    return workflow("00 · create ticket (shared)", nodes, link(
        ("When called", [["Normalize and validate"]]),
        ("Normalize and validate", [["Valid?"]]),
        ("Valid?", [["Create ticket"], ["Invalid"]]),
        ("Create ticket", [["Created"], ["Alert on Telegram"]]),
        ("Alert on Telegram", [["Unavailable"]]),
    ))


def call_shared(position):
    return node("Create ticket (00)", "n8n-nodes-base.executeWorkflow", 1.2, position, {
        "workflowId": {"__rl": True, "value": "{{SHARED_WORKFLOW_ID}}", "mode": "id"},
        "options": {"waitForSubWorkflow": True}})


def intake_webhook():
    nodes = [
        note("## 01 · intake webhook\nFor chat widgets and websites. `POST /webhook/agentdesk/intake` "
             "with `{ email, message, order?, channel?, id? }`.\n\nAnswers **202** with the ticket id "
             "(agents work asynchronously: queued, not resolved), **400** for invalid input and **503** "
             "when the platform cannot be reached.", [-60, -60], 440, 220, 4),
        node("Inbound message", "n8n-nodes-base.webhook", 2, [0, 300],
             {"httpMethod": "POST", "path": "agentdesk/intake", "responseMode": "responseNode",
              "options": {}}, webhookId="agentdesk-intake"),
        node("Body", "n8n-nodes-base.set", 3.4, [220, 300],
             {"mode": "raw", "jsonOutput": "={{ $json.body }}", "options": {}}),
        call_shared([440, 300]),
        node("Accepted?", "n8n-nodes-base.if", 2.2, [660, 300], {
            "conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict",
                                       "version": 2},
                           "conditions": [{"id": "ok", "leftValue": "={{ $json.ok }}", "rightValue": True,
                                           "operator": {"type": "boolean", "operation": "true",
                                                        "singleValue": True}}],
                           "combinator": "and"}, "options": {}}),
        node("202 Accepted", "n8n-nodes-base.respondToWebhook", 1.1, [900, 200], {
            "respondWith": "json",
            "responseBody": "={{ { ticket_id: $json.ticket_id, duplicate: $json.duplicate } }}",
            "options": {"responseCode": 202}}),
        node("400 or 503", "n8n-nodes-base.respondToWebhook", 1.1, [900, 400], {
            "respondWith": "json", "responseBody": "={{ { error: $json.error } }}",
            "options": {"responseCode": "={{ $json.error?.includes('temporarily') ? 503 : 400 }}"}}),
    ]
    return workflow("01 · intake webhook", nodes, link(
        ("Inbound message", [["Body"]]),
        ("Body", [["Create ticket (00)"]]),
        ("Create ticket (00)", [["Accepted?"]]),
        ("Accepted?", [["202 Accepted"], ["400 or 503"]]),
    ))


def contact_form():
    nodes = [
        note("## 02 · contact form\nA public contact form hosted by n8n itself: the simplest real channel "
             "into agentdesk. Open its **Production URL** once the workflow is active.\n\nThe customer "
             "sees a confirmation, or a clear retry message if the platform is down.",
             [-60, -60], 420, 200, 4),
        node("Contact form", "n8n-nodes-base.formTrigger", 2.2, [0, 300], {
            "formTitle": "Contact the store",
            "formDescription": "Questions about an order, a return or a refund. We usually answer within minutes.",
            "formFields": {"values": [
                {"fieldLabel": "Email", "fieldType": "email", "requiredField": True},
                {"fieldLabel": "Order number", "placeholder": "ORD-10042"},
                {"fieldLabel": "Message", "fieldType": "textarea", "requiredField": True},
            ]},
            "options": {"appendAttribution": False, "buttonLabel": "Send"}},
             webhookId="agentdesk-contact-form"),
        node("Map fields", "n8n-nodes-base.set", 3.4, [220, 300], {
            "assignments": {"assignments": [
                {"id": "e", "name": "email", "value": "={{ $json.Email }}", "type": "string"},
                {"id": "o", "name": "order", "value": "={{ $json['Order number'] }}", "type": "string"},
                {"id": "m", "name": "message", "value": "={{ $json.Message }}", "type": "string"},
                {"id": "c", "name": "channel", "value": "form", "type": "string"},
            ]}, "options": {}}),
        call_shared([440, 300]),
        node("Confirmation", "n8n-nodes-base.form", 1, [660, 300], {
            "operation": "completion",
            "completionTitle": "={{ $json.ok ? 'Message received' : 'Something went wrong' }}",
            "completionMessage": "={{ $json.ok ? 'Thanks! Our team is on it and will reply by email.' : $json.error }}",
            "options": {}}),
    ]
    return workflow("02 · contact form", nodes, link(
        ("Contact form", [["Map fields"]]),
        ("Map fields", [["Create ticket (00)"]]),
        ("Create ticket (00)", [["Confirmation"]]),
    ))


def traffic_generator():
    nodes = [
        note("## 03 · traffic generator\nKeeps the demo alive: every 15 minutes, between 08:00 and 22:00 "
             "Luxembourg time, 1–3 simulated customers write in through `POST /simulate`.\n\nThe store and "
             "its customers are synthetic; everything after the API (queue, agents, guards, approvals, "
             "tracing) is the real platform. Deactivate this workflow to stop the traffic.",
             [-60, -60], 460, 230, 4),
        node("Every 15 minutes", "n8n-nodes-base.scheduleTrigger", 1.2, [0, 300],
             {"rule": {"interval": [{"field": "minutes", "minutesInterval": 15}]}}),
        node("Daytime only", "n8n-nodes-base.code", 2, [220, 300], {"jsCode": (
            "// Quiet at night, like a real shop; a varying burst during the day.\n"
            "const hour = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, "
            "timeZone: 'Europe/Luxembourg' }));\n"
            "if (hour < 8 || hour >= 22) return [];\n"
            "return [{ json: { count: 1 + Math.floor(Math.random() * 3) } }];")}),
        node("Simulate customers", "n8n-nodes-base.httpRequest", 4.2, [440, 300], {
            "method": "POST", "url": f"{API}/simulate", "authentication": "genericCredentialType",
            "genericAuthType": "httpBearerAuth", "sendBody": True, "specifyBody": "json",
            "jsonBody": "={{ JSON.stringify({ count: $json.count }) }}", "options": {"timeout": 15000}},
             credentials=API_CRED, retryOnFail=True, maxTries=2, waitBetweenTries=5000),
    ]
    return workflow("03 · traffic generator", nodes, link(
        ("Every 15 minutes", [["Daytime only"]]),
        ("Daytime only", [["Simulate customers"]]),
    ))


REPORT = """// The day in one Telegram message.
const s = $input.first().json;
const k = s.kpis;
const runs = Number(k.runs_ok_24h) + Number(k.runs_failed_24h);
const rate = runs ? (100 * k.runs_ok_24h / runs).toFixed(1) : '—';
const d = s.decisions_24h ?? {};
const e = s.last_eval;
const lines = [
  '📊 <b>agentdesk · last 24 hours</b>',
  `Tickets: <b>${k.tickets_24h}</b> · agent runs: ${runs} (${rate}% ok)`,
  `Latency p50 / p95: ${k.p50_latency_ms} ms / ${k.p95_latency_ms} ms`,
  `Model cost: $${Number(k.cost_24h_usd).toFixed(4)}`,
  `Decisions: ${d.executed ?? 0} executed, ${d.rejected ?? 0} rejected, ${d.failed ?? 0} failed`,
  `Waiting for you: <b>${k.pending_approvals}</b> · dead letters: <b>${k.dead_letters}</b>`,
  `Fallbacks: ${k.fallbacks_24h} · guard blocks: ${k.guard_blocks_24h}`,
  e ? `Last eval: ${e.passed}/${e.cases} (${e.pass_rate}%), gate ${e.gate_passed ? 'open ✅' : 'closed ❌'}` : 'No eval run yet',
];
return [{ json: { text: lines.join('\\n') } }];"""


def daily_report():
    nodes = [
        note("## 04 · daily report\nEvery morning at 08:00: the last 24 hours from `GET /stats` (tickets, "
             "success rate, latency, cost, decisions, backlog, last evaluation) as one Telegram message.",
             [-60, -60], 420, 170, 4),
        node("Every day at 08:00", "n8n-nodes-base.scheduleTrigger", 1.2, [0, 300],
             {"rule": {"interval": [{"triggerAtHour": 8}]}}),
        node("Get stats", "n8n-nodes-base.httpRequest", 4.2, [220, 300], {
            "url": f"{API}/stats", "authentication": "genericCredentialType",
            "genericAuthType": "httpBearerAuth", "options": {"timeout": 15000}},
             credentials=API_CRED, retryOnFail=True, maxTries=3, waitBetweenTries=10000),
        node("Format report", "n8n-nodes-base.code", 2, [440, 300], {"jsCode": REPORT}),
        node("Send to Telegram", "n8n-nodes-base.telegram", 1.2, [660, 300], {
            "chatId": CHAT_ID, "text": "={{ $json.text }}",
            "additionalFields": {"parse_mode": "HTML", "appendAttribution": False}}, credentials=TG_CRED),
    ]
    return workflow("04 · daily report", nodes, link(
        ("Every day at 08:00", [["Get stats"]]),
        ("Get stats", [["Format report"]]),
        ("Format report", [["Send to Telegram"]]),
    ))


def error_handler():
    nodes = [
        note("## 99 · error handler\nSet as the **error workflow** of every agentdesk workflow: when any of "
             "them fails, this sends the workflow name, the failing node, the error and a link to the "
             "execution to Telegram.", [-60, -60], 420, 170, 2),
        node("On workflow error", "n8n-nodes-base.errorTrigger", 1, [0, 300]),
        node("Alert on Telegram", "n8n-nodes-base.telegram", 1.2, [240, 300], {
            "chatId": CHAT_ID,
            "text": "=⚠️ <b>n8n · {{ $json.workflow.name }}</b> failed\nNode: {{ $json.execution.lastNodeExecuted }}\n"
                    "{{ $json.execution.error.message }}\n{{ $json.execution.url }}",
            "additionalFields": {"parse_mode": "HTML", "appendAttribution": False}}, credentials=TG_CRED),
    ]
    return workflow("99 · error handler", nodes, link(("On workflow error", [["Alert on Telegram"]])),
                    error_workflow=False)


WORKFLOWS = {
    "00-create-ticket.json": shared_create_ticket,
    "01-intake-webhook.json": intake_webhook,
    "02-contact-form.json": contact_form,
    "03-traffic-generator.json": traffic_generator,
    "04-daily-report.json": daily_report,
    "99-error-handler.json": error_handler,
}

if __name__ == "__main__":
    for filename, build in WORKFLOWS.items():
        (HERE / filename).write_text(json.dumps(build(), indent=2, ensure_ascii=False) + "\n",
                                     encoding="utf-8", newline="\n")
        print("wrote", filename)
