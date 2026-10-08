-- Evaluations: a golden suite of tickets run through the real agents, scored by
-- behavioural assertions and a judge. Eval runs are kept out of the live KPIs.

create table eval_runs (
  id          uuid primary key default gen_random_uuid(),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  trigger     text not null default 'manual' check (trigger in ('manual', 'ci')),
  git_sha     text,
  model_chain text[] not null default '{}',
  judge_model text,
  cases       integer not null default 0,
  passed      integer not null default 0,
  safety_failed integer not null default 0,
  pass_rate   numeric(5, 2),
  gate_passed boolean,
  cost_usd    numeric(12, 6) not null default 0
);

create table eval_results (
  id           bigint generated always as identity primary key,
  eval_run_id  uuid not null references eval_runs (id) on delete cascade,
  case_id      text not null,
  category     text not null check (category in ('behaviour', 'safety')),
  description  text not null,
  passed       boolean not null,
  assertions   jsonb not null,
  judge        jsonb,
  output       jsonb,
  latency_ms   integer,
  cost_usd     numeric(12, 6) not null default 0,
  trace_url    text,
  unique (eval_run_id, case_id)
);

alter table runs add column eval_run_id uuid references eval_runs (id) on delete cascade;
create index runs_eval_idx on runs (eval_run_id) where eval_run_id is not null;

alter table eval_runs enable row level security;
alter table eval_results enable row level security;
create policy service_roles on eval_runs for all to desk_agent, desk_api using (true) with check (true);
create policy service_roles on eval_results for all to desk_agent, desk_api using (true) with check (true);
create policy dashboard_read on eval_runs for select to anon using (true);
create policy dashboard_read on eval_results for select to anon using (true);

grant select, insert, update on eval_runs to desk_agent;
grant select, insert on eval_results to desk_agent;
grant select on eval_runs, eval_results to anon, desk_api;
alter publication supabase_realtime add table eval_runs;

-- Live views ignore evaluation runs.
create or replace view dashboard_kpis with (security_invoker = true) as
select
  (select count(*) from tickets where created_at > now() - interval '24 hours')            as tickets_24h,
  (select count(*) from runs where started_at > now() - interval '24 hours' and status = 'succeeded' and eval_run_id is null) as runs_ok_24h,
  (select count(*) from runs where started_at > now() - interval '24 hours' and status = 'failed' and eval_run_id is null)    as runs_failed_24h,
  (select coalesce(percentile_cont(0.5) within group (order by latency_ms), 0)::int
     from runs where started_at > now() - interval '24 hours' and status = 'succeeded' and eval_run_id is null) as p50_latency_ms,
  (select coalesce(percentile_cont(0.95) within group (order by latency_ms), 0)::int
     from runs where started_at > now() - interval '24 hours' and status = 'succeeded' and eval_run_id is null) as p95_latency_ms,
  (select coalesce(sum(cost_usd), 0) from runs where started_at > now() - interval '24 hours' and eval_run_id is null) as cost_24h_usd,
  (select count(*) from jobs where status = 'queued')                                       as queue_depth,
  (select count(*) from jobs where status = 'running')                                      as jobs_running,
  (select count(*) from jobs where status = 'dead')                                         as dead_letters,
  (select count(*) from proposals where status = 'pending')                                 as pending_approvals,
  (select count(*) from run_steps s join runs r on r.id = s.run_id
     where s.kind = 'fallback' and s.created_at > now() - interval '24 hours' and r.eval_run_id is null) as fallbacks_24h,
  (select count(*) from run_steps s join runs r on r.id = s.run_id
     where s.kind = 'guard' and s.status = 'blocked' and s.created_at > now() - interval '24 hours'
       and r.eval_run_id is null)                                                           as guard_blocks_24h;

create or replace view runs_per_minute with (security_invoker = true) as
select
  m.minute,
  count(r.id) filter (where r.status = 'succeeded') as succeeded,
  count(r.id) filter (where r.status = 'failed')    as failed,
  coalesce(avg(r.latency_ms) filter (where r.status = 'succeeded'), 0)::int as avg_latency_ms
from generate_series(
       date_trunc('minute', now()) - interval '59 minutes',
       date_trunc('minute', now()),
       interval '1 minute') as m(minute)
left join runs r on date_trunc('minute', r.started_at) = m.minute and r.eval_run_id is null
group by m.minute
order by m.minute;

create or replace view agent_stats with (security_invoker = true) as
select
  a.id, a.name, a.owner, a.tier, a.tools, a.description, a.active,
  count(r.id) filter (where r.started_at > now() - interval '24 hours') as runs_24h,
  count(r.id) filter (where r.started_at > now() - interval '24 hours' and r.status = 'failed') as failed_24h,
  coalesce(percentile_cont(0.5) within group (order by r.latency_ms)
    filter (where r.started_at > now() - interval '24 hours' and r.status = 'succeeded'), 0)::int as p50_latency_ms,
  coalesce(sum(r.cost_usd) filter (where r.started_at > now() - interval '24 hours'), 0) as cost_24h_usd,
  max(r.started_at) as last_run_at
from agents a
left join runs r on r.agent_id = a.id and r.eval_run_id is null
group by a.id;
