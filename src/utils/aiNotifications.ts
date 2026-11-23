export interface AiProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  /**
   * Optional absolute URL of a deployed copy of server.js, for static hosting
   * where /api is not served by this app. Blank means "same origin".
   */
  proxyUrl: string;
}

export interface AiProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  note: string;
}

export const AI_PROVIDER_STORAGE_KEY = 'dhikr-counter-ai-provider-v1';

/** Same-origin endpoints served by server.js. Absent on a static-only host. */
export const AI_PROXY_ENDPOINT = '/api/ai/chat';
export const AI_HEALTH_ENDPOINT = '/api/health';
/** Build-time default for the proxy URL, used when the UI field is blank. */
const ENV_PROXY_URL = typeof import.meta.env?.VITE_AI_PROXY_URL === 'string' ? import.meta.env.VITE_AI_PROXY_URL.trim() : '';

export interface AiProxyEndpoints {
  chat: string;
  health: string;
  /** True when the proxy runs on a different origin (a separately deployed server). */
  crossOrigin: boolean;
}

/**
 * Resolves where AI requests are sent. Blank keeps the bundled same-origin
 * proxy; an absolute URL points at a server.js deployed elsewhere, which is how
 * a static deployment (GitHub Pages, a Render static site) can still proxy.
 */
export function resolveProxyEndpoints(proxyUrl?: string): AiProxyEndpoints {
  const configured = (proxyUrl || ENV_PROXY_URL || '').trim();
  if (!configured) {
    return { chat: AI_PROXY_ENDPOINT, health: AI_HEALTH_ENDPOINT, crossOrigin: false };
  }
  const trimmed = configured.replace(/\/+$/, '');
  const chatUrl = /\/api\/ai\/chat$/i.test(trimmed) ? trimmed : `${trimmed}/api/ai/chat`;
  try {
    const parsed = new URL(chatUrl);
    const health = new URL(parsed.toString());
    health.pathname = '/api/health';
    const pageOrigin = typeof window === 'undefined' ? '' : window.location.origin;
    return { chat: parsed.toString(), health: health.toString(), crossOrigin: Boolean(pageOrigin) && parsed.origin !== pageOrigin };
  } catch {
    throw new Error('Enter a valid AI proxy URL, such as https://your-app.onrender.com.');
  }
}


export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash',
    note: 'Has a free tier and permits direct browser requests.',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    note: 'Blocks browser requests, so it needs the bundled server proxy.',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
    note: 'Permits browser requests for many models.',
  },
  {
    id: 'custom',
    label: 'Custom OpenAI-compatible',
    baseUrl: '',
    model: '',
    note: 'Any provider exposing POST /chat/completions.',
  },
];

export const DEFAULT_AI_PROVIDER: AiProviderConfig = {
  baseUrl: AI_PROVIDER_PRESETS[0].baseUrl,
  apiKey: '',
  model: AI_PROVIDER_PRESETS[0].model,
  proxyUrl: '',
};


export function loadAiProvider(): AiProviderConfig {
  try {
    const raw = localStorage.getItem(AI_PROVIDER_STORAGE_KEY);
    return raw ? { ...DEFAULT_AI_PROVIDER, ...JSON.parse(raw) as Partial<AiProviderConfig> } : DEFAULT_AI_PROVIDER;
  } catch {
    return DEFAULT_AI_PROVIDER;
  }
}

export function saveAiProvider(config: AiProviderConfig): void {
  localStorage.setItem(AI_PROVIDER_STORAGE_KEY, JSON.stringify(config));
}

export function clearAiProvider(): void {
  localStorage.removeItem(AI_PROVIDER_STORAGE_KEY);
}

export type AiRequestRoute = 'proxy' | 'direct';

export interface AiRequestResult {
  content: string;
  route: AiRequestRoute;
}

export interface AiProxyStatus {
  available: boolean;
  serverKeyConfigured: boolean;
  defaultBaseUrl?: string;
  defaultModel?: string;
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function isLoopbackHost(hostname: string): boolean {
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname);
}

/**
 * Accepts either a base URL ("https://api.openai.com/v1") or a full
 * completions URL, so pasting the endpoint itself still works.
 */
export function buildChatEndpoint(baseUrl: string): URL {
  const trimmed = normalizeBaseUrl(baseUrl);
  if (!trimmed) throw new Error('Enter the API base URL.');
  let endpoint: URL;
  try {
    endpoint = new URL(/\/chat\/completions$/i.test(trimmed) ? trimmed : `${trimmed}/chat/completions`);
  } catch {
    throw new Error('Enter a valid API base URL, such as https://api.openai.com/v1.');
  }
  if (endpoint.protocol !== 'https:' && !isLoopbackHost(endpoint.hostname)) {
    throw new Error('For security, the API URL must use HTTPS.');
  }
  return endpoint;
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('json')) return null;
  return (await response.json().catch(() => null)) as Record<string, unknown> | null;
}

/** Detects whether a deployment runs the bundled proxy from server.js. */
export async function getAiProxyStatus(proxyUrl?: string): Promise<AiProxyStatus> {
  let healthEndpoint = AI_HEALTH_ENDPOINT;
  try {
    healthEndpoint = resolveProxyEndpoints(proxyUrl).health;
  } catch {
    return { available: false, serverKeyConfigured: false };
  }
  try {
    const response = await fetch(healthEndpoint, { headers: { Accept: 'application/json' } });
    const data = await readJson(response);
    const ai = data?.ai as { serverKeyConfigured?: boolean; defaultBaseUrl?: string; defaultModel?: string } | undefined;
    if (!response.ok || data?.ok !== true) return { available: false, serverKeyConfigured: false };
    return {
      available: true,
      serverKeyConfigured: Boolean(ai?.serverKeyConfigured),
      defaultBaseUrl: ai?.defaultBaseUrl,
      defaultModel: ai?.defaultModel,
    };
  } catch {
    return { available: false, serverKeyConfigured: false };
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * The proxy only attaches its server-side key to the provider it was configured
 * for, so a client key is still required for any other host.
 */
export function usesServerKey(config: AiProviderConfig, proxy: AiProxyStatus | null): boolean {
  if (!proxy?.available || !proxy.serverKeyConfigured || !proxy.defaultBaseUrl) return false;
  const configHost = hostOf(config.baseUrl);
  return Boolean(configHost) && configHost === hostOf(proxy.defaultBaseUrl);
}


/**
 * A 5xx without JSON means /api exists but its backend is down, which is what
 * Vite returns when server.js is not running. Report that instead of falling
 * back to a browser call the provider will block with a vague CORS error.
 */
function proxyDownMessage(status: number, endpoint: string): string {
  return (
    `The app server answered ${endpoint} with HTTP ${status} instead of JSON, so the AI proxy is not running. ` +
    'Start it with "npm run dev" (development) or "npm start" (production), then try again.'
  );
}

/**
 * Sends the request through server.js. Returns null when no proxy is
 * reachable (static hosting), so the caller can fall back to a direct call.
 */
async function requestViaProxy(config: AiProviderConfig, prompt: string, maxTokens: number): Promise<string | null> {
  const endpoints = resolveProxyEndpoints(config.proxyUrl);
  let response: Response;
  try {
    response = await fetch(endpoints.chat, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        baseUrl: normalizeBaseUrl(config.baseUrl),
        apiKey: config.apiKey.trim(),
        model: config.model.trim(),
        prompt,
        maxTokens,
      }),
    });
  } catch {
    if (endpoints.crossOrigin) {
      throw new Error(
        `Could not reach the AI proxy at ${endpoints.chat}. Check that the server is running and that AI_PROXY_ORIGINS on it includes ${window.location.origin}.`
      );
    }
    return null;
  }

  const data = await readJson(response);
  // Static hosts rewrite unknown routes to index.html (HTML, not JSON). A 5xx
  // without JSON instead means a proxy is wired up but its backend is down.
  if (!data) {
    if (endpoints.crossOrigin) {
      throw new Error(`The AI proxy at ${endpoints.chat} did not return JSON (HTTP ${response.status}).`);
    }
    if (response.status >= 500) throw new Error(proxyDownMessage(response.status, endpoints.chat));
    return null;
  }

  const message = typeof data.error === 'string' ? data.error : '';
  if (!response.ok) {
    if (response.status === 404 && message === 'Not found.') {
      if (endpoints.crossOrigin) {
        throw new Error(`The AI proxy at ${endpoints.chat} has no /api/ai/chat route. Point the proxy URL at the app root, not a subpath.`);
      }
      return null;
    }
    throw new Error(message || `The AI proxy failed (${response.status}).`);
  }
  const content = typeof data.content === 'string' ? data.content.trim() : '';
  if (!content) throw new Error('The AI proxy returned an empty response.');
  return content;
}

/**
 * Hosts that reject browser requests outright (their POST responses carry no
 * Access-Control-Allow-Origin), so a direct call can only fail.
 */
const BROWSER_BLOCKED_HOSTS = new Set(['api.openai.com']);

export function needsProxyInBrowser(baseUrl: string): boolean {
  return BROWSER_BLOCKED_HOSTS.has(hostOf(baseUrl));
}

function corsBlockedMessage(proxyEndpoint: string): string {
  return (
    `No AI proxy answered ${proxyEndpoint} on this site, so the browser called the provider directly and it was blocked by ` +
    'cross-origin (CORS) rules. Serve the app with server.js ("npm start", or "npm run dev" locally), or enter a deployed ' +
    'copy of this app in "AI proxy URL", or switch to a provider that allows browser requests (Google Gemini or OpenRouter).'
  );
}

function providerBlocksBrowserMessage(host: string, proxyEndpoint: string): string {
  return (
    `${host} does not allow browser requests, and no AI proxy answered ${proxyEndpoint}, so this request cannot succeed ` +
    'from the page. Switch to a provider that allows browser requests (Google Gemini or OpenRouter), or serve the app with ' +
    'server.js / enter a deployed copy of it in "AI proxy URL".'
  );
}

async function requestDirect(config: AiProviderConfig, prompt: string, maxTokens: number): Promise<string> {
  const apiKey = config.apiKey.trim();
  if (!apiKey) {
    throw new Error('Add an API key, or run the app with npm start so the server proxy can use a server-side key.');
  }

  const endpoint = buildChatEndpoint(config.baseUrl);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: config.model.trim(),
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(corsBlockedMessage(resolveProxyEndpoints(config.proxyUrl).chat));
    }
    throw error;
  }

  const data = await readJson(response);
  if (!data) {
    throw new Error(`The provider returned a non-JSON response (${response.status}). Check the API base URL.`);
  }
  if (!response.ok) {
    const error = data.error as { message?: string } | undefined;
    throw new Error(error?.message || `AI provider request failed (${response.status}).`);
  }
  const choices = data.choices as { message?: { content?: string } }[] | undefined;
  const content = choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('The provider returned an empty response.');
  return content;
}

export async function requestAiCompletionDetailed(
  config: AiProviderConfig,
  prompt: string,
  maxTokens = 300
): Promise<AiRequestResult> {
  if (!normalizeBaseUrl(config.baseUrl) || !config.model.trim()) {
    throw new Error('Enter the API base URL and the model name.');
  }
  // Validate the URL before touching the network so mistakes fail fast.
  buildChatEndpoint(config.baseUrl);

  const proxied = await requestViaProxy(config, prompt, maxTokens);
  if (proxied !== null) return { content: proxied, route: 'proxy' };

  // Skip a direct call that the provider is guaranteed to block in the browser.
  if (needsProxyInBrowser(config.baseUrl)) {
    throw new Error(providerBlocksBrowserMessage(hostOf(config.baseUrl), resolveProxyEndpoints(config.proxyUrl).chat));
  }

  return { content: await requestDirect(config, prompt, maxTokens), route: 'direct' };
}

export async function requestAiCompletion(config: AiProviderConfig, prompt: string, maxTokens = 300): Promise<string> {
  return (await requestAiCompletionDetailed(config, prompt, maxTokens)).content;
}
