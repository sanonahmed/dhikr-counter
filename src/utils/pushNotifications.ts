/**
 * Web Push registration and admin broadcast.
 *
 * Every device that grants notification permission registers its Push API
 * subscription with the Node server. The admin panel then sends one message to
 * all registered devices, including devices where the app is closed. A static
 * deployment talks to the Node service through VITE_AI_PROXY_URL / the saved
 * admin server address, exactly like the admin API.
 */
import { getAdminToken, resolveAdminServerUrl } from './adminSession';
import { getNotificationPermission } from './notifications';

const PUSH_CONFIG_ENDPOINT = '/api/push/config';
const PUSH_SUBSCRIBE_ENDPOINT = '/api/push/subscribe';
const ADMIN_PUSH_ENDPOINT = '/api/admin/push';
const REQUEST_TIMEOUT_MS = 15_000;
const SERVICE_WORKER_TIMEOUT_MS = 20_000;

const SERVER_UNREACHABLE =
  'Could not reach the app server. A broadcast needs server.js (npm run dev or npm start), or VITE_AI_PROXY_URL pointing at that service.';
const API_NOT_JSON =
  'The admin API did not answer with JSON. Start the app through server.js (npm run dev or npm start) instead of a static file server.';

export type PushRegistrationResult =
  | 'subscribed'
  | 'unsupported'
  | 'permission-denied'
  | 'unavailable';

export interface PushBroadcastResult {
  total: number;
  sent: number;
  failed: number;
  removed: number;
}

export interface PushStatus {
  subscribers: number;
  /** False when the server generated throwaway VAPID keys at boot. */
  vapidKeysStable: boolean;
  /** True when subscriptions are saved to a persistent path across restarts. */
  persistentStore: boolean;
}

interface JsonResult {
  response: Response;
  data: Record<string, unknown> | null;
}

function serverUrl(pathname: string): string {
  return `${resolveAdminServerUrl()}${pathname}`;
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    globalThis.isSecureContext === true
  );
}

async function requestJson(pathname: string, init: RequestInit): Promise<JsonResult> {
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
  try {
    const response = await fetch(serverUrl(pathname), { ...init, signal: controller?.signal });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('json')
      ? ((await response.json().catch(() => null)) as Record<string, unknown> | null)
      : null;
    return { response, data };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    value.length + ((4 - (value.length % 4)) % 4),
    '='
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** True when the existing subscription was created with the server's key. */
function usesServerKey(subscription: PushSubscription, publicKey: string): boolean {
  const raw = subscription.options?.applicationServerKey;
  // Browsers that do not expose the key are left alone; the server prunes the
  // subscription if delivery is rejected.
  if (!raw) return true;
  let binary = '';
  for (const byte of new Uint8Array(raw)) binary += String.fromCharCode(byte);
  const current = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return current === publicKey.replace(/=+$/, '');
}

function readyRegistration(): Promise<ServiceWorkerRegistration> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('The service worker did not become ready.')),
      SERVICE_WORKER_TIMEOUT_MS
    );
    navigator.serviceWorker.ready.then(
      (registration) => {
        clearTimeout(timer);
        resolve(registration);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function fetchPushConfig(): Promise<{ publicKey: string }> {
  const { response, data } = await requestJson(PUSH_CONFIG_ENDPOINT, {
    headers: { Accept: 'application/json' },
  });
  const publicKey = typeof data?.publicKey === 'string' ? data.publicKey : '';
  if (!response.ok || data?.enabled !== true || !publicKey) {
    throw new Error('Push notifications are not enabled on the app server.');
  }
  return { publicKey };
}

/**
 * Registers this device for broadcasts. Safe to call on every launch: an
 * existing subscription is re-posted so the server repopulates its store after
 * a restart. Returns 'permission-denied' (and does nothing) until the user has
 * allowed notifications.
 */
export async function registerPushDevice(): Promise<PushRegistrationResult> {
  if (!pushSupported()) return 'unsupported';
  if (getNotificationPermission() !== 'granted') return 'permission-denied';

  try {
    const [registration, config] = await Promise.all([readyRegistration(), fetchPushConfig()]);
    let subscription = await registration.pushManager.getSubscription();

    if (subscription && !usesServerKey(subscription, config.publicKey)) {
      await subscription.unsubscribe().catch(() => false);
      subscription = null;
    }

    if (!subscription) {
      const applicationServerKey = base64UrlToBytes(config.publicKey).buffer as ArrayBuffer;
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    }

    const { response } = await requestJson(PUSH_SUBSCRIBE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });
    return response.ok ? 'subscribed' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export async function getPushStatus(): Promise<PushStatus | null> {
  const token = getAdminToken();
  if (!token) return null;
  try {
    const { response, data } = await requestJson(ADMIN_PUSH_ENDPOINT, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    if (!response.ok || !data) return null;
    return {
      subscribers: Number(data.subscribers) || 0,
      vapidKeysStable: data.vapidKeysStable === true,
      persistentStore: data.persistentStore === true,
    };
  } catch {
    return null;
  }
}

/** Admin-only broadcast to every registered device. */
export async function sendPushToAllDevices(title: string, body: string): Promise<PushBroadcastResult> {
  const token = getAdminToken();
  if (!token) {
    throw new Error('Your admin session has ended. Lock and unlock the admin panel again.');
  }

  let result: JsonResult;
  try {
    result = await requestJson(ADMIN_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title, body }),
    });
  } catch {
    throw new Error(SERVER_UNREACHABLE);
  }

  const { response, data } = result;
  if (!data) {
    throw new Error(API_NOT_JSON);
  }
  if (!response.ok) {
    const message = typeof data.error === 'string' ? data.error : '';
    throw new Error(message || `The broadcast failed (HTTP ${response.status}).`);
  }

  return {
    total: Number(data.total) || 0,
    sent: Number(data.sent) || 0,
    failed: Number(data.failed) || 0,
    removed: Number(data.removed) || 0,
  };
}
