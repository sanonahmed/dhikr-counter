/**
 * VAPID configuration.
 *
 * Keys come from the environment only. Nothing here generates a keypair: a
 * throwaway pair silently invalidates every existing subscription on restart,
 * which is exactly the failure this module exists to prevent. Missing or
 * malformed keys disable push (development) or stop the boot with a clear
 * message (production, see server.js).
 */
import crypto from 'node:crypto';

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;
const P256_PUBLIC_KEY_BYTES = 65;
const P256_PRIVATE_KEY_BYTES = 32;

function decodeBase64Url(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed || trimmed.length > 512 || !BASE64URL.test(trimmed)) return null;
  const bytes = Buffer.from(trimmed.replace(/=+$/, ''), 'base64url');
  return bytes.length > 0 ? bytes : null;
}

/** `mailto:` or `https:` contact address required by the VAPID spec. */
export function isValidVapidSubject(subject) {
  const value = typeof subject === 'string' ? subject.trim() : '';
  if (!value || value.length > 320) return false;
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value)) return true;
  if (!/^https:\/\//i.test(value)) return false;
  try {
    return new URL(value).hostname.length > 0;
  } catch {
    return false;
  }
}

/**
 * Confirms the public key is an uncompressed P-256 point and that it belongs to
 * the private key. A mismatched pair produces 401/403 from every push service
 * and would burn through the stored subscriptions, so it is rejected at boot.
 */
export function validateVapidKeyPair(publicKey, privateKey) {
  const publicBytes = decodeBase64Url(publicKey);
  if (!publicBytes || publicBytes.length !== P256_PUBLIC_KEY_BYTES || publicBytes[0] !== 0x04) {
    return { ok: false, reason: 'VAPID_PUBLIC_KEY must be a base64url-encoded uncompressed P-256 public key.' };
  }

  const privateBytes = decodeBase64Url(privateKey);
  if (!privateBytes || privateBytes.length !== P256_PRIVATE_KEY_BYTES) {
    return { ok: false, reason: 'VAPID_PRIVATE_KEY must be a base64url-encoded 32-byte P-256 private key.' };
  }

  try {
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.setPrivateKey(privateBytes);
    if (!ecdh.getPublicKey().equals(publicBytes)) {
      return { ok: false, reason: 'VAPID_PUBLIC_KEY does not match VAPID_PRIVATE_KEY.' };
    }
  } catch {
    return { ok: false, reason: 'VAPID_PRIVATE_KEY is not a valid P-256 private key.' };
  }

  return { ok: true, reason: '' };
}

/**
 * Reads and validates VAPID settings. Never throws: the returned object says
 * whether push can run and why not, so the UI can explain the exact fix.
 */
export function loadVapidConfig(env = process.env) {
  const publicKey = typeof env.VAPID_PUBLIC_KEY === 'string' ? env.VAPID_PUBLIC_KEY.trim() : '';
  const privateKey = typeof env.VAPID_PRIVATE_KEY === 'string' ? env.VAPID_PRIVATE_KEY.trim() : '';
  const subject = typeof env.VAPID_SUBJECT === 'string' ? env.VAPID_SUBJECT.trim() : '';

  if (!publicKey && !privateKey) {
    return {
      enabled: false,
      code: 'vapid_missing',
      reason:
        'VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are not set. Generate them once with `npx web-push generate-vapid-keys` and add them to the server environment.',
      publicKey: '',
      privateKey: '',
      subject,
    };
  }

  if (!publicKey || !privateKey) {
    return {
      enabled: false,
      code: 'vapid_incomplete',
      reason: 'Set both VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY; one key alone cannot sign pushes.',
      publicKey,
      privateKey,
      subject,
    };
  }

  const pair = validateVapidKeyPair(publicKey, privateKey);
  if (!pair.ok) {
    return { enabled: false, code: 'vapid_invalid', reason: pair.reason, publicKey, privateKey, subject };
  }

  if (!subject) {
    return {
      enabled: false,
      code: 'vapid_subject_missing',
      reason: 'VAPID_SUBJECT is required (for example mailto:admin@yourdomain.com).',
      publicKey,
      privateKey,
      subject,
    };
  }

  if (!isValidVapidSubject(subject)) {
    return {
      enabled: false,
      code: 'vapid_subject_invalid',
      reason: 'VAPID_SUBJECT must be a mailto: or https: URL.',
      publicKey,
      privateKey,
      subject,
    };
  }

  return { enabled: true, code: 'ok', reason: '', publicKey, privateKey, subject };
}

/**
 * Registers the signing details with web-push once per configuration change.
 * Returns an error message instead of throwing so a bad reload cannot take the
 * whole server down.
 */
export function configureWebPush(webpush, config) {
  if (!config?.enabled) return { ok: false, reason: config?.reason || 'VAPID is not configured.' };
  try {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    return { ok: true, reason: '' };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
