-- The explainer: the agent behind "Ask the guide" on /info. Registered like the others
-- (tier 0, no tools) so its calls are runs with tokens, cost and a trace, and so it can
-- be switched off by deactivating its row. It answers from the hand-written guide and
-- from GET /meta; it never touches store data.
insert into agents (id, name, owner, tier, tools, description) values
  ('explainer', 'Explainer', 'jose99segura', 0, '{}',
   'Answers questions about the platform itself on /info. No tools, no side effects.')
on conflict (id) do nothing;
