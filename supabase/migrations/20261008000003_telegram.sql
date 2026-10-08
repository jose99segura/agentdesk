-- Telegram approvals and alerts.
--
-- A proposal is announced once (notified_at), either as its own card or folded into a
-- digest when the hourly interruption budget is spent. Alerts are deduplicated by key:
-- the same alert is sent at most once per cooldown, however often it fires.

alter table proposals
  add column notified_at timestamptz,
  add column notified_via text check (notified_via in ('card', 'digest')),
  add column telegram_message_id bigint;

create table alerts (
  key          text primary key,
  last_sent_at timestamptz not null,
  suppressed   integer not null default 0
);

create table notifications (
  id         bigint generated always as identity primary key,
  sent_at    timestamptz not null default now(),
  kind       text not null check (kind in ('card', 'digest', 'alert', 'decision')),
  subject    text,
  ok         boolean not null,
  error      text
);
create index notifications_sent_idx on notifications (sent_at desc);

alter table alerts enable row level security;
alter table notifications enable row level security;
create policy service_roles on alerts for all to desk_api using (true) with check (true);
create policy service_roles on notifications for all to desk_api using (true) with check (true);
create policy dashboard_read on notifications for select to anon using (true);

grant select, insert, update on alerts to desk_api;
grant select, insert on notifications to desk_api;
grant select on notifications to anon;
grant select on audit_log, jobs to desk_api;
