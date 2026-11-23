/** Reusable per-device push delivery with bounded concurrency and expiry cleanup. */
export const PUSH_BATCH_SIZE = 50;
export const PUSH_SEND_OPTIONS = Object.freeze({ TTL: 3600, urgency: 'high', timeout: 10_000 });

function safeErrorStatus(error) {
  return Number(error?.statusCode) || 0;
}

function safeErrorCode(error) {
  return typeof error?.code === 'string' ? error.code.slice(0, 80) : '';
}

function normalizeNotification(notification) {
  const title = typeof notification?.title === 'string' ? notification.title.trim() : '';
  const body = typeof notification?.body === 'string' ? notification.body.trim() : '';
  const url = typeof notification?.url === 'string' && notification.url.startsWith('/') && !notification.url.startsWith('//')
    ? notification.url
    : '/';
  const icon = typeof notification?.icon === 'string' && notification.icon.startsWith('/')
    ? notification.icon
    : '/pwa-192x192.png';
  const badge = typeof notification?.badge === 'string' && notification.badge.startsWith('/')
    ? notification.badge
    : '/pwa-192x192.png';
  const tag = typeof notification?.tag === 'string' ? notification.tag.slice(0, 120) : undefined;
  return { title: title || 'Dhikr Counter', body, url, icon, badge, tag };
}

/**
 * Sends a payload to all of the supplied subscriptions. Each delivery is
 * independent; one push service timeout cannot cancel the rest of its batch.
 * Permanently gone endpoints (404/410) are deleted after delivery completes.
 */
export async function sendPushToSubscriptions({
  subscriptions,
  sendNotification,
  removeByEndpoint,
  notification,
  logger = console,
  batchSize = PUSH_BATCH_SIZE,
} = {}) {
  const entries = Array.isArray(subscriptions) ? subscriptions : [];
  const payload = JSON.stringify(normalizeNotification(notification));
  const result = { total: entries.length, sent: 0, failed: 0, removed: 0 };
  const expiredEndpoints = [];

  for (let index = 0; index < entries.length; index += batchSize) {
    const batch = entries.slice(index, index + batchSize);
    const outcomes = await Promise.all(batch.map(async (subscription) => {
      try {
        await sendNotification(subscription, payload, PUSH_SEND_OPTIONS);
        return { ok: true, endpoint: subscription.endpoint };
      } catch (error) {
        const status = safeErrorStatus(error);
        if (status === 404 || status === 410) {
          expiredEndpoints.push(subscription.endpoint);
        } else {
          // Never include the endpoint, subscription object, VAPID material, or
          // web-push's raw error message (which may include request details).
          logger.warn(`[push] delivery failed (HTTP ${status || 'network'}${safeErrorCode(error) ? `, ${safeErrorCode(error)}` : ''}).`);
        }
        return { ok: false };
      }
    }));
    result.sent += outcomes.filter((outcome) => outcome.ok).length;
    result.failed += outcomes.filter((outcome) => !outcome.ok).length;
  }

  if (expiredEndpoints.length) {
    try {
      result.removed = await removeByEndpoint(expiredEndpoints);
    } catch (error) {
      logger.warn(`[push] could not remove ${expiredEndpoints.length} expired subscription(s) from PostgreSQL.`);
    }
  }

  return result;
}

/** Fetches a single user’s stored devices and sends the message to all of them. */
export async function sendPushToUser({ userId, store, sendNotification, notification, logger = console } = {}) {
  if (typeof userId !== 'string' || !userId.trim()) throw new TypeError('A userId is required.');
  const subscriptions = await store.list(userId);
  return sendPushToSubscriptions({
    subscriptions,
    sendNotification,
    removeByEndpoint: (endpoints) => store.removeMany(endpoints, userId),
    notification,
    logger,
  });
}

/** Anonymous deployments intentionally send only to the current anonymous owner. */
export async function sendPushToAll({ store, sendNotification, notification, logger = console } = {}) {
  const subscriptions = await store.list();
  return sendPushToSubscriptions({
    subscriptions,
    sendNotification,
    removeByEndpoint: (endpoints) => store.removeMany(endpoints),
    notification,
    logger,
  });
}
