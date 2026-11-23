/**
 * Web Push HTTP API.
 *
 * Registered from server.js so the routes stay next to the runtime they use and
 * can be mounted on a bare Express app in tests. Account-specific routes are
 * gated by `requireAdmin`; the subscription endpoints are per-device by design
 * because this application has no end-user login yet (see ADMIN.md).
 */
import { normalizePushSubscription, normalizeSubscriptionKeys, validatePushEndpoint } from './validate.js';

export const PUSH_MAX_TITLE = 120;
export const PUSH_MAX_BODY = 400;
const RATE_WINDOW_MS = 5 * 60_000;
const RATE_MAX_REQUESTS = 60;

/** Fixed-window per-IP limiter; cleanup is time-based, so memory stays bounded. */
export function createPushRateLimiter({ windowMs = RATE_WINDOW_MS, max = RATE_MAX_REQUESTS } = {}) {
  const hits = new Map();

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, windowMs);
  cleanup.unref?.();

  return function pushRateLimit(req, res, next) {
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      // A hard cap protects against unbounded growth from spoofed addresses.
      if (hits.size > 10_000) hits.clear();
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        error: `Too many push requests. Try again in ${Math.ceil(retryAfter / 60)} minute(s).`,
        code: 'push_rate_limited',
      });
      return;
    }
    next();
  };
}

function storeFailure(res) {
  res.status(503).json({
    error: 'Push storage is temporarily unavailable. Nothing was saved; try again shortly.',
    code: 'push_store_unavailable',
  });
}

function safeMessage(error) {
  return (error instanceof Error ? error.message : String(error))
    .replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted database URL]')
    .slice(0, 300);
}

/** Cross-site POSTs may not register or remove this app's device subscriptions. */
function originAllowed(req, allowedOrigins, isProduction) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const normalized = String(origin).replace(/\/+$/, '');
  if (normalized === `${req.protocol}://${req.headers.host}`) return true;
  if (allowedOrigins.includes(normalized)) return true;
  if (!isProduction) {
    try {
      const { hostname } = new URL(normalized);
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') return true;
    } catch {
      // Fall through to the rejection below.
    }
  }
  return false;
}

export function registerPushRoutes(app, {
  runtime,
  requireAdmin,
  logger = console,
  allowedOrigins = (process.env.AI_PROXY_ORIGINS || '')
    .split(',')
    .map((entry) => entry.trim().replace(/\/+$/, ''))
    .filter(Boolean),
  isProduction = process.env.NODE_ENV === 'production',
  subscribeLimiter = createPushRateLimiter(),
  unsubscribeLimiter = createPushRateLimiter(),
} = {}) {
  app.get('/api/push/config', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!runtime.vapid.enabled) {
      res.json({ enabled: false, publicKey: '', code: runtime.vapid.code, reason: runtime.vapid.reason });
      return;
    }
    let storeStatus;
    try {
      storeStatus = await runtime.store.status();
    } catch (error) {
      logger.warn(`[push] storage status check failed: ${safeMessage(error)}`);
      res.json({ enabled: false, publicKey: '', code: 'push_store_unavailable', reason: 'Push storage is unavailable.' });
      return;
    }
    if (!storeStatus.connected) {
      res.json({
        enabled: false,
        publicKey: '',
        code: 'push_store_unavailable',
        reason: storeStatus.reason || 'Push storage is unavailable.',
      });
      return;
    }
    res.json({ enabled: true, publicKey: runtime.vapid.publicKey, code: 'ok', reason: '' });
  });

  /** Safe, account-free readiness check for the public settings UI. */
  app.get('/api/push/status', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    let storeStatus;
    try {
      storeStatus = await runtime.store.status();
    } catch (error) {
      logger.warn(`[push] public status check failed: ${safeMessage(error)}`);
      storeStatus = { connected: false, persistent: false };
    }
    res.json({
      enabled: runtime.vapid.enabled && storeStatus.connected === true,
      vapidConfigured: runtime.vapid.enabled,
      storeConnected: storeStatus.connected === true,
      persistentStore: storeStatus.persistent === true,
    });
  });

  app.post('/api/push/subscribe', subscribeLimiter, async (req, res) => {
    if (!originAllowed(req, allowedOrigins, isProduction)) {
      res.status(403).json({
        error: 'This origin is not allowed to manage push subscriptions.',
        code: 'push_origin_not_allowed',
      });
      return;
    }
    if (!runtime.vapid.enabled) {
      res.status(503).json({ error: runtime.vapid.reason, code: runtime.vapid.code });
      return;
    }

    const subscription = normalizePushSubscription(req.body?.subscription ?? req.body);
    if (!subscription) {
      res.status(400).json({
        error: 'A valid HTTPS push subscription with p256dh and auth keys is required.',
        code: 'invalid_subscription',
      });
      return;
    }

    try {
      const count = await runtime.store.count();
      if (count >= runtime.store.maxSubscriptions) {
        const existing = await runtime.store.find(subscription.endpoint);
        if (!existing) {
          res.status(503).json({ error: 'This server has reached its device limit.', code: 'push_capacity_reached' });
          return;
        }
      }
      // A conflicting endpoint owned by another account is never reassigned.
      const saved = await runtime.store.upsert(subscription);
      if (!saved) {
        res.status(409).json({
          error: 'This push endpoint is already registered to another account.',
          code: 'push_endpoint_conflict',
        });
        return;
      }
      res.json({ ok: true, registered: true });
    } catch (error) {
      logger.warn(`[push] subscribe failed: ${safeMessage(error)}`);
      storeFailure(res);
    }
  });

  app.post('/api/push/unsubscribe', unsubscribeLimiter, async (req, res) => {
    if (!originAllowed(req, allowedOrigins, isProduction)) {
      res.status(403).json({
        error: 'This origin is not allowed to manage push subscriptions.',
        code: 'push_origin_not_allowed',
      });
      return;
    }
    const endpoint = validatePushEndpoint(req.body?.endpoint);
    const keys = normalizeSubscriptionKeys(req.body?.keys);
    // The keys prove this caller owns the subscription. An endpoint alone is a
    // capability URL that may appear in logs, so it is not enough to delete it.
    if (!endpoint || !keys) {
      res.status(400).json({
        error: 'The subscription endpoint and its p256dh/auth keys are required.',
        code: 'invalid_subscription',
      });
      return;
    }

    try {
      const removed = await runtime.store.remove(endpoint, keys);
      res.json({ ok: true, removed });
    } catch (error) {
      logger.warn(`[push] unsubscribe failed: ${safeMessage(error)}`);
      storeFailure(res);
    }
  });

  /** Admin-only: configuration state + how many devices would receive a broadcast. */
  app.get('/api/admin/push', requireAdmin, async (_req, res) => {
    try {
      const status = await runtime.status();
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        subscribers: status.subscribers,
        enabled: status.enabled,
        // Legacy field names kept so an older cached admin bundle still renders.
        vapidKeysStable: status.vapid.configured,
        persistentStore: status.store.persistent === true && status.store.connected === true,
        vapid: status.vapid,
        store: status.store,
      });
    } catch (error) {
      logger.warn(`[push] admin status failed: ${error instanceof Error ? error.message : String(error)}`);
      res.status(503).json({ error: 'Push status is temporarily unavailable.', code: 'push_store_unavailable' });
    }
  });

  /**
   * Admin-only broadcast to every registered device. Expired endpoints are
   * removed from PostgreSQL after the send, so the list self-heals.
   */
  app.post('/api/admin/push', requireAdmin, async (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    if (!title || !body) {
      res.status(400).json({ error: 'A notification title and message are required.', code: 'invalid_notification' });
      return;
    }
    if (title.length > PUSH_MAX_TITLE || body.length > PUSH_MAX_BODY) {
      res.status(400).json({
        error: `Keep the title under ${PUSH_MAX_TITLE} and the message under ${PUSH_MAX_BODY} characters.`,
        code: 'invalid_notification',
      });
      return;
    }

    try {
      const result = await runtime.broadcast({
        title,
        body,
        url: '/',
        tag: `admin-broadcast-${Date.now()}`,
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      if (error?.code === 'push_disabled' || error?.code?.startsWith('vapid_')) {
        res.status(503).json({ error: error.message, code: error.code });
        return;
      }
      logger.warn(`[push] broadcast failed: ${error instanceof Error ? error.message : String(error)}`);
      storeFailure(res);
    }
  });
}
