/**
 * Admin authentication for the private admin panel.
 *
 * The Node server verifies ADMIN_PASSCODE and hands back an opaque bearer
 * token. The token is kept in sessionStorage, so closing the tab ends the
 * session, and every admin-only request sends it in the Authorization header.
 * No part of the public app imports this module except the admin pages and the
 * AI proxy transport.
 */

const ADMIN_TOKEN_STORAGE_KEY = 'dhikr-counter-admin-token-v1';
const ADMIN_LOGIN_ENDPOINT = '/api/admin/login';
const ADMIN_SESSION_ENDPOINT = '/api/admin/session';
const ADMIN_LOGOUT_ENDPOINT = '/api/admin/logout';
const REQUEST_TIMEOUT_MS = 12_000;

const ENV_PROXY_URL =
  typeof import.meta.env?.VITE_AI_PROXY_URL === 'string'
    ? import.meta.env.VITE_AI_PROXY_URL.trim()
    : '';

let cachedToken: string | null = null;

/**
 * Root URL of the Node service that answers the admin API. An empty string
 * means "same origin" (the normal deployment and local `npm run dev`).
 */
export function resolveAdminServerUrl(): string {
  return ENV_PROXY_URL
    .replace(/\/+$/, '')
    .replace(/\/api(\/ai\/chat)?$/i, '');
}

export function getAdminToken(): string {
  if (cachedToken !== null) {
    return cachedToken;
  }

  try {
    cachedToken = sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || '';
  } catch {
    cachedToken = '';
  }

  return cachedToken;
}

function storeAdminToken(token: string): void {
  cachedToken = token;
  try {
    if (token) {
      sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
    } else {
      sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Storage can be blocked (private mode); the in-memory token still works
    // for this page load.
  }
}

export function clearAdminToken(): void {
  storeAdminToken('');
}

/**
 * True when `url` points at the server that issued the admin token. Used before
 * attaching the bearer token to a request, so a proxy URL typed into the AI
 * studio can never receive the credential.
 */
export function isAdminServerEndpoint(url: string): boolean {
  const server = resolveAdminServerUrl();
  const fallbackOrigin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
  try {
    const target = new URL(url, fallbackOrigin);
    const trusted = new URL(server || fallbackOrigin);
    return target.origin === trusted.origin;
  } catch {
    return false;
  }
}

export interface AdminSessionInfo {
  /** True when the server has ADMIN_PASSCODE configured. */
  enabled: boolean;
  authenticated: boolean;
  /** False when the admin API could not be reached at all. */
  reachable: boolean;
  expiresAt?: number;
}

interface AdminRequestResult {
  response: Response;
  data: Record<string, unknown> | null;
}

async function adminRequest(endpoint: string, body?: unknown): Promise<AdminRequestResult> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const token = getAdminToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;

  try {
    const response = await fetch(`${resolveAdminServerUrl()}${endpoint}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller?.signal,
    });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('json')
      ? ((await response.json().catch(() => null)) as Record<string, unknown> | null)
      : null;
    return { response, data };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const SERVER_UNREACHABLE =
  'Could not reach the app server. Admin access needs server.js (npm run dev or npm start), or VITE_AI_PROXY_URL pointing at that service.';

const API_NOT_JSON =
  'The admin API did not answer with JSON. Start the app through server.js (npm run dev or npm start) instead of a static file server.';

/**
 * Asks the server whether the panel is enabled and whether the current token is
 * still valid. Never throws: the login screen needs to tell the difference
 * between "wrong passcode", "panel disabled" and "server unreachable".
 */
export async function checkAdminSession(): Promise<AdminSessionInfo> {
  try {
    const { response, data } = await adminRequest(ADMIN_SESSION_ENDPOINT);
    if (!data) {
      return { enabled: false, authenticated: false, reachable: false };
    }
    const authenticated = response.ok && data.authenticated === true;
    if (!authenticated) {
      clearAdminToken();
    }
    return {
      enabled: data.enabled === true,
      authenticated,
      reachable: response.ok,
      expiresAt: typeof data.expiresAt === 'number' ? data.expiresAt : undefined,
    };
  } catch {
    return { enabled: false, authenticated: false, reachable: false };
  }
}

export async function loginAdmin(passcode: string): Promise<void> {
  let result: AdminRequestResult;
  try {
    result = await adminRequest(ADMIN_LOGIN_ENDPOINT, { passcode });
  } catch {
    throw new Error(SERVER_UNREACHABLE);
  }

  const { response, data } = result;
  if (!data) {
    throw new Error(API_NOT_JSON);
  }

  if (!response.ok) {
    const message = typeof data.error === 'string' ? data.error : '';
    throw new Error(message || `Admin sign-in failed (HTTP ${response.status}).`);
  }

  const token = typeof data.token === 'string' ? data.token : '';
  if (!token) {
    throw new Error('The server did not return an admin session token.');
  }
  storeAdminToken(token);
}

/** Best-effort server-side invalidation; the local token is always cleared. */
export async function logoutAdmin(): Promise<void> {
  try {
    await adminRequest(ADMIN_LOGOUT_ENDPOINT, {});
  } catch {
    // Logging out locally is enough when the server is asleep or unreachable.
  } finally {
    clearAdminToken();
  }
}
