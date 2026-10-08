-- The agent registry. Nothing runs without a registered owner, tier and tool grant:
-- the worker refuses an agent that is missing here or inactive, and the gateway
-- only hands an agent the tools listed in its row.
--
-- Tiers: 0 reads internal data, 1 drafts for a human, 2 sends to a customer
-- after approval, 3 moves money after approval. Agents themselves are 0 or 1;
-- tiers 2 and 3 exist only as proposals a human decides.
insert into agents (id, name, owner, tier, tools, description) values
  ('triage', 'Triage', 'jose99segura', 0, '{}',
   'Classifies an inbound ticket: intent, language, urgency. No tools, no side effects.'),
  ('resolver', 'Resolver', 'jose99segura', 1,
   '{get_customer, list_orders, get_order}',
   'Looks up the customer and order, drafts a reply and may propose a refund. Proposals only.');
