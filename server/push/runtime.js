/**
 * One push runtime per server process.
 *
 * It owns the VAPID configuration, the PostgreSQL adapter, and the store. VAPID
 * is configured exactly once per build (never generated), and in production a
 * missing key/database is a startup error instead of a warning that leaves the
 * device list meaningless.
 */
import { createPostgresDatabase } from './db.js';
import { createPushStore, loadPushMigrationSql } from './store.js';
import { loadVapidConfig, configureWebPush } from './vapid.js';
import { sendPushToAll, sendPushToUser } from './send.js';

export class PushDisabledError extends Error {
  constructor(reason, code = 'push_disabled') {
    super(reason || 'Web Push is not configured.');
    this.name = 'PushDisabledError';
    this.code = code;
  }
}

export function createPushRuntime({
  webpush,
  env = process.env,
  required = false,
  logger = console,
  databaseAdapter = undefined,
} = {}) {
  let database = null;
  let store = null;
  let vapid = loadVapidConfig(env);
  let preparing = null;
  let configuredVapidPair = '';

  function build() {
    vapid = loadVapidConfig(env);

    if (vapid.enabled) {
      // Configure exactly once for one key pair. A dev-only env reload applies
      // new keys only when the values actually changed.
      const fingerprint = `${vapid.publicKey}:${vapid.privateKey}:${vapid.subject}`;
      if (configuredVapidPair !== fingerprint) {
        const applied = configureWebPush(webpush, vapid);
        if (!applied.ok) {
          vapid = { ...vapid, enabled: false, code: 'vapid_rejected', reason: applied.reason };
        } else {
          configuredVapidPair = fingerprint;
        }
      }
    }

    const databaseUrl = typeof env.DATABASE_URL === 'string' ? env.DATABASE_URL.trim() : '';

    if (required) {
      const problems = [];
      if (!vapid.enabled) problems.push(`VAPID: ${vapid.reason}`);
      if (!databaseUrl) {
        problems.push(
          'DATABASE_URL is not set. Push subscriptions must live in PostgreSQL (Neon); ' +
            'set the pooled connection string on the Render web service.'
        );
      }
      if (problems.length) {
        const error = new Error(`Web Push configuration is incomplete.\n- ${problems.join('\n- ')}`);
        error.code = 'push_config_invalid';
        throw error;
      }
    }

    const previousDatabase = database;
    if (previousDatabase) void previousDatabase.close();
    database = databaseAdapter !== undefined
      ? databaseAdapter
      : databaseUrl
        ? createPostgresDatabase({
            connectionString: databaseUrl,
            migrationSql: loadPushMigrationSql(),
            logger,
          })
        : null;
    store = createPushStore({ database, logger });
  }

  build();

  function requireEnabled() {
    if (!vapid.enabled) throw new PushDisabledError(vapid.reason, vapid.code);
  }

  const runtime = {
    get vapid() {
      return vapid;
    },
    get store() {
      return store;
    },

    /** Attempts a connection + migration without throwing; used at boot. */
    async prepare() {
      if (!store) return null;
      if (!preparing) {
        preparing = store.status().finally(() => {
          preparing = null;
        });
      }
      return preparing;
    },

    /** Re-reads env values (development only; server.js never calls this in prod). */
    reload() {
      build();
      void runtime.prepare();
      return { vapid: { ...vapid }, storeKind: store.kind };
    },

    /** Everything the admin panel and /api/push/config need, without secrets. */
    async status() {
      const storeStatus = store
        ? await store.status()
        : { kind: 'none', configured: false, connected: false, persistent: false, reason: 'No store.' };

      let subscribers = null;
      if (storeStatus.connected) {
        try {
          subscribers = await store.count();
        } catch (error) {
          logger.warn(`[push] could not count subscribers: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      return {
        enabled: vapid.enabled && storeStatus.connected,
        subscribers,
        vapid: { configured: vapid.enabled, code: vapid.code, reason: vapid.reason },
        store: storeStatus,
      };
    },

    async broadcast(notification) {
      requireEnabled();
      return sendPushToAll({
        store,
        sendNotification: (subscription, payload, options) =>
          webpush.sendNotification(subscription, payload, options),
        notification,
        logger,
      });
    },

    /** Future-facing API: one owner's devices, scoped in SQL by user_id. */
    async sendToUser(userId, notification) {
      requireEnabled();
      return sendPushToUser({
        userId,
        store,
        sendNotification: (subscription, payload, options) =>
          webpush.sendNotification(subscription, payload, options),
        notification,
        logger,
      });
    },

    async close() {
      if (database) await database.close();
      database = null;
    },
  };

  return runtime;
}
