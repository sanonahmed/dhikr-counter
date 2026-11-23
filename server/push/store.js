/**
 * PostgreSQL-backed subscription store (Neon).
 *
 * Every method is parameterized SQL. There is no in-memory fallback and no JSON
 * file: when the database is not configured or cannot be reached, operations
 * fail loudly (PushStoreUnavailableError) so a caller never believes a device
 * was saved when it was not. The schema is created from
 * migrations/001_push_subscriptions.sql, which is idempotent.
 */
import fs from 'node:fs';

/**
 * This build has no end-user accounts, so all devices share one owner value.
 * It is assigned here on the server and is never read from a request body.
 */
export const ANONYMOUS_PUSH_OWNER = 'anonymous';
export const PUSH_MAX_SUBSCRIPTIONS = 20_000;

const MIGRATION_URL = new URL('../../migrations/001_push_subscriptions.sql', import.meta.url);

export function loadPushMigrationSql() {
  return fs.readFileSync(MIGRATION_URL, 'utf8');
}

export class PushStoreUnavailableError extends Error {
  constructor(reason) {
    super(reason || 'Push storage is unavailable.');
    this.name = 'PushStoreUnavailableError';
    this.code = 'push_store_unavailable';
  }
}

function parseStoredSubscription(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (typeof value.endpoint !== 'string' || !value.keys) return null;
  return value;
}

/**
 * @param {object} options
 * @param {object|null} options.database  `{ connect, query, status }` adapter.
 * @param {string} [options.ownerId]      Owner applied to every query.
 */
export function createPushStore({
  database = null,
  ownerId = ANONYMOUS_PUSH_OWNER,
  logger = console,
  maxSubscriptions = PUSH_MAX_SUBSCRIPTIONS,
} = {}) {
  const configured = Boolean(database);

  async function ensureReady() {
    if (!database) {
      throw new PushStoreUnavailableError(
        'DATABASE_URL is not configured, so subscriptions cannot be stored durably.'
      );
    }
    try {
      await database.connect();
    } catch (error) {
      logger.warn(`[push] PostgreSQL unavailable: ${error instanceof Error ? error.message : String(error)}`);
      throw new PushStoreUnavailableError(
        'Push storage is temporarily unavailable. The subscription was not saved.'
      );
    }
  }

  return {
    ownerId,
    kind: configured ? 'postgres' : 'none',
    /** A Postgres store survives restarts; nothing else is used. */
    persistent: configured,
    maxSubscriptions,
    ensureReady,

    async status() {
      if (!database) {
        return {
          kind: 'none',
          configured: false,
          connected: false,
          persistent: false,
          reason: 'DATABASE_URL is not configured, so device registrations cannot be stored.',
        };
      }
      try {
        await database.connect();
      } catch {
        // status() reports the failure instead of throwing.
      }
      return database.status();
    },

    async count(owner = ownerId) {
      await ensureReady();
      const { rows } = await database.query(
        'SELECT COUNT(*)::int AS count FROM push_subscriptions WHERE user_id = $1',
        [owner]
      );
      return Number(rows?.[0]?.count) || 0;
    },

    async find(endpoint, owner = ownerId) {
      await ensureReady();
      const { rows } = await database.query(
        'SELECT subscription FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2 LIMIT 1',
        [owner, endpoint]
      );
      return parseStoredSubscription(rows?.[0]?.subscription);
    },

    async list(owner = ownerId) {
      await ensureReady();
      const { rows } = await database.query(
        'SELECT subscription FROM push_subscriptions WHERE user_id = $1 ORDER BY id',
        [owner]
      );
      return (rows || []).map((row) => parseStoredSubscription(row.subscription)).filter(Boolean);
    },

    /** Re-posting an endpoint updates its keys/timestamp instead of duplicating. */
    async upsert(subscription, owner = ownerId) {
      await ensureReady();
      const { rows } = await database.query(
        `INSERT INTO push_subscriptions (user_id, endpoint, subscription)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (endpoint) DO UPDATE
           SET user_id = EXCLUDED.user_id,
               subscription = EXCLUDED.subscription,
               updated_at = NOW()
         WHERE push_subscriptions.user_id = EXCLUDED.user_id
         RETURNING id, created_at, updated_at`,
        [owner, subscription.endpoint, JSON.stringify(subscription)]
      );
      // No row means another owner already holds this endpoint; the router
      // reports a conflict instead of silently stealing the registration.
      return rows?.[0] || null;
    },

    /** Device must prove possession of its keys to remove its own endpoint. */
    async remove(endpoint, keys, owner = ownerId) {
      await ensureReady();
      const { rows } = await database.query(
        `DELETE FROM push_subscriptions
         WHERE user_id = $1 AND endpoint = $2
           AND subscription->'keys' = $3::jsonb
         RETURNING id`,
        [owner, endpoint, JSON.stringify(keys)]
      );
      return Boolean(rows?.length);
    },

    async removeByEndpoint(endpoint, owner = ownerId) {
      await ensureReady();
      const { rows } = await database.query(
        'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2 RETURNING id',
        [owner, endpoint]
      );
      return Boolean(rows?.length);
    },

    async removeMany(endpoints, owner = ownerId) {
      const unique = [...new Set((endpoints || []).filter((value) => typeof value === 'string' && value))];
      if (!unique.length) return 0;
      await ensureReady();
      const { rows } = await database.query(
        `DELETE FROM push_subscriptions
         WHERE user_id = $1 AND endpoint = ANY($2::text[])
         RETURNING endpoint`,
        [owner, unique]
      );
      return rows?.length || 0;
    },

  };
}
