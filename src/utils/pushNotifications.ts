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
import { getNotificationPermission, type NotificationPermissionState } from './notifications';

const PUSH_CONFIG_ENDPOINT = '/api/push/config';
const PUSH_STATUS_ENDPOINT = '/api/push/status';
const PUSH_SUBSCRIBE_ENDPOINT = '/api/push/subscribe';
const PUSH_UNSUBSCRIBE_ENDPOINT = '/api/push/unsubscribe';
const ADMIN_PUSH_ENDPOINT = '/api/admin/push';
const REQUEST_TIMEOUT_MS = 15_000;
const SERVICE_WORKER_TIMEOUT_MS = 20_000;
const PUSH_OPT_OUT_KEY = 'dhikr-counter-push-opt-out';

export function hasOptedOutOfPushNotifications(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(PUSH_OPT_OUT_KEY) === 'true';
  } catch {
    return false;
  }
}

function setPushOptOut(optedOut: boolean): void {
  try {
    if (typeof localStorage !== 'undefined') {
      if (optedOut) localStorage.setItem(PUSH_OPT_OUT_KEY, 'true');
      else localStorage.removeItem(PUSH_OPT_OUT_KEY);
    }
  } catch {
    // A storage restriction must not prevent a user from managing notifications.
  }
}

const SERVER_UNREACHABLE =
  'Could not reach the app server. A broadcast needs server.js (npm run dev or npm start), or VITE_AI_PROXY_URL pointing at that service.';
const API_NOT_JSON =
  'The admin API did not answer with JSON. Start the app through server.js (npm run dev or npm start) instead of a static file server.';

export type PushRegistrationResult =
  | 'subscribed'
  | 'unsupported'
  | 'permission-denied'
  | 'opted-out'
  /** The server has no stable VAPID keys or no PostgreSQL store configured. */
  | 'disabled'
  | 'unavailable';

export interface PushBroadcastResult {
  total: number;
  sent: number;
  failed: number;
  removed: number;
}

export interface PushConfig {
  enabled: boolean;
  publicKey: string;
  code: string;
  reason: string;
}

export interface PushStatus {
  /** null when PostgreSQL is unreachable, so 0 is never shown misleadingly. */
  subscribers: number | null;
  enabled: boolean;
  /** True only when both VAPID keys come from the environment and match. */
  vapidConfigured: boolean;
  /** True only when the PostgreSQL store is configured and connected. */
  persistentStore: boolean;
  storeConnected: boolean;
  vapidReason: string;
  storeReason: string;
}

export interface PushDeviceState {
  supported: boolean;
  permission: NotificationPermissionState;
  subscribed: boolean;
  endpoint: string | null;
  serverReady: boolean | null;
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

export async function fetchPushConfig(): Promise<PushConfig> {
  const { response, data } = await requestJson(PUSH_CONFIG_ENDPOINT, {
    headers: { Accept: 'application/json' },
  });
  const publicKey = typeof data?.publicKey === 'string' ? data.publicKey : '';
  const enabled = response.ok && data?.enabled === true && Boolean(publicKey);
  return {
    enabled,
    publicKey,
    code: typeof data?.code === 'string' ? data.code : enabled ? 'ok' : 'push_unavailable',
    reason:
      typeof data?.reason === 'string' && data.reason
        ? data.reason
        : enabled
          ? ''
          : 'Push notifications are not enabled on the app server.',
  };
}

/** Server readiness without device identity or subscriber counts. */
async function fetchServerReady(): Promise<boolean | null> {
  try {
    const { response, data } = await requestJson(PUSH_STATUS_ENDPOINT, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok || !data) return null;
    return data.enabled === true;
  } catch {
    return null;
  }
}

/**
 * Registers this device for broadcasts. Safe to call on every launch: an
 * existing subscription is reused and re-posted, so the server's PostgreSQL
 * row is refreshed after a redeploy or key change. Returns 'disabled' when the
 * server has no stable keys/database instead of pretending it worked.
 */
export async function registerPushDevice(
  { userInitiated = false }: { userInitiated?: boolean } = {}
): Promise<PushRegistrationResult> {
  if (!pushSupported()) return 'unsupported';
  if (getNotificationPermission() !== 'granted') return 'permission-denied';
  if (!userInitiated && hasOptedOutOfPushNotifications()) return 'opted-out';

  try {
    const config = await fetchPushConfig();
    if (!config.enabled) return 'disabled';

    if (userInitiated) setPushOptOut(false);
    const registration = await readyRegistration();
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

    const { response, data } = await requestJson(PUSH_SUBSCRIBE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });
    // The server answers only after the PostgreSQL upsert commits, so this
    // response is the confirmation; no separate lookup is needed.
    if (!response.ok || data?.registered !== true) return 'unavailable';

    return 'subscribed';
  } catch {
    return 'unavailable';
  }
}

/** Local state only: permission, and whether this browser holds a subscription. */
export async function getPushDeviceState(): Promise<PushDeviceState> {
  const permission = getNotificationPermission();
  const supported = pushSupported();
  let subscribed = false;
  let endpoint: string | null = null;

  if (supported) {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      subscribed = Boolean(subscription);
      endpoint = subscription?.endpoint ?? null;
    } catch {
      // No registration yet, or the browser blocked access.
    }
  }

  return { supported, permission, subscribed, endpoint, serverReady: await fetchServerReady() };
}

/**
 * Removes this device from broadcasts. The server requires the subscription's
 * p256dh/auth keys as proof of ownership, so an endpoint copied from a log
 * cannot unregister someone else's device. The local subscription is dropped
 * afterwards either way.
 */
export async function unsubscribePushDevice(): Promise<boolean> {
  if (!pushSupported()) return false;

  try {
    const registration = await readyRegistration();
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      setPushOptOut(true);
      return true;
    }

    const json = subscription.toJSON();
    const { response } = await requestJson(PUSH_UNSUBSCRIBE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint, keys: json.keys }),
    });

    if (!response.ok) return false;
    const removedLocally = await subscription.unsubscribe();
    if (removedLocally) setPushOptOut(true);
    return removedLocally;
  } catch {
    return false;
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
    const vapid = (data.vapid ?? {}) as Record<string, unknown>;
    const store = (data.store ?? {}) as Record<string, unknown>;
    const subscribers = typeof data.subscribers === 'number' ? data.subscribers : null;
    return {
      subscribers,
      enabled: data.enabled === true,
      vapidConfigured: vapid.configured === true,
      persistentStore: store.persistent === true && store.connected === true,
      storeConnected: store.connected === true,
      vapidReason: typeof vapid.reason === 'string' ? vapid.reason : '',
      storeReason: typeof store.reason === 'string' ? store.reason : '',
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
