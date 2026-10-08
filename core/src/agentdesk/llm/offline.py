"""A deterministic stand-in model for development, tests and keyless demos.

It speaks the same protocol as a real provider (tool calls in, tool calls out), so
the queue, gateway, guards, approvals and dashboard all run end to end without an
API key. It is rule-based and labelled `offline` everywhere it appears; it is not
meant to be good, only predictable.
"""

import json
import random
import re
import time
import uuid

from .types import Completion, Message, ToolCall

ORDER_RE = re.compile(r"\bORD-\d{4,6}\b", re.IGNORECASE)

INTENT_WORDS = {
    "damaged_item": ["broken", "damaged", "cracked", "roto", "rota", "dañado", "cassé", "abîmé"],
    "refund_request": ["refund", "money back", "reembolso", "devuelvan el dinero", "rembours"],
    "cancellation": ["cancel", "cancelar", "annuler"],
    "return_request": ["return", "send it back", "devolver", "devolución", "retourner", "renvoyer"],
    "order_status": ["where is", "tracking", "not arrived", "dónde está", "no ha llegado",
                     "seguimiento", "où est", "suivi", "pas arrivé", "pas reçu"],
    "product_question": ["does it", "is it", "material", "size", "medida", "taille", "lavable",
                         "dishwasher", "lavavajillas", "lave-vaisselle"],
}
LANG_WORDS = {
    "es": [" el ", " la ", " mi ", " pedido", " que ", " no ", "hola", "gracias", " está"],
    "fr": [" le ", " la ", " mon ", " commande", " est ", " pas ", "bonjour", "merci"],
    "en": [" the ", " my ", " order", " is ", " not ", "hello", "thanks", " it "],
}
URGENT_WORDS = ["urgent", "urgente", "asap", "inaceptable", "inacceptable", "unacceptable", "!!"]


def detect_language(text: str) -> str:
    padded = f" {' '.join(text.lower().split())} "
    scores = {lang: sum(padded.count(w) for w in words) for lang, words in LANG_WORDS.items()}
    best = max(scores, key=lambda k: scores[k])
    return best if scores[best] else "en"


def detect_intent(text: str) -> str:
    low = text.lower()
    for intent, words in INTENT_WORDS.items():
        if any(w in low for w in words):
            return intent
    return "other"


REPLIES = {
    "es": {
        "greet": "Hola {name},",
        "status": "tu pedido {order} está en estado «{status}». Número de seguimiento: {tracking}.",
        "refund": ("sentimos lo ocurrido con el pedido {order}. Hemos solicitado un reembolso de "
                   "{amount} €; un compañero lo revisa y te confirmamos en cuanto esté aprobado."),
        "return": ("para devolver el pedido {order}, responde a este mensaje con el motivo y te "
                   "enviaremos la etiqueta. El reembolso se hace al recibir el paquete."),
        "cancel": ("hemos pasado tu petición de cancelar el pedido {order} a un compañero, que te "
                   "confirmará si aún es posible."),
        "notfound": "no encuentro ese pedido en tu cuenta. ¿Puedes revisar el número?",
        "other": "gracias por escribirnos. Un compañero revisará tu mensaje y te responderá.",
        "bye": "Un saludo,\nEquipo de atención al cliente",
    },
    "fr": {
        "greet": "Bonjour {name},",
        "status": "votre commande {order} est au statut « {status} ». Numéro de suivi : {tracking}.",
        "refund": ("nous sommes désolés pour la commande {order}. Nous avons demandé un "
                   "remboursement de {amount} € ; un collègue le vérifie et nous vous confirmons "
                   "dès qu'il est approuvé."),
        "return": ("pour retourner la commande {order}, répondez à ce message avec le motif et nous "
                   "vous enverrons l'étiquette. Le remboursement suit la réception du colis."),
        "cancel": ("nous avons transmis votre demande d'annulation de la commande {order} à un "
                   "collègue, qui vous confirmera si c'est encore possible."),
        "notfound": "je ne trouve pas cette commande sur votre compte. Pouvez-vous vérifier le numéro ?",
        "other": "merci pour votre message. Un collègue va le lire et vous répondre.",
        "bye": "Cordialement,\nService client",
    },
    "en": {
        "greet": "Hi {name},",
        "status": "your order {order} is currently '{status}'. Tracking number: {tracking}.",
        "refund": ("we're sorry about order {order}. We've requested a refund of {amount} €; a "
                   "colleague is reviewing it and we'll confirm as soon as it's approved."),
        "return": ("to return order {order}, reply to this message with the reason and we'll send "
                   "you a label. The refund follows once we receive the parcel."),
        "cancel": ("we've passed your request to cancel order {order} to a colleague, who will "
                   "confirm whether that's still possible."),
        "notfound": "I can't find that order on your account. Could you double check the number?",
        "other": "thanks for getting in touch. A colleague will read your message and reply.",
        "bye": "Best regards,\nCustomer support",
    },
}


class OfflineProvider:
    name = "offline"
    model = "offline"

    def __init__(self, seed: int | None = None):
        self._rng = random.Random(seed)

    def complete(self, messages: list[Message], tools, force_tool):
        started = time.monotonic()
        # A little latency so the live dashboard behaves like it would with a real model.
        time.sleep(self._rng.uniform(0.15, 0.6))
        if force_tool == "submit_triage":
            call = self._triage(messages)
        else:
            call = self._resolve(messages)
        prompt_chars = sum(len(m.content) for m in messages)
        return Completion(
            text="",
            tool_calls=call,
            provider=self.name,
            model=self.model,
            input_tokens=prompt_chars // 4,
            output_tokens=60,
            latency_ms=int((time.monotonic() - started) * 1000),
        )

    @staticmethod
    def _call(name: str, args: dict) -> ToolCall:
        return ToolCall(id=uuid.uuid4().hex[:9], name=name, arguments=args)

    def _triage(self, messages):
        text = messages[-1].content
        body = text.split("Message:", 1)[-1]
        urgency = "high" if any(w in body.lower() for w in URGENT_WORDS) else "normal"
        return [self._call("submit_triage", {
            "intent": detect_intent(body),
            "language": detect_language(body),
            "urgency": urgency,
            "summary": body.strip().splitlines()[0][:120] if body.strip() else "",
        })]

    def _resolve(self, messages):
        ticket = messages[1].content
        results = {m.name: json.loads(m.content) for m in messages if m.role == "tool"}
        order_ids = ORDER_RE.findall(ticket.split("Message:", 1)[-1])
        if not results:
            calls = [self._call("get_customer", {})]
            if order_ids:
                calls.append(self._call("get_order", {"order_id": order_ids[0].upper()}))
            else:
                calls.append(self._call("list_orders", {}))
            return calls

        lang = _field(ticket, "Language") or "en"
        intent = _field(ticket, "Intent") or "other"
        t = REPLIES.get(lang, REPLIES["en"])
        customer = results.get("get_customer", {}).get("customer") or {}
        order = results.get("get_order", {}).get("order")
        if order is None and "list_orders" in results:
            orders = results["list_orders"].get("orders") or []
            order = next((o for o in orders if o["status"] == "delivered"), orders[0] if orders else None)

        refund = None
        needs_human = False
        if order is None:
            body = t["notfound"] if order_ids else t["other"]
            needs_human = not order_ids
        elif (intent in ("refund_request", "damaged_item") and order["status"] in ("delivered", "returned")
              and order["total_cents"] > int(order.get("refunded_cents") or 0)):
            # Only what is left: earlier refunds on the order count against the total.
            left = order["total_cents"] - int(order.get("refunded_cents") or 0)
            refund = {"order_id": order["id"], "amount_cents": left, "reason": intent.replace("_", " ")}
            body = t["refund"].format(order=order["id"], amount=f"{left / 100:.2f}")
        elif intent == "return_request":
            body = t["return"].format(order=order["id"])
        elif intent == "cancellation":
            body = t["cancel"].format(order=order["id"])
            needs_human = True
        elif intent == "order_status":
            body = t["status"].format(order=order["id"], status=order["status"],
                                      tracking=order.get("tracking") or "-")
        else:
            body = t["other"]
            needs_human = True

        first_name = (customer.get("name") or "").split(" ")[0] or "there"
        reply = f"{t['greet'].format(name=first_name)}\n\n{body}\n\n{t['bye']}"
        return [self._call("submit_resolution", {
            "reply": reply,
            "refund": refund,
            "needs_human": needs_human,
            "summary": f"{intent} for {order['id'] if order else 'unknown order'}",
        })]


def _field(text: str, name: str) -> str | None:
    m = re.search(rf"^{name}: (.+)$", text, re.MULTILINE)
    return m.group(1).strip() if m else None
