/**
 * Lazy PostgreSQL adapter.
 *
 * One pooled connection is reused for the whole process (never one connection
 * per request). If the database is asleep, the first query after a request
 * reconnects and re-runs the idempotent migration, so the service recovers on
 * its own after Render spins the web service down.
 */
import pg from 'pg';

const { Pool } = pg;

const CONNECT_TIMEOUT_MS = 15_000;
const QUERY_TIMEOUT_MS = 15_000;
const MAX_POOL_CLIENTS = 5;

function isConnectionError(error) {
  const code = String(error?.code || '');
  return (
    ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND'].includes(code) ||
    code.startsWith('08') ||
    ['57P01', '57P02', '57P03', '53300'].includes(code)
  );
}

function describeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  // An operator code such as ECONNREFUSED is useful. Redact any URL a driver
  // or proxy might embed so credentials never reach the logs.
  return (error?.code ? `${error.code}: ${message}` : message)
    .replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted database URL]')
    .slice(0, 300);
}

export function createPostgresDatabase({ connectionString, migrationSql = '', logger = console } = {}) {
  const configured = typeof connectionString === 'string' && connectionString.trim().length > 0;
  let pool = null;
  let connecting = null;
  let connected = false;
  let lastError = '';
  let closed = false;
  let migrationApplied = false;

  async function connect() {
    if (!configured) throw new Error('DATABASE_URL is not configured.');
    if (closed) throw new Error('The database adapter is closed.');
    if (pool && connected) return pool;
    if (connecting) return connecting;

    connecting = (async () => {
      const candidate = new Pool({
        connectionString,
        max: MAX_POOL_CLIENTS,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
        query_timeout: QUERY_TIMEOUT_MS,
        application_name: 'dhikr-counter-push',
      });

      // Without a listener an idle client error crashes the process.
      candidate.on('error', (error) => {
        if (pool === candidate) connected = false;
        lastError = describeError(error);
        logger.warn(`[push] PostgreSQL pool error: ${lastError}`);
      });

      try {
        await candidate.query('SELECT 1');
        if (closed) throw new Error('The database adapter is closed.');
        if (migrationSql && !migrationApplied) {
          await candidate.query(migrationSql);
          migrationApplied = true;
          logger.log('[push] push_subscriptions schema is up to date.');
        }
        // close() may have started while the migration was running.
        if (closed) throw new Error('The database adapter is closed.');
        const previous = pool;
        pool = candidate;
        connected = true;
        lastError = '';
        // A pool that previously emitted an error is discarded, never leaked.
        if (previous && previous !== candidate) await previous.end().catch(() => {});
        return candidate;
      } catch (error) {
        lastError = describeError(error);
        connected = false;
        if (pool === candidate) pool = null;
        await candidate.end().catch(() => {});
        throw new Error(lastError);
      }
    })().finally(() => {
      connecting = null;
    });

    return connecting;
  }

  return {
    configured,
    async query(text, params) {
      const active = await connect();
      try {
        return await active.query(text, params);
      } catch (error) {
        lastError = describeError(error);
        if (isConnectionError(error) && pool === active) {
          connected = false;
          pool = null;
          await active.end().catch(() => {});
        }
        throw error;
      }
    },
    async connect() {
      await connect();
    },
    async status() {
      if (!configured) {
        return {
          kind: 'none',
          configured: false,
          connected: false,
          persistent: false,
          reason: 'DATABASE_URL is not configured.',
        };
      }
      if (!connected) {
        try {
          await connect();
        } catch {
          // Reported through the fields below.
        }
      }
      return {
        kind: 'postgres',
        configured: true,
        connected,
        persistent: true,
        maxClients: MAX_POOL_CLIENTS,
        reason: connected ? '' : lastError || 'Connecting to PostgreSQL…',
      };
    },
    async close() {
      closed = true;
      connected = false;
      migrationApplied = false;
      const active = pool;
      const pending = connecting;
      pool = null;
      if (active) await active.end().catch(() => {});
      // A connection started before close() must not install a pool after it.
      if (pending) await pending.catch(() => {});
    },
  };
}
