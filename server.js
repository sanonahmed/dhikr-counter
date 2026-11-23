/**
 * Dhikr Counter server.
 *
 * Serves the built PWA from ./dist and relays AI requests to an
 * OpenAI-compatible provider. Relaying server-side avoids browser CORS
 * restrictions and keeps provider keys out of the static bundle.
 *
 * Run with: npm start   (after npm run build)
 */
import dotenv from 'dotenv';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load ignored local secrets first; already-exported environment and .env values
// remain available as deployment fallbacks.
const ENV_FILES = ['.env.local', '.env'];

function loadEnvFiles({ override = false } = {}) {
  for (const file of ENV_FILES) {
    dotenv.config({ path: path.join(__dirname, file), override, quiet: true });
  }
}

// Boot keeps the previous precedence: real environment variables win over files.
loadEnvFiles();

/**
 * In development, re-read the env files when they change so editing
 * AI_ALLOWED_HOSTS or AI_PROXY_ORIGINS takes effect without a restart.
 * `node --watch` only restarts on imported files, and .env is not imported.
 * Guarded to development and to a present file, so production boots unchanged.
 */
if (process.env.NODE_ENV !== 'production') {
  try {
    fs.watch(__dirname, (_event, filename) => {
      if (!filename || !ENV_FILES.includes(String(filename))) return;
      loadEnvFiles({ override: true });
      console.log(`[ai-proxy] reloaded ${filename} (AI_ALLOWED_HOSTS / AI_PROXY_ORIGINS updated).`);
    });
  } catch {
    // A missing directory or an unsupported watcher should never break startup.
  }
}

const PORT = Number(process.env.PORT) || 8787;
const PROVIDER_TIMEOUT_MS = 60_000;
const MAX_PROMPT_LENGTH = 4_000;
const MAX_TOKENS_LIMIT = 2_000;

const GEMINI_OPENAI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

/** Server-side provider credentials. Optional: the client may send its own. */
function providerDefaults() {
  const key = (process.env.AI_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || '').trim();
  const baseUrl = (
    process.env.AI_BASE_URL ||
    (process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY ? GEMINI_OPENAI_BASE_URL : DEFAULT_OPENAI_BASE_URL)
  ).trim();
  const model = (
    process.env.AI_MODEL ||
    (baseUrl.includes('generativelanguage.googleapis.com') ? 'gemini-2.5-flash' : 'gpt-4o-mini')
  ).trim();
  return { key, baseUrl, model };
}

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata', 'metadata.google.internal', 'instance-data']);
const TRUSTED_PROVIDER_HOSTS = new Set([
  'api.openai.com',
  'generativelanguage.googleapis.com',
  'openrouter.ai',
  'api.groq.com',
  'api.deepseek.com',
  'api.mistral.ai',
  'api.together.xyz',
  // Other commonly used OpenAI-compatible endpoints. Anything outside this
  // list must be named in AI_ALLOWED_HOSTS, so the endpoint cannot be pointed
  // at arbitrary servers.
  'api.x.ai',
  'api.cerebras.ai',
  'api.fireworks.ai',
  'api.moonshot.ai',
  'api.moonshot.cn',
  'api.novita.ai',
  'api.sambanova.ai',
  'api.perplexity.ai',
  'api.hyperbolic.xyz',
  'api.anthropic.com',
]);

/** Error carrying a machine-readable reason, so the UI can react precisely. */
function proxyConfigError(message, code, extra = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, extra);
  return error;
}

function configuredProviderHost() {
  try {
    return new URL(providerDefaults().baseUrl).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isAllowedProviderHost(hostname) {
  const host = hostname.toLowerCase();
  const extraHosts = (process.env.AI_ALLOWED_HOSTS || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return host === configuredProviderHost() || TRUSTED_PROVIDER_HOSTS.has(host) || extraHosts.includes(host);
}

function isPrivateIpv4(hostname) {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

/**
 * The proxy accepts a user-supplied base URL, so refuse obvious internal
 * targets to avoid turning this endpoint into a server-side request relay.
 * Localhost is allowed outside production so local providers can be tested.
 */
function assertAllowedProviderUrl(url) {
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (url.protocol !== 'https:' && !(isLocal && process.env.NODE_ENV !== 'production')) {
    throw new Error('The provider URL must use HTTPS.');
  }
  if (isLocal) {
    return;
  }
  if (BLOCKED_HOSTNAMES.has(url.hostname.toLowerCase()) || isPrivateIpv4(url.hostname)) {
    throw new Error('The provider URL must be a public host.');
  }
  if (!isAllowedProviderHost(url.hostname)) {
    throw proxyConfigError(
      `The AI proxy is not allowed to call ${url.hostname}. Add AI_ALLOWED_HOSTS=${url.hostname.toLowerCase()} to the proxy service environment to permit it.`,
      'host_not_allowed',
      { host: url.hostname.toLowerCase() }
    );
  }
}

function buildChatEndpoint(rawBaseUrl) {
  const trimmed = String(rawBaseUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) {
    throw new Error('Enter the API base URL.');
  }
  const endpoint = new URL(/\/chat\/completions$/i.test(trimmed) ? trimmed : `${trimmed}/chat/completions`);
  assertAllowedProviderUrl(endpoint);
  return endpoint;
}

function upstreamErrorMessage(status, payload) {
  const message = payload?.error?.message || payload?.message;
  if (typeof message === 'string' && message.trim()) {
    return message.trim();
  }
  if (status === 401 || status === 403) {
    return 'The AI provider rejected the API key.';
  }
  if (status === 404) {
    return 'The AI provider could not find that base URL or model.';
  }
  if (status === 429) {
    return 'The AI provider is rate-limiting requests. Try again shortly.';
  }
  return `The AI provider returned an error (${status}).`;
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

/** Origins allowed to call /api from another site (a static deployment). */
function proxyOrigins() {
  return (process.env.AI_PROXY_ORIGINS || '')
    .split(',')
    .map((entry) => entry.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function isSameOriginRequest(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/**
 * CORS for /api, off unless AI_PROXY_ORIGINS is set. This lets a statically
 * hosted frontend use this server as its AI proxy. "*" allows any site to send
 * its own provider key through here; only named origins may use the server key.
 */
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = proxyOrigins();
  if (origin && allowedOrigins.length) {
    const named = allowedOrigins.includes(origin.replace(/\/+$/, ''));
    const allowOrigin = named ? origin : allowedOrigins.includes('*') ? '*' : '';
    if (allowOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowOrigin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
      res.setHeader('Access-Control-Max-Age', '600');
    }
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.get('/api/health', (_req, res) => {
  const { key, baseUrl, model } = providerDefaults();
  res.json({
    ok: true,
    ai: { serverKeyConfigured: Boolean(key), defaultBaseUrl: baseUrl, defaultModel: model },
  });
});

app.post('/api/ai/chat', async (req, res) => {
  const body = req.body ?? {};
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    res.status(400).json({ error: 'A prompt is required.' });
    return;
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    res.status(413).json({ error: `The prompt must be ${MAX_PROMPT_LENGTH} characters or fewer.` });
    return;
  }

  const defaults = providerDefaults();
  const baseUrl = String(body.baseUrl || defaults.baseUrl || '').trim();
  const model = String(body.model || defaults.model || '').trim();
  const clientKey = String(body.apiKey || '').trim();
  const requestedTokens = Number(body.maxTokens);
  const maxTokens = Number.isFinite(requestedTokens)
    ? Math.min(Math.max(Math.trunc(requestedTokens), 1), MAX_TOKENS_LIMIT)
    : 300;

  if (!model) {
    res.status(400).json({ error: 'A model is required.' });
    return;
  }

  let endpoint;
  try {
    endpoint = buildChatEndpoint(baseUrl);
  } catch (error) {
    const payload = { error: error instanceof Error ? error.message : 'Invalid provider URL.' };
    if (error?.code) {
      payload.code = error.code;
      if (error.host) payload.host = error.host;
    }
    res.status(400).json(payload);
    return;
  }

  // Only use the server-side key for the provider it was configured for, so a
  // client-supplied URL can never receive the deployment's secret. Cross-origin
  // callers must also be named in AI_PROXY_ORIGINS ("*" is not enough).
  const namedOrigin = proxyOrigins().includes(String(req.headers.origin || '').replace(/\/+$/, ''));
  const serverKeyApplies =
    Boolean(defaults.key) &&
    endpoint.hostname.toLowerCase() === configuredProviderHost() &&
    (isSameOriginRequest(req) || namedOrigin);
  const apiKey = clientKey || (serverKeyApplies ? defaults.key.trim() : '');

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });

    const text = await upstream.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }

    if (!upstream.ok) {
      res.status(502).json({ error: upstreamErrorMessage(upstream.status, payload) });
      return;
    }

    const rawContent = payload?.choices?.[0]?.message?.content;
    const content = typeof rawContent === 'string'
      ? rawContent.trim()
      : Array.isArray(rawContent)
        ? rawContent.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('').trim()
        : '';

    if (!content) {
      res.status(502).json({ error: 'The AI provider returned an empty response.' });
      return;
    }

    res.json({ content });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      res.status(504).json({ error: 'The AI provider did not respond in time.' });
      return;
    }
    const reason = error instanceof Error ? error.message : 'Unknown error';
    res.status(502).json({ error: `Could not reach the AI provider: ${reason}` });
  }
});

// Any other /api route is a real 404 (never the SPA shell), so the client can
// tell "no proxy on this static host" apart from a successful JSON response.
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

const distDir = path.join(__dirname, 'dist');
app.use((_req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});
app.use(
  express.static(distDir, {
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (filePath.endsWith('sw.js') || filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  })
);
// Single-page-app fallback: only HTML navigations get index.html. Missing files
// (for example /sw.js) still 404 instead of silently returning HTML.
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    next();
    return;
  }
  if (path.extname(req.path)) {
    next();
    return;
  }
  res.sendFile(path.join(distDir, 'index.html'), (error) => {
    if (error) {
      res
        .status(503)
        .type('text/plain')
        .send('The app has not been built yet. Run "npm run build" and restart the server.');
    }
  });
});

app.use((_req, res) => {
  res.status(404).type('text/plain').send('Not found.');
});

app.use((error, _req, res, _next) => {
  if (error?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'The request body must be valid JSON.' });
    return;
  }
  if (error?.type === 'entity.too.large') {
    res.status(413).json({ error: 'The request body is too large.' });
    return;
  }
  res.status(500).json({ error: 'Unexpected server error.' });
});

const server = app.listen(PORT, () => {
  const { key, baseUrl, model } = providerDefaults();
  console.log(`Dhikr Counter server listening on http://localhost:${PORT}`);
  console.log(`AI proxy: ${baseUrl} (model: ${model}) - server key ${key ? 'configured' : 'not configured'}`);
});

// Without this handler a busy port crashes the process with a stack trace.
server.on('error', (error) => {
  if (error?.code === 'EADDRINUSE') {
    console.error(
      `Port ${PORT} is already in use. Stop the process using it, or start with a different port (for example PORT=8788 npm start).`
    );
  } else {
    console.error(`Could not start the server: ${error instanceof Error ? error.message : String(error)}`);
  }
  process.exit(1);
});
