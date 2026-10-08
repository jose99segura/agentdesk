"""Approvals and alerts over Telegram, run as its own process on the `desk_api` role.

- New proposals become a card with Approve / Reject buttons. A button press goes through
  the same `approvals.decide()` as the dashboard, so it is re-validated and audited.
- Only the configured chat may decide: a callback from anyone else is refused.
- Interruption budget: at most `telegram_cards_per_hour` cards; past that, proposals are
  folded into one digest message instead of a stream of pings.
- Alerts (dead letters, an open circuit) are deduplicated by key with a cooldown, and the
  number of suppressed repeats is reported when the alert is sent again.
- A proposal is marked notified only after Telegram accepted the message, so a failed send
  is retried on the next pass instead of being lost.
- If the bot already has a webhook (another app owns its updates), the service runs send-only:
  cards carry no buttons and point to the dashboard, and the webhook is never touched.
"""

import html
import logging
import threading
import time

import httpx
from psycopg import Connection

from .approvals import DecisionError, decide
from .config import settings
from .db import api_pool

log = logging.getLogger("agentdesk.telegram")

ALERT_COOLDOWN_S = 30 * 60
DIGEST_EVERY_S = 15 * 60


class TelegramError(Exception):
    pass


class Bot:
    def __init__(self, token: str):
        self._client = httpx.Client(base_url=f"https://api.telegram.org/bot{token}", timeout=40)

    def call(self, method: str, **params) -> dict:
        try:
            res = self._client.post(f"/{method}", json=params)
            data = res.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise TelegramError(f"{method}: {type(exc).__name__}") from exc
        if not data.get("ok"):
            raise TelegramError(f"{method}: {data.get('description', 'not ok')}")
        return data["result"]


def _e(text: str | None) -> str:
    return html.escape(text or "")


def proposal_card(p: dict) -> str:
    head = ("💸 <b>Refund</b> · tier 3" if p["kind"] == "refund" else "✉️ <b>Send reply</b> · tier 2")
    lines = [head, f"<i>{_e(p['customer_email'])}</i> · {_e(p['channel'])}",
             f"“{_e(p['body'][:300])}”", ""]
    if p["kind"] == "refund":
        pl = p["payload"]
        lines.append(f"<b>{_e(pl['order_id'])}: €{pl['amount_cents'] / 100:.2f}</b> ({_e(pl['reason'])})")
    else:
        lines.append(f"<pre>{_e(p['payload'].get('body', '')[:1500])}</pre>")
    if p["flags"]:
        lines.append("⚑ " + ", ".join(_e(f.replace("_", " ")) for f in p["flags"]))
    return "\n".join(lines)


def buttons(proposal_id: str) -> dict:
    return {"inline_keyboard": [[
        {"text": "✓ Approve", "callback_data": f"a:{proposal_id}"},
        {"text": "✗ Reject", "callback_data": f"r:{proposal_id}"},
    ]]}


class TelegramService:
    def __init__(self, bot: Bot, chat_id: str, cards_per_hour: int, dashboard_url: str,
                 interactive: bool = True):
        self.bot = bot
        self.interactive = interactive
        self.chat_id = chat_id
        self.cards_per_hour = cards_per_hour
        self.dashboard_url = dashboard_url
        self.stopping = threading.Event()

    # ------------------------------------------------------------ outbox
    def announce(self, conn: Connection) -> None:
        sent_last_hour = conn.execute(
            """select count(*) as n from notifications
               where kind = 'card' and ok and sent_at > now() - interval '1 hour'"""
        ).fetchone()["n"]
        pending = conn.execute(
            """select p.*, t.customer_email, t.channel, t.body
               from proposals p join tickets t on t.id = p.ticket_id
               where p.status = 'pending' and p.notified_at is null
               order by p.tier desc, p.created_at limit 20"""
        ).fetchall()
        budget = max(0, self.cards_per_hour - sent_last_hour)
        for p in pending[:budget]:
            self._send_card(conn, p)
        if len(pending) > budget:
            self._digest(conn)

    def _send_card(self, conn: Connection, p: dict) -> None:
        params: dict = {"chat_id": self.chat_id, "parse_mode": "HTML", "text": proposal_card(p)}
        if self.interactive:
            params["reply_markup"] = buttons(str(p["id"]))
        else:
            params["text"] += f"\n\nReview on the dashboard: {_e(self.dashboard_url)}"
        try:
            msg = self.bot.call("sendMessage", **params)
        except TelegramError as exc:
            self._log(conn, "card", str(p["id"]), ok=False, error=str(exc))
            return
        conn.execute(
            """update proposals set notified_at = now(), notified_via = 'card',
                 telegram_message_id = %s where id = %s""",
            (msg["message_id"], p["id"]),
        )
        self._log(conn, "card", str(p["id"]), ok=True)

    def _digest(self, conn: Connection) -> None:
        last = conn.execute(
            "select max(sent_at) as at from notifications where kind = 'digest' and ok"
        ).fetchone()["at"]
        if last and time.time() - last.timestamp() < DIGEST_EVERY_S:
            return
        n = conn.execute(
            "select count(*) as n from proposals where status = 'pending' and notified_at is null"
        ).fetchone()["n"]
        text = (f"📥 <b>{n} more proposals</b> are waiting for approval. The hourly card budget "
                f"is spent, so they are bundled here.\n{_e(self.dashboard_url)}")
        try:
            self.bot.call("sendMessage", chat_id=self.chat_id, text=text, parse_mode="HTML")
        except TelegramError as exc:
            self._log(conn, "digest", None, ok=False, error=str(exc))
            return
        conn.execute(
            """update proposals set notified_at = now(), notified_via = 'digest'
               where status = 'pending' and notified_at is null"""
        )
        self._log(conn, "digest", f"{n} proposals", ok=True)

    # ------------------------------------------------------------ alerts
    def check_alerts(self, conn: Connection) -> None:
        dead = conn.execute("select count(*) as n from jobs where status = 'dead'").fetchone()["n"]
        if dead:
            self.alert(conn, "dead_letters",
                       f"🔴 <b>{dead} jobs</b> are in the dead letter queue.\n{_e(self.dashboard_url)}")
        open_circuits = conn.execute(
            "select provider from provider_health where state = 'open'"
        ).fetchall()
        for row in open_circuits:
            self.alert(conn, f"circuit_open:{row['provider']}",
                       f"🟠 Circuit open for <b>{_e(row['provider'])}</b>: "
                       "calls fall back to the next provider.")

    def alert(self, conn: Connection, key: str, text: str) -> None:
        with conn.transaction():
            row = conn.execute("select * from alerts where key = %s for update", (key,)).fetchone()
            if row and time.time() - row["last_sent_at"].timestamp() < ALERT_COOLDOWN_S:
                conn.execute("update alerts set suppressed = suppressed + 1 where key = %s", (key,))
                return
            suppressed = row["suppressed"] if row else 0
            if suppressed:
                text += f"\n<i>({suppressed} repeats suppressed since the last alert)</i>"
            try:
                self.bot.call("sendMessage", chat_id=self.chat_id, text=text, parse_mode="HTML")
            except TelegramError as exc:
                self._log(conn, "alert", key, ok=False, error=str(exc))
                return
            conn.execute(
                """insert into alerts (key, last_sent_at, suppressed) values (%s, now(), 0)
                   on conflict (key) do update set last_sent_at = now(), suppressed = 0""",
                (key,),
            )
            self._log(conn, "alert", key, ok=True)

    # ------------------------------------------------------------ inbound
    def handle_callback(self, conn: Connection, cb: dict) -> None:
        chat_id = str(cb.get("message", {}).get("chat", {}).get("id", ""))
        user = cb.get("from", {})
        if chat_id != str(self.chat_id):
            self.bot.call("answerCallbackQuery", callback_query_id=cb["id"], text="Not allowed.")
            log.warning("refused a callback from chat %s", chat_id)
            return
        action, _, proposal_id = (cb.get("data") or "").partition(":")
        if action not in ("a", "r") or not proposal_id:
            return
        actor = f"telegram:{user.get('username') or user.get('id')}"
        try:
            result = decide(conn, proposal_id, action == "a", actor)
            if result.get("already_decided"):
                verdict = f"Already {result['status']}"
            else:
                verdict = "✓ Approved and executed" if action == "a" else "✗ Rejected"
        except DecisionError as exc:
            conn.execute(
                """update proposals set status = 'failed', decided_by = %s, decided_at = now()
                   where id = %s and status = 'pending'""",
                (actor, proposal_id),
            )
            verdict = f"⚠️ Not executed: {exc}"
        self._log(conn, "decision", proposal_id, ok=True)
        self.bot.call("answerCallbackQuery", callback_query_id=cb["id"], text=verdict[:200])
        message = cb["message"]
        self.bot.call("editMessageText", chat_id=chat_id, message_id=message["message_id"],
                      text=f"{_e(message.get('text', ''))}\n\n<b>{_e(verdict)}</b> by {_e(actor)}",
                      parse_mode="HTML")

    # ------------------------------------------------------------ loops
    def poll_updates(self) -> None:
        offset = None
        while not self.stopping.is_set():
            try:
                updates = self.bot.call("getUpdates", timeout=30, offset=offset,
                                        allowed_updates=["callback_query"])
            except TelegramError as exc:
                log.warning("getUpdates failed: %s", exc)
                self.stopping.wait(5)
                continue
            for u in updates:
                offset = u["update_id"] + 1
                if cb := u.get("callback_query"):
                    try:
                        with api_pool().connection() as conn:
                            self.handle_callback(conn, cb)
                    except Exception:
                        log.exception("callback failed")

    def outbox_loop(self) -> None:
        while not self.stopping.is_set():
            try:
                with api_pool().connection() as conn:
                    self.announce(conn)
                    self.check_alerts(conn)
            except Exception:
                log.exception("outbox pass failed")
            self.stopping.wait(5)

    @staticmethod
    def _log(conn: Connection, kind: str, subject: str | None, *, ok: bool, error: str | None = None):
        conn.execute(
            "insert into notifications (kind, subject, ok, error) values (%s, %s, %s, %s)",
            (kind, subject, ok, error),
        )


def main() -> None:
    cfg = settings()
    if not (cfg.telegram_bot_token and cfg.telegram_chat_id):
        raise SystemExit("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required")
    bot = Bot(cfg.telegram_bot_token)
    webhook = bot.call("getWebhookInfo").get("url")
    service = TelegramService(bot, cfg.telegram_chat_id, cfg.telegram_cards_per_hour,
                              cfg.dashboard_url, interactive=not webhook)
    if webhook:
        log.warning("bot has a webhook owned by another app: send-only mode, approve on the dashboard")
    else:
        threading.Thread(target=service.poll_updates, daemon=True, name="updates").start()
    log.info("telegram service started for chat %s (%s)", cfg.telegram_chat_id,
             "interactive" if service.interactive else "send-only")
    try:
        service.outbox_loop()
    except KeyboardInterrupt:
        service.stopping.set()
