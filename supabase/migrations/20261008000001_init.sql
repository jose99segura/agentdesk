-- agentdesk schema: a demo store, and the platform that runs support agents on it.
--
-- Least privilege is enforced here, in the database, not in prompts:
--   desk_agent  the worker that runs agents. Reads the store, writes its own runs
--               and *proposals*. It cannot refund, change an order or send a message:
--               it has no grant on those tables, so no prompt or model error can do it.
--   desk_api    ingest and the human approval path. Executes approved proposals.
--   anon        the live dashboard. Read-only on platform tables, nothing on the store.
-- Login passwords are set outside migrations (supabase/seed.sql in local dev).

-- ---------------------------------------------------------------- roles
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'desk_agent') then
    create role desk_agent nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'desk_api') then
    create role desk_api nologin;
  end if;
end $$;

grant usage on schema public to desk_agent, desk_api;

-- Supabase grants everything on new public tables to anon/authenticated by default.
-- This project decides grants table by table instead.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- ---------------------------------------------------------------- store
create table customers (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  name       text not null,
  language   text not null check (language in ('en', 'es', 'fr')),
  created_at timestamptz not null default now()
);

create table products (
  id          uuid primary key default gen_random_uuid(),
  sku         text not null unique,
  name        text not null,
  price_cents integer not null check (price_cents > 0)
);

create type order_status as enum ('processing', 'shipped', 'delivered', 'cancelled', 'returned');

create table orders (
  id          text primary key,                 -- human-facing, e.g. ORD-10042
  customer_id uuid not null references customers (id),
  status      order_status not null,
  total_cents integer not null check (total_cents > 0),
  carrier     text,
  tracking    text,
  created_at  timestamptz not null default now(),
  shipped_at  timestamptz,
  delivered_at timestamptz
);
create index orders_customer_idx on orders (customer_id);

create table order_items (
  order_id    text not null references orders (id),
  product_id  uuid not null references products (id),
  quantity    integer not null check (quantity > 0),
  price_cents integer not null,
  primary key (order_id, product_id)
);

create table refunds (
  id           uuid primary key default gen_random_uuid(),
  order_id     text not null references orders (id),
  amount_cents integer not null check (amount_cents > 0),
  reason       text not null,
  proposal_id  uuid not null,
  approved_by  text not null,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- platform
create table agents (
  id          text primary key,
  name        text not null,
  owner       text not null,
  tier        smallint not null check (tier between 0 and 3),
  tools       text[] not null default '{}',
  description text not null,
  active      boolean not null default true
);

create type ticket_status as enum
  ('new', 'triaged', 'awaiting_approval', 'resolved', 'needs_human', 'failed');

create table tickets (
  id             uuid primary key default gen_random_uuid(),
  external_id    text not null unique,          -- idempotency: one ticket per inbound message
  channel        text not null check (channel in ('email', 'chat', 'voice', 'form')),
  customer_email text not null,
  subject        text,
  body           text not null,
  language       text,
  intent         text,
  urgency        text,
  status         ticket_status not null default 'new',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index tickets_created_idx on tickets (created_at desc);

create type job_status as enum ('queued', 'running', 'done', 'dead');

-- A durable queue on Postgres: claimed with FOR UPDATE SKIP LOCKED, retried with
-- backoff, and moved to 'dead' (the dead letter queue) when attempts run out.
create table jobs (
  id              bigint generated always as identity primary key,
  kind            text not null,
  ticket_id       uuid references tickets (id),
  payload         jsonb not null default '{}',
  idempotency_key text not null unique,
  status          job_status not null default 'queued',
  attempts        integer not null default 0,
  max_attempts    integer not null default 4,
  run_after       timestamptz not null default now(),
  locked_at       timestamptz,
  locked_by       text,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index jobs_ready_idx on jobs (run_after) where status = 'queued';

create type run_status as enum ('running', 'succeeded', 'failed');

create table runs (
  id            uuid primary key default gen_random_uuid(),
  ticket_id     uuid references tickets (id),
  job_id        bigint references jobs (id),
  agent_id      text not null references agents (id),
  status        run_status not null default 'running',
  provider      text,
  model         text,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd      numeric(12, 6) not null default 0,
  latency_ms    integer,
  error         text,
  error_kind    text,
  trace_id      text,
  trace_url     text,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz
);
create index runs_started_idx on runs (started_at desc);

create table run_steps (
  id         bigint generated always as identity primary key,
  run_id     uuid not null references runs (id) on delete cascade,
  seq        integer not null,
  kind       text not null check (kind in ('llm', 'tool', 'guard', 'fallback', 'retry', 'error')),
  name       text not null,
  status     text not null check (status in ('ok', 'error', 'blocked')),
  input      jsonb,
  output     jsonb,
  latency_ms integer,
  created_at timestamptz not null default now(),
  unique (run_id, seq)
);

create type proposal_status as enum ('pending', 'approved', 'rejected', 'executed', 'failed');

-- What an agent wants to do to the outside world. Nothing here has happened yet.
create table proposals (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references tickets (id),
  run_id      uuid not null references runs (id),
  kind        text not null check (kind in ('send_reply', 'refund')),
  tier        smallint not null check (tier between 0 and 3),
  payload     jsonb not null,
  flags       text[] not null default '{}',
  status      proposal_status not null default 'pending',
  decided_by  text,
  decided_at  timestamptz,
  executed_at timestamptz,
  result      jsonb,
  created_at  timestamptz not null default now()
);
create index proposals_pending_idx on proposals (created_at) where status = 'pending';

create table outbound_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references tickets (id),
  proposal_id uuid not null references proposals (id),
  channel     text not null,
  recipient   text not null,
  body        text not null,
  sent_at     timestamptz not null default now()
);

create table audit_log (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  actor   text not null,
  action  text not null,
  subject text,
  detail  jsonb not null default '{}'
);

-- Live provider health, written by the worker's circuit breakers.
create table provider_health (
  provider             text primary key,
  state                text not null check (state in ('closed', 'open', 'half_open')),
  consecutive_failures integer not null default 0,
  last_error           text,
  updated_at           timestamptz not null default now()
);

-- Fault injection for demos: a provider marked here fails every call.
create table chaos (
  provider   text primary key,
  fail       boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- grants
grant select on customers, products, orders, order_items, refunds, agents, chaos to desk_agent;
grant select, update (status, intent, language, urgency, updated_at) on tickets to desk_agent;
grant select, update on jobs to desk_agent;
grant select, insert, update on runs to desk_agent;
grant select, insert on run_steps to desk_agent;
grant select, insert on proposals to desk_agent;            -- propose, never decide
grant insert on audit_log to desk_agent;
grant select, insert, update on provider_health to desk_agent;

grant select on customers, products, orders, order_items, agents, runs, run_steps to desk_api;
grant select, insert, update on tickets, jobs, proposals, refunds, chaos to desk_api;
grant update (status) on orders to desk_api;
grant select, insert on outbound_messages, audit_log to desk_api;
grant select on provider_health to desk_api;

grant usage on all sequences in schema public to desk_agent, desk_api;

-- RLS on every table: the dashboard (anon) reads platform tables only.
do $$
declare t text;
begin
  foreach t in array array['customers','products','orders','order_items','refunds','agents',
    'tickets','jobs','runs','run_steps','proposals','outbound_messages','audit_log',
    'provider_health','chaos']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy service_roles on %I for all to desk_agent, desk_api using (true) with check (true)', t);
  end loop;
  foreach t in array array['agents','tickets','jobs','runs','run_steps','proposals',
    'audit_log','provider_health','chaos']
  loop
    execute format('grant select on %I to anon', t);
    execute format('create policy dashboard_read on %I for select to anon using (true)', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- dashboard
create view dashboard_kpis with (security_invoker = true) as
select
  (select count(*) from tickets where created_at > now() - interval '24 hours')            as tickets_24h,
  (select count(*) from runs where started_at > now() - interval '24 hours' and status = 'succeeded') as runs_ok_24h,
  (select count(*) from runs where started_at > now() - interval '24 hours' and status = 'failed')    as runs_failed_24h,
  (select coalesce(percentile_cont(0.5) within group (order by latency_ms), 0)::int
     from runs where started_at > now() - interval '24 hours' and status = 'succeeded')    as p50_latency_ms,
  (select coalesce(percentile_cont(0.95) within group (order by latency_ms), 0)::int
     from runs where started_at > now() - interval '24 hours' and status = 'succeeded')    as p95_latency_ms,
  (select coalesce(sum(cost_usd), 0) from runs where started_at > now() - interval '24 hours') as cost_24h_usd,
  (select count(*) from jobs where status = 'queued')                                       as queue_depth,
  (select count(*) from jobs where status = 'running')                                      as jobs_running,
  (select count(*) from jobs where status = 'dead')                                         as dead_letters,
  (select count(*) from proposals where status = 'pending')                                 as pending_approvals,
  (select count(*) from run_steps where kind = 'fallback' and created_at > now() - interval '24 hours') as fallbacks_24h,
  (select count(*) from run_steps where kind = 'guard' and status = 'blocked'
     and created_at > now() - interval '24 hours')                                          as guard_blocks_24h;
grant select on dashboard_kpis to anon, desk_api;

-- ---------------------------------------------------------------- realtime
alter publication supabase_realtime add table
  tickets, jobs, runs, run_steps, proposals, provider_health, chaos;

-- Wake idle workers as soon as a job is queued (they also poll, so a lost NOTIFY only delays).
create function notify_job() returns trigger language plpgsql as $$
begin
  perform pg_notify('jobs', new.id::text);
  return new;
end $$;
create trigger jobs_notify after insert or update of status on jobs
  for each row when (new.status = 'queued') execute function notify_job();

create function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger tickets_touch before update on tickets for each row execute function touch_updated_at();
create trigger jobs_touch before update on jobs for each row execute function touch_updated_at();
