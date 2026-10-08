"""A durable job queue on Postgres.

- Enqueue is idempotent on `idempotency_key`: the same inbound message twice is one job.
- Workers claim with FOR UPDATE SKIP LOCKED, so any number of them can share the table.
- A failed attempt is rescheduled with exponential backoff and jitter; when attempts run
  out the job is marked `dead` (the dead letter queue) and waits for a human retry.
- A job whose worker died mid-run is reclaimed after a lease timeout, so work survives
  a crash or a deploy.
"""

import random

from psycopg import Connection

LEASE_SECONDS = 300


def enqueue(conn: Connection, kind: str, ticket_id: str, key: str, payload: dict | None = None):
    from psycopg.types.json import Jsonb

    return conn.execute(
        """insert into jobs (kind, ticket_id, idempotency_key, payload)
           values (%s, %s, %s, %s)
           on conflict (idempotency_key) do nothing
           returning id""",
        (kind, ticket_id, key, Jsonb(payload or {})),
    ).fetchone()


def claim(conn: Connection, worker_id: str) -> dict | None:
    return conn.execute(
        """update jobs set status = 'running', locked_at = now(), locked_by = %s,
                attempts = attempts + 1
           where id = (
             select id from jobs
             where status = 'queued' and run_after <= now()
             order by run_after, id
             for update skip locked
             limit 1)
           returning *""",
        (worker_id,),
    ).fetchone()


def complete(conn: Connection, job_id: int) -> None:
    conn.execute(
        "update jobs set status = 'done', locked_at = null, locked_by = null where id = %s",
        (job_id,),
    )


def retry_delay_s(attempts: int) -> float:
    return min(300.0, 5.0 * 2 ** (attempts - 1)) * random.uniform(0.7, 1.3)


def fail(conn: Connection, job: dict, error: str, *, permanent: bool = False) -> str:
    """Reschedule the job, or move it to the dead letter queue. Returns the new status."""
    dead = permanent or job["attempts"] >= job["max_attempts"]
    if dead:
        conn.execute(
            """update jobs set status = 'dead', last_error = %s, locked_at = null,
                 locked_by = null where id = %s""",
            (error[:2000], job["id"]),
        )
        return "dead"
    conn.execute(
        """update jobs set status = 'queued', last_error = %s, locked_at = null, locked_by = null,
             run_after = now() + make_interval(secs => %s)
           where id = %s""",
        (error[:2000], retry_delay_s(job["attempts"]), job["id"]),
    )
    return "queued"


def reclaim_expired(conn: Connection) -> int:
    rows = conn.execute(
        """update jobs set status = 'queued', locked_at = null, locked_by = null,
             last_error = 'lease expired: worker stopped mid-run'
           where status = 'running' and locked_at < now() - make_interval(secs => %s)
           returning id""",
        (LEASE_SECONDS,),
    ).fetchall()
    return len(rows)


def retry_dead(conn: Connection, job_id: int) -> bool:
    row = conn.execute(
        """update jobs set status = 'queued', attempts = 0, run_after = now(), last_error = null
           where id = %s and status = 'dead' returning id""",
        (job_id,),
    ).fetchone()
    return row is not None
