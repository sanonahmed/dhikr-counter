/**
 * Validation for browser PushSubscription objects.
 *
 * The endpoint is later POSTed to by web-push, so it is treated as an untrusted
 * URL: HTTPS only (except localhost in development), no credentials in the URL,
 * no IP literals, and no local/cloud-metadata hostnames. Keys are decoded and
 * length-checked so a malformed record can never reach the delivery loop.
 */
export const PUSH_MAX_ENDPOINT_LENGTH = 2_048;
export const PUSH_MAX_KEY_LENGTH = 512;

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata',
  'metadata.google.internal',
  'instance-data',
]);

function decodeBase64Url(value, expectedLength) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > PUSH_MAX_KEY_LENGTH || !BASE64URL.test(trimmed)) return null;
  const bytes = Buffer.from(trimmed.replace(/=+$/, ''), 'base64url');
  return bytes.length === expectedLength ? bytes : null;
}

function isBlockedHostname(hostname) {
  const host = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  // URL.hostname keeps the brackets around IPv6 literals.
  if (host.startsWith('[') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return false;
}

/**
 * Returns the normalized endpoint, or null when the URL is not acceptable.
 * `allowInsecureLocalhost` keeps `npm run dev` usable without TLS.
 */
export function validatePushEndpoint(endpoint, { allowInsecureLocalhost = process.env.NODE_ENV !== 'production' } = {}) {
  const value = typeof endpoint === 'string' ? endpoint.trim() : '';
  if (!value || value.length > PUSH_MAX_ENDPOINT_LENGTH) return null;

  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(allowInsecureLocalhost && isLocalhost)) return null;
  if (url.username || url.password) return null;
  if (isBlockedHostname(url.hostname) && !(allowInsecureLocalhost && isLocalhost)) return null;
  if (url.port && url.port !== '443' && !(allowInsecureLocalhost && isLocalhost)) return null;
  return value;
}

/** Accepts `{ p256dh, auth }` and returns sanitized keys, or null. */
export function normalizeSubscriptionKeys(input) {
  const p256dhBytes = decodeBase64Url(input?.p256dh, 65);
  if (!p256dhBytes || p256dhBytes[0] !== 0x04) return null;
  const authBytes = decodeBase64Url(input?.auth, 16);
  if (!authBytes) return null;
  return { p256dh: String(input.p256dh).trim(), auth: String(input.auth).trim() };
}

/**
 * Accepts the browser's `subscription.toJSON()` (optionally wrapped as
 * `{ subscription }`) and returns the exact record that is stored, with no
 * extra caller-supplied fields.
 */
export function normalizePushSubscription(input, options) {
  const raw = input && typeof input === 'object' ? input : {};
  const endpoint = validatePushEndpoint(raw.endpoint, options);
  if (!endpoint) return null;
  const keys = normalizeSubscriptionKeys(raw.keys);
  if (!keys) return null;

  const expirationTime =
    typeof raw.expirationTime === 'number' && Number.isFinite(raw.expirationTime) && raw.expirationTime > 0
      ? Math.trunc(raw.expirationTime)
      : null;

  return { endpoint, keys, expirationTime };
}
