/**
 * Dhikr Counter server.
 *
 * Serves the built PWA from ./dist and relays AI requests to an
 * OpenAI-compatible provider. Relaying server-side avoids browser CORS
 * restrictions and keeps provider keys out of the static bundle.
 *
 * Run with: npm start   (after npm run build)
 */
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const webpush = require('web-push');
import { createPushRuntime } from './server/push/runtime.js';
import { registerPushRoutes } from './server/push/router.js';

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
      const push = pushRuntime.reload();
      console.log(`[ai-proxy] reloaded ${filename} (AI_ALLOWED_HOSTS / AI_PROXY_ORIGINS / push config updated: ${push.storeKind}).`);
    });
  } catch {
    // A missing directory or an unsupported watcher should never break startup.
  }
}

const PORT = Number(process.env.PORT) || 8787;
const PROVIDER_TIMEOUT_MS = 60_000;
const MAX_PROMPT_LENGTH = 4_000;
const AI_TALK_WINDOW_MS = 10 * 60_000;
const AI_TALK_REQUESTS_PER_WINDOW = 8;
const AI_TALK_MAX_MESSAGES = 12;
const AI_TALK_MAX_MESSAGE_LENGTH = 1_200;
const MAX_TOKENS_LIMIT = 2_000;
/** Client IP -> request timestamps for the public AI Talk endpoint. */
const aiTalkRequests = new Map();

/**
 * Private admin panel.
 *
 * The AI studio is not a public feature. It lives behind a passcode that only
 * the owner knows, verified here on the server. Sessions are opaque bearer
 * tokens kept in memory, so a restart signs everyone out and nothing sensitive
 * is ever written to disk. ADMIN_PASSCODE must be set; when it is empty the
 * panel stays locked and /api/ai/chat refuses every request.
 */
const ADMIN_SESSION_DEFAULT_HOURS = 12;
const ADMIN_SESSION_MAX_HOURS = 168;
const ADMIN_MAX_FAILED_ATTEMPTS = 5;
const ADMIN_FAILURE_WINDOW_MS = 15 * 60_000;

function adminPasscode() {
  return (process.env.ADMIN_PASSCODE || '').trim();
}

function adminSessionTtlMs() {
  const hours = Number(process.env.ADMIN_SESSION_HOURS);
  const safeHours = Number.isFinite(hours) && hours > 0
    ? Math.min(hours, ADMIN_SESSION_MAX_HOURS)
    : ADMIN_SESSION_DEFAULT_HOURS;
  return Math.round(safeHours * 60 * 60 * 1000);
}

/** token -> expiry timestamp (ms). In-memory, intentionally not persisted. */
const adminSessions = new Map();
/** client IP -> { count, firstAt } for failed sign-ins. */
const adminLoginFailures = new Map();

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest();
}

/** Length-independent comparison so a wrong passcode leaks no timing signal. */
function safeEqual(a, b) {
  return crypto.timingSafeEqual(sha256(a), sha256(b));
}

function bearerToken(req) {
  const match = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || ''));
  return match ? match[1] : '';
}

function purgeExpiredAdminSessions() {
  const now = Date.now();
  for (const [token, expiresAt] of adminSessions) {
    if (expiresAt <= now) adminSessions.delete(token);
  }
}

function adminSessionFrom(req) {
  const token = bearerToken(req);
  if (!token) return null;
  const expiresAt = adminSessions.get(token);
  if (!expiresAt) return null;
  if (expiresAt <= Date.now()) {
    adminSessions.delete(token);
    return null;
  }
  return { token, expiresAt };
}

/** Gate for anything that must never be reachable by the public app. */
function requireAdmin(req, res, next) {
  if (!adminPasscode()) {
    res.status(503).json({
      error: 'Admin access is disabled. Set ADMIN_PASSCODE on the app server and restart it.',
      code: 'admin_disabled',
    });
    return;
  }
  const session = adminSessionFrom(req);
  if (!session) {
    res.status(401).json({
      error: 'Your admin session has ended. Unlock the admin panel again.',
      code: 'admin_required',
    });
    return;
  }
  req.adminSession = session;
  next();
}

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

/* -------------------------------------------------------------------------
 * Web Push runtime.
 *
 * VAPID keys are environment-only and never generated at boot. PostgreSQL is
 * the only subscription store; there is no process memory or filesystem
 * fallback. Production requires DATABASE_URL + all VAPID settings.
 * ---------------------------------------------------------------------- */
const pushRuntime = createPushRuntime({
  webpush,
  env: process.env,
  required: process.env.NODE_ENV === 'production' || process.env.RENDER === 'true',
});
void pushRuntime.prepare();

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
// One proxy hop in front of the app (Render, Cloud Run) so req.ip and the
// admin login rate limit see the real client address.
app.set('trust proxy', 1);
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
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
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
    admin: { enabled: Boolean(adminPasscode()) },
    ai: { serverKeyConfigured: Boolean(key), defaultBaseUrl: baseUrl, defaultModel: model },
  });
});

/**
 * Admin sign-in. Returns an opaque bearer token; the client keeps it in
 * sessionStorage. Failed attempts are rate-limited per client IP.
 */
app.post('/api/admin/login', (req, res) => {
  const passcode = adminPasscode();
  if (!passcode) {
    res.status(503).json({
      error: 'Admin access is disabled. Set ADMIN_PASSCODE on the app server and restart it.',
      code: 'admin_disabled',
    });
    return;
  }

  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const failure = adminLoginFailures.get(ip);
  if (failure && now - failure.firstAt < ADMIN_FAILURE_WINDOW_MS) {
    if (failure.count >= ADMIN_MAX_FAILED_ATTEMPTS) {
      const retryAfterSeconds = Math.ceil((ADMIN_FAILURE_WINDOW_MS - (now - failure.firstAt)) / 1000);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        error: `Too many failed attempts. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`,
        code: 'admin_locked_out',
      });
      return;
    }
  } else if (failure) {
    adminLoginFailures.delete(ip);
  }

  const supplied = typeof req.body?.passcode === 'string' ? req.body.passcode.slice(0, 256) : '';
  if (!supplied || !safeEqual(supplied, passcode)) {
    const current = adminLoginFailures.get(ip);
    adminLoginFailures.set(
      ip,
      current && now - current.firstAt < ADMIN_FAILURE_WINDOW_MS
        ? { count: current.count + 1, firstAt: current.firstAt }
        : { count: 1, firstAt: now }
    );
    res.status(401).json({ error: 'Incorrect admin passcode.', code: 'admin_bad_passcode' });
    return;
  }

  adminLoginFailures.delete(ip);
  purgeExpiredAdminSessions();
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = now + adminSessionTtlMs();
  adminSessions.set(token, expiresAt);
  res.json({ token, expiresAt });
});

app.get('/api/admin/session', (req, res) => {
  const session = adminSessionFrom(req);
  res.json({
    enabled: Boolean(adminPasscode()),
    authenticated: Boolean(session),
    expiresAt: session?.expiresAt,
  });
});

app.post('/api/admin/logout', (req, res) => {
  const token = bearerToken(req);
  if (token) adminSessions.delete(token);
  res.json({ ok: true });
});

// Web Push HTTP API: /api/push/* and /api/admin/push. Validation, rate limits,
// PostgreSQL persistence, and expiry pruning live in server/push/.
registerPushRoutes(app, { runtime: pushRuntime, requireAdmin });

// The AI relay is private: the server-side key must never be reachable from a
// public page, so a valid admin session is required before any provider call.
app.post('/api/ai/chat', requireAdmin, async (req, res) => {
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

/**
 * Public AI Talk endpoint. Unlike the admin-only AI studio, this route accepts
 * no provider URL/key/model from the browser and only uses server defaults.
 * Per-IP limits and strict message bounds prevent accidental runaway usage.
 */
app.post('/api/ai/talk', async (req, res) => {
  const body = req.body ?? {};
  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > AI_TALK_MAX_MESSAGES) {
    res.status(400).json({ error: `Send between 1 and ${AI_TALK_MAX_MESSAGES} messages.`, code: 'invalid_messages' });
    return;
  }

  const cleanMessages = [];
  for (const message of messages) {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string') {
      res.status(400).json({ error: 'Messages must have a user or assistant role and text content.', code: 'invalid_messages' });
      return;
    }
    const content = message.content.trim();
    if (!content || content.length > AI_TALK_MAX_MESSAGE_LENGTH) {
      res.status(400).json({ error: `Each message must contain 1–${AI_TALK_MAX_MESSAGE_LENGTH} characters.`, code: 'invalid_messages' });
      return;
    }
    cleanMessages.push({ role: message.role, content });
  }
  if (cleanMessages.at(-1)?.role !== 'user') {
    res.status(400).json({ error: 'The latest message must be from the user.', code: 'invalid_messages' });
    return;
  }

  const { key, baseUrl, model } = providerDefaults();
  if (!key || !model) {
    res.status(503).json({
      error: 'AI Talk is not configured. The site owner must set an AI provider key and model on the Node server.',
      code: 'config_missing',
    });
    return;
  }

  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const recent = (aiTalkRequests.get(ip) || []).filter((timestamp) => now - timestamp < AI_TALK_WINDOW_MS);
  if (recent.length >= AI_TALK_REQUESTS_PER_WINDOW) {
    const retryAfterSeconds = Math.max(1, Math.ceil((AI_TALK_WINDOW_MS - (now - recent[0])) / 1000));
    res.setHeader('Retry-After', String(retryAfterSeconds));
    res.status(429).json({ error: 'AI Talk is temporarily rate-limited. Please try again shortly.', code: 'rate_limited' });
    return;
  }
  if (!aiTalkRequests.has(ip) && aiTalkRequests.size >= 10_000) {
    aiTalkRequests.delete(aiTalkRequests.keys().next().value);
  }
  recent.push(now);
  aiTalkRequests.set(ip, recent);

  let endpoint;
  try {
    endpoint = buildChatEndpoint(baseUrl);
  } catch {
    res.status(503).json({ error: 'AI Talk is temporarily unavailable because the provider configuration is invalid.', code: 'provider_unavailable' });
    return;
  }

  const replyLanguage = body.language === 'bn' ? 'Bangla (বাংলা)' : 'English';
  const systemPrompt = [
    'You are a warm, respectful, non-judgmental Muslim prayer and dhikr companion. Help users reflect and build gentle, sustainable worship habits.',
    `Reply in ${replyLanguage}. If the user writes in Bangla, understand it naturally; when Bangla is requested, answer in clear, conversational Bangla script.`,
    'Do not invent Quran verses, hadith, citations, religious rulings, or specific promised rewards. If unsure, say so. For fiqh or personal religious rulings, recommend a trusted qualified scholar rather than presenting yourself as an authority.',
    'Offer compassionate listening. Do not shame the user. For urgent danger or serious mental-health concerns, encourage contacting a trusted person and appropriate local professional/emergency support.',
    'Keep replies clear, kind, and reasonably concise. Do not claim to be human or a scholar.',
  ].join(' ');

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        max_tokens: 900,
        messages: [{ role: 'system', content: systemPrompt }, ...cleanMessages],
      }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    const text = await upstream.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
    if (!upstream.ok) {
      res.status(502).json({ error: upstreamErrorMessage(upstream.status, payload), code: 'provider_error' });
      return;
    }
    const rawContent = payload?.choices?.[0]?.message?.content;
    const content = typeof rawContent === 'string'
      ? rawContent.trim()
      : Array.isArray(rawContent)
        ? rawContent.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('').trim()
        : '';
    if (!content) {
      res.status(502).json({ error: 'The AI provider returned an empty response.', code: 'provider_error' });
      return;
    }
    res.json({ content });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      res.status(504).json({ error: 'The AI provider did not respond in time.', code: 'provider_timeout' });
      return;
    }
    res.status(502).json({ error: 'Could not connect to the configured AI provider.', code: 'provider_unavailable' });
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
  console.log(
    `Admin panel: ${adminPasscode() ? `enabled (${Math.round(adminSessionTtlMs() / 3_600_000)}h sessions)` : 'disabled - set ADMIN_PASSCODE to enable it'}`
  );
  const pushVapid = pushRuntime.vapid;
  const pushStoreKind = pushRuntime.store.kind;
  console.log(
    `Web push: VAPID ${pushVapid.enabled ? 'configured (stable)' : `disabled - ${pushVapid.reason}`}; ` +
      `store ${pushStoreKind === 'postgres' ? 'PostgreSQL (DATABASE_URL)' : 'not configured - set DATABASE_URL'}`
  );
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
