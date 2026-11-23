-- Web Push subscriptions (Neon PostgreSQL).
--
-- Idempotent: server.js and `npm run db:migrate` run this on every boot, so a
-- fresh database converges and an existing one is left untouched. Nothing is
-- dropped, so subscriptions survive deploys, restarts, and Render spin-down.
--
-- user_id is filled by the server, never by a request body. This build has no
-- end-user accounts yet, so every device is stored under the single owner
-- 'anonymous' (see ANONYMOUS_PUSH_OWNER in server/push/store.js). The column
-- keeps the schema ready for real accounts without a rewrite later.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lookups by owner ("all devices for this user"). The UNIQUE constraint on
-- endpoint already creates a unique B-tree index, which is what the
-- unsubscribe/prune lookups use, so a second endpoint index would only add
-- write cost.
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON push_subscriptions (user_id);
