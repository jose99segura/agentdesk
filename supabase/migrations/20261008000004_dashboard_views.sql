-- Read models for the dashboard. Views run with the caller's rights (security_invoker),
-- so the anon role still only sees what its grants allow.

-- Runs per minute over the last hour, for the throughput chart.
create view runs_per_minute with (security_invoker = true) as
select
  m.minute,
  count(r.id) filter (where r.status = 'succeeded') as succeeded,
  count(r.id) filter (where r.status = 'failed')    as failed,
  coalesce(avg(r.latency_ms) filter (where r.status = 'succeeded'), 0)::int as avg_latency_ms
from generate_series(
       date_trunc('minute', now()) - interval '59 minutes',
       date_trunc('minute', now()),
       interval '1 minute') as m(minute)
left join runs r on date_trunc('minute', r.started_at) = m.minute
group by m.minute
order by m.minute;

-- Per-agent health over the last 24 hours, joined to the registry.
create view agent_stats with (security_invoker = true) as
select
  a.id, a.name, a.owner, a.tier, a.tools, a.description, a.active,
  count(r.id) filter (where r.started_at > now() - interval '24 hours') as runs_24h,
  count(r.id) filter (where r.started_at > now() - interval '24 hours' and r.status = 'failed') as failed_24h,
  coalesce(percentile_cont(0.5) within group (order by r.latency_ms)
    filter (where r.started_at > now() - interval '24 hours' and r.status = 'succeeded'), 0)::int as p50_latency_ms,
  coalesce(sum(r.cost_usd) filter (where r.started_at > now() - interval '24 hours'), 0) as cost_24h_usd,
  max(r.started_at) as last_run_at
from agents a
left join runs r on r.agent_id = a.id
group by a.id;

grant select on runs_per_minute, agent_stats to anon, desk_api;
