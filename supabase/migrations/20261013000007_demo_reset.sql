-- Resetting the demo store.
--
-- The public store lets visitors approve refunds on the demo customers' orders, so every
-- demo uses up what is left to refund. This puts those orders back as the seed left them.
-- It only touches the eval.* demo customers, and the API role cannot delete refunds on its
-- own: it can only call this function, which deletes nothing else.

create or replace function reset_demo_store() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  removed integer;
begin
  delete from refunds r
   using orders o join customers c on c.id = o.customer_id
   where r.order_id = o.id and c.email like 'eval.%@example.com' and r.approved_by <> 'seed';
  get diagnostics removed = row_count;

  update orders o set status = v.status::order_status
    from (values ('ORD-90001', 'delivered'), ('ORD-90002', 'shipped'), ('ORD-90003', 'delivered'),
                 ('ORD-90004', 'processing'), ('ORD-90005', 'delivered')) as v (id, status)
   where o.id = v.id;

  insert into audit_log (actor, action, subject, detail)
  values ('demo:visitor', 'reset_demo_store', 'eval.*', jsonb_build_object('refunds_removed', removed));
  return jsonb_build_object('refunds_removed', removed);
end $$;

revoke all on function reset_demo_store() from public, anon, authenticated;
grant execute on function reset_demo_store() to desk_api;
