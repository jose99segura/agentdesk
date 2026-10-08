-- Local development only: login passwords for the app roles, and a demo store.
-- Production sets role passwords by hand and never runs this file.
alter role desk_agent with login password 'desk_agent_dev';
alter role desk_api with login password 'desk_api_dev';

insert into products (sku, name, price_cents) values
  ('BAG-01', 'Canvas weekender bag', 8900),
  ('MUG-02', 'Stoneware mug, set of 2', 2400),
  ('LMP-03', 'Brass desk lamp', 12900),
  ('THR-04', 'Wool throw blanket', 7400),
  ('KNF-05', 'Chef knife 20cm', 6900),
  ('TEA-06', 'Loose leaf tea sampler', 1900),
  ('JRN-07', 'Linen journal', 2200),
  ('CUT-08', 'Olive wood cutting board', 4500);

-- 40 customers across three languages, deterministic so tests and the simulator agree.
insert into customers (email, name, language)
select
  lower(first) || '.' || lower(last) || n || '@example.com',
  first || ' ' || last,
  lang
from (
  select
    n,
    (array['Lucia','Marc','Ines','Pablo','Claire','Hugo','Emma','Noah','Sofia','Leo'])[1 + n % 10] as first,
    (array['Garcia','Dubois','Martin','Lopez','Bernard','Smith','Moreau','Ruiz'])[1 + n % 8] as last,
    (array['es','fr','en'])[1 + n % 3] as lang
  from generate_series(1, 40) as n
) c;

-- 120 orders spread over the last 60 days with a realistic status mix.
insert into orders (id, customer_id, status, total_cents, carrier, tracking, created_at, shipped_at, delivered_at)
select
  'ORD-' || (10000 + n),
  (select id from customers order by email offset (n % 40) limit 1),
  st,
  0 + 1,
  case when st in ('shipped', 'delivered', 'returned') then (array['DHL','Post Luxembourg','UPS'])[1 + n % 3] end,
  case when st in ('shipped', 'delivered', 'returned') then 'TRK' || (900000 + n * 7) end,
  created,
  case when st in ('shipped', 'delivered', 'returned') then created + interval '1 day' end,
  case when st in ('delivered', 'returned') then created + interval '4 days' end
from (
  select
    n,
    now() - (n % 60) * interval '1 day' - (n % 24) * interval '1 hour' as created,
    (case
      when n % 60 < 3 then 'processing'
      when n % 60 < 8 then 'shipped'
      when n % 17 = 0 then 'cancelled'
      when n % 23 = 0 then 'returned'
      else 'delivered'
    end)::order_status as st
  from generate_series(1, 120) as n
) o;

insert into order_items (order_id, product_id, quantity, price_cents)
select o.id, p.id, 1 + (abs(hashtext(o.id || p.sku)) % 2), p.price_cents
from orders o
join lateral (
  select * from products
  order by abs(hashtext(o.id || sku))
  limit 1 + abs(hashtext(o.id)) % 3
) p on true;

update orders o set total_cents = s.total
from (select order_id, sum(quantity * price_cents) as total from order_items group by order_id) s
where s.order_id = o.id;

insert into chaos (provider, fail) values ('mistral', false), ('anthropic', false), ('offline', false);

-- Fixtures for the evaluation suite (core/evals/golden.yaml): three customers with
-- known orders, so every case can assert exact ids and amounts.
insert into customers (email, name, language) values
  ('eval.alice@example.com', 'Alice Martin', 'en'),
  ('eval.bruno@example.com', 'Bruno Ruiz', 'es'),
  ('eval.chloe@example.com', 'Chloé Moreau', 'fr');

insert into orders (id, customer_id, status, total_cents, carrier, tracking, created_at, shipped_at, delivered_at)
select v.id, c.id, v.status::order_status, v.total, v.carrier, v.tracking,
       now() - v.age, now() - v.age + interval '1 day',
       case when v.status = 'delivered' then now() - v.age + interval '4 days' end
from (values
  ('ORD-90001', 'eval.alice@example.com', 'delivered', 6400, 'DHL', 'TRK-EVAL-1', interval '12 days'),
  ('ORD-90002', 'eval.alice@example.com', 'shipped', 2200, 'Post Luxembourg', 'TRK-EVAL-2', interval '2 days'),
  ('ORD-90003', 'eval.bruno@example.com', 'delivered', 12900, 'UPS', 'TRK-EVAL-3', interval '9 days'),
  ('ORD-90004', 'eval.bruno@example.com', 'processing', 4500, null, null, interval '1 day'),
  ('ORD-90005', 'eval.chloe@example.com', 'delivered', 4500, 'DHL', 'TRK-EVAL-5', interval '15 days')
) as v(id, email, status, total, carrier, tracking, age)
join customers c on c.email = v.email;

update orders set shipped_at = null where id = 'ORD-90004';

-- Chloé was already refunded 10 € on ORD-90005: at most 35 € remains.
insert into refunds (order_id, amount_cents, reason, proposal_id, approved_by)
values ('ORD-90005', 1000, 'late delivery gesture', gen_random_uuid(), 'seed');

-- Items for the evaluation orders, matching their totals exactly.
insert into order_items (order_id, product_id, quantity, price_cents)
select v.order_id, p.id, 1, p.price_cents
from (values
  ('ORD-90001', 'TEA-06'), ('ORD-90001', 'CUT-08'),
  ('ORD-90002', 'JRN-07'),
  ('ORD-90003', 'LMP-03'),
  ('ORD-90004', 'CUT-08'),
  ('ORD-90005', 'CUT-08')
) as v(order_id, sku)
join products p on p.sku = v.sku
on conflict do nothing;
