import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const require = createRequire(import.meta.url);
const webpush = require('web-push');

const providerPort = 5099;
const appPort = 8790;

let lastProviderBody = null;
const provider = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {};
    lastProviderBody = body;
    res.setHeader('Content-Type', 'application/json');
    if (req.headers.authorization !== 'Bearer test-key') {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: { message: 'Bad key' } }));
      return;
    }
    res.end(JSON.stringify({
      choices: [{ message: { content: `Mock reply for model ${body.model}` } }],
    }));
  });
});

await new Promise((resolve) => provider.listen(providerPort, resolve));

// The push runtime uses the real pg adapter, so the test needs a PostgreSQL
// server. PGlite speaks the PostgreSQL wire protocol through this socket and
// keeps everything in memory; the server applies migrations/001 on first use.
const testDatabase = await PGlite.create();
const databaseServer = new PGLiteSocketServer({
  db: testDatabase,
  port: 0,
  host: '127.0.0.1',
  maxConnections: 10,
});
try {
  await databaseServer.start();
} catch (error) {
  await testDatabase.close().catch(() => {});
  throw error;
}
const databaseAddress = databaseServer.server?.address?.();
if (!databaseAddress?.port) {
  await databaseServer.stop().catch(() => {});
  await testDatabase.close().catch(() => {});
  throw new Error('The test PostgreSQL server did not report a port.');
}
const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${databaseAddress.port}/postgres`;
const vapidKeys = webpush.generateVAPIDKeys();

const child = spawn(process.execPath, ['server.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(appPort),
    NODE_ENV: 'development',
    DATABASE_URL: databaseUrl,
    VAPID_PUBLIC_KEY: vapidKeys.publicKey,
    VAPID_PRIVATE_KEY: vapidKeys.privateKey,
    VAPID_SUBJECT: 'mailto:test@example.com',
    AI_API_KEY: 'test-key',
    AI_BASE_URL: `http://127.0.0.1:${providerPort}/v1`,
    AI_MODEL: 'mock-model',
    AI_ALLOWED_HOSTS: 'api.allowed.example',
    AI_PROXY_ORIGINS: 'https://frontend.example',
    // The AI relay is private, so the test signs in like the admin panel does.
    ADMIN_PASSCODE: 'test-passcode',
    ADMIN_SESSION_HOURS: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
child.stdout.on('data', (d) => { logs += d.toString(); });
child.stderr.on('data', (d) => { logs += d.toString(); });

const base = `http://127.0.0.1:${appPort}`;
async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server did not start\n${logs}`);
}

let adminToken = '';
/** Auth header the admin panel sends; empty until the login checks run. */
function adminHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
    ...extra,
  };
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` :: ${detail}` : ''}`);
}

try {
  await waitForServer();

  const pushConfigResponse = await fetch(`${base}/api/push/config`);
  const pushConfig = await pushConfigResponse.json();
  check(
    'public push config exposes the VAPID public key',
    pushConfigResponse.ok && pushConfig.enabled === true && typeof pushConfig.publicKey === 'string' && pushConfig.publicKey.length > 20
  );

  const health = await fetch(`${base}/api/health`).then((r) => r.json());
  check('health reports server key', health.ok === true && health.ai.serverKeyConfigured === true, JSON.stringify(health.ai));
  check('health reports admin enabled', health.admin?.enabled === true, JSON.stringify(health.admin));

  const anonymous = await fetch(`${base}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'Hi' }),
  });
  const anonymousData = await anonymous.json();
  check(
    'AI proxy refuses requests without an admin session',
    anonymous.status === 401 && anonymousData.code === 'admin_required',
    `${anonymous.status} ${JSON.stringify(anonymousData)}`
  );

  const wrongPasscode = await fetch(`${base}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode: 'not-the-passcode' }),
  });
  check('admin login rejects a wrong passcode', wrongPasscode.status === 401, `${wrongPasscode.status}`);

  const login = await fetch(`${base}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode: 'test-passcode' }),
  });
  const loginData = await login.json();
  adminToken = typeof loginData.token === 'string' ? loginData.token : '';
  check(
    'admin login issues a session token',
    login.status === 200 && adminToken.length >= 32 && loginData.expiresAt > Date.now(),
    `${login.status} ${JSON.stringify({ ...loginData, token: adminToken ? '***' : '' })}`
  );

  const sessionInfo = await fetch(`${base}/api/admin/session`, {
    headers: adminHeaders(),
  }).then((r) => r.json());
  check('admin session is recognised', sessionInfo.enabled === true && sessionInfo.authenticated === true, JSON.stringify(sessionInfo));

  const pushStatus = await fetch(`${base}/api/admin/push`, { headers: adminHeaders() }).then((r) => r.json());
  check(
    'push status reports a connected PostgreSQL store',
    pushStatus.subscribers === 0 && pushStatus.enabled === true && pushStatus.store?.kind === 'postgres' && pushStatus.store?.connected === true,
    JSON.stringify(pushStatus)
  );

  const fakeSubscription = {
    endpoint: 'https://push.example.com/send/abc123',
    keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) },
  };
  const subscribe = await fetch(`${base}/api/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: fakeSubscription }),
  });
  check('a device can register a push subscription', subscribe.status === 200, `${subscribe.status}`);

  const resubscribe = await fetch(`${base}/api/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: fakeSubscription }),
  });
  const pushStatusAfter = await fetch(`${base}/api/admin/push`, { headers: adminHeaders() }).then((r) => r.json());
  check(
    're-registering the same endpoint is idempotent',
    resubscribe.status === 200 && pushStatusAfter.subscribers === 1,
    `${resubscribe.status} ${JSON.stringify(pushStatusAfter)}`
  );

  const invalidKeysSubscription = await fetch(`${base}/api/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: { ...fakeSubscription, endpoint: 'https://push.example.com/send/invalid', keys: { p256dh: 'abc', auth: 'A'.repeat(22) } } }),
  });
  check('subscriptions with malformed keys are rejected', invalidKeysSubscription.status === 400, `${invalidKeysSubscription.status}`);

  const insecureSubscription = await fetch(`${base}/api/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: { ...fakeSubscription, endpoint: 'http://push.example.com/x' } }),
  });
  check('non-HTTPS push subscriptions are rejected', insecureSubscription.status === 400, `${insecureSubscription.status}`);

  const anonymousBroadcast = await fetch(`${base}/api/admin/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Hi', body: 'There' }),
  });
  check('broadcasting requires an admin session', anonymousBroadcast.status === 401, `${anonymousBroadcast.status}`);

  const emptyBroadcast = await fetch(`${base}/api/admin/push`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ title: '', body: 'There' }),
  });
  check('broadcasting requires a title and message', emptyBroadcast.status === 400, `${emptyBroadcast.status}`);

  const endpointOnlyUnsubscribe = await fetch(`${base}/api/push/unsubscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: fakeSubscription.endpoint }),
  });
  check('unsubscribe requires proof of key ownership', endpointOnlyUnsubscribe.status === 400, `${endpointOnlyUnsubscribe.status}`);

  const wrongKeysUnsubscribe = await fetch(`${base}/api/push/unsubscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: fakeSubscription.endpoint, keys: { p256dh: 'B'.repeat(86) + 'C', auth: 'A'.repeat(22) } }),
  });
  const wrongKeysData = await wrongKeysUnsubscribe.json();
  const pushStatusAfterWrongKeys = await fetch(`${base}/api/admin/push`, { headers: adminHeaders() }).then((r) => r.json());
  check(
    'unsubscribe with wrong keys leaves the device registered',
    wrongKeysUnsubscribe.status === 200 && wrongKeysData.removed === false && pushStatusAfterWrongKeys.subscribers === 1,
    `${wrongKeysUnsubscribe.status} ${JSON.stringify(wrongKeysData)}`
  );

  const unsubscribe = await fetch(`${base}/api/push/unsubscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: fakeSubscription.endpoint, keys: fakeSubscription.keys }),
  });
  const unsubscribeData = await unsubscribe.json();
  const pushStatusAfterRemoval = await fetch(`${base}/api/admin/push`, { headers: adminHeaders() }).then((r) => r.json());
  check(
    'a device can unregister with its subscription keys',
    unsubscribe.status === 200 && unsubscribeData.removed === true && pushStatusAfterRemoval.subscribers === 0,
    `${unsubscribe.status} ${JSON.stringify(pushStatusAfterRemoval)}`
  );

  const noDevicesBroadcast = await fetch(`${base}/api/admin/push`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ title: 'Test', body: 'No devices yet' }),
  });
  const noDevicesData = await noDevicesBroadcast.json();
  check(
    'broadcasting with no registered devices succeeds with zero totals',
    noDevicesBroadcast.status === 200 && noDevicesData.total === 0 && noDevicesData.sent === 0,
    `${noDevicesBroadcast.status} ${JSON.stringify(noDevicesData)}`
  );

  const corsPreflight = await fetch(`${base}/api/ai/chat`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://frontend.example', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,authorization' },
  });
  const allowedHeaders = (corsPreflight.headers.get('access-control-allow-headers') || '').toLowerCase();
  check(
    'allowed static origin gets CORS preflight (incl. Authorization)',
    corsPreflight.status === 204 &&
      corsPreflight.headers.get('access-control-allow-origin') === 'https://frontend.example' &&
      allowedHeaders.includes('authorization')
  );

  const unlistedPreflight = await fetch(`${base}/api/ai/chat`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://unlisted.example', 'Access-Control-Request-Method': 'POST' },
  });
  check('unlisted origin is not granted CORS', unlistedPreflight.status === 204 && !unlistedPreflight.headers.has('access-control-allow-origin'));

  const crossOriginProxied = await fetch(`${base}/api/ai/chat`, {
    method: 'POST',
    headers: adminHeaders({ Origin: 'https://frontend.example' }),
    body: JSON.stringify({ prompt: 'Hi' }),
  });
  const crossOriginData = await crossOriginProxied.json();
  check('named static origin can use proxy + server key', crossOriginProxied.headers.get('access-control-allow-origin') === 'https://frontend.example' && crossOriginData.content === 'Mock reply for model mock-model');

  const defaultsOnly = await fetch(`${base}/api/ai/chat`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ prompt: 'Hi' }),
  }).then((r) => r.json());
  check('server defaults + server key used', defaultsOnly.content === 'Mock reply for model mock-model', JSON.stringify(defaultsOnly));

  const proxied = await fetch(`${base}/api/ai/chat`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ baseUrl: `http://127.0.0.1:${providerPort}/v1`, apiKey: 'test-key', model: 'mock-model', prompt: 'Hi', maxTokens: 20 }),
  }).then((r) => r.json());
  check('proxy completion', proxied.content === 'Mock reply for model mock-model', JSON.stringify(proxied));

  const publicTalk = await fetch(`${base}/api/ai/talk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language: 'bn', messages: [
      { role: 'user', content: 'নামাজের পর কী পড়ব?' },
      { role: 'assistant', content: 'আপনি নির্ভরযোগ্য যিকির দিয়ে শুরু করতে পারেন।' },
      { role: 'user', content: 'বাংলায় সহজ করে বলুন।' },
    ] }),
  });
  const publicTalkData = await publicTalk.json();
  check(
    'public AI Talk works without an admin session and uses configured provider',
    publicTalk.status === 200 && publicTalkData.content === 'Mock reply for model mock-model' &&
      lastProviderBody?.messages?.length === 4 && lastProviderBody?.messages?.[0]?.role === 'system' &&
      /Bangla/.test(lastProviderBody?.messages?.[0]?.content || '') &&
      lastProviderBody?.messages?.[3]?.content === 'বাংলায় সহজ করে বলুন।',
    `${publicTalk.status} ${JSON.stringify(publicTalkData)}`
  );

  const tooManyTalkMessages = await fetch(`${base}/api/ai/talk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: Array.from({ length: 13 }, () => ({ role: 'user', content: 'Hi' })) }),
  });
  check('AI Talk rejects oversized conversation history', tooManyTalkMessages.status === 400, `${tooManyTalkMessages.status}`);

  const badKey = await fetch(`${base}/api/ai/chat`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ baseUrl: `http://127.0.0.1:${providerPort}/v1`, apiKey: 'wrong', model: 'mock-model', prompt: 'Hi' }),
  });
  check('upstream auth error surfaced', badKey.status === 502, `${badKey.status} ${(await badKey.json()).error}`);

  const nonHttps = await fetch(`${base}/api/ai/chat`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ baseUrl: 'http://example.com/v1', apiKey: 'k', model: 'm', prompt: 'Hi' }),
  });
  check('non-https rejected', nonHttps.status === 400, `${nonHttps.status} ${(await nonHttps.json()).error}`);

  const blockedHost = await fetch(`${base}/api/ai/chat`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ baseUrl: 'https://api.custom-llm.example/v1', apiKey: 'k', model: 'm', prompt: 'Hi' }),
  });
  const blockedData = await blockedHost.json();
  check(
    'unlisted custom host is refused with its host name',
    blockedHost.status === 400 && blockedData.code === 'host_not_allowed' && blockedData.host === 'api.custom-llm.example' && /AI_ALLOWED_HOSTS/.test(blockedData.error),
    `${blockedHost.status} ${JSON.stringify(blockedData)}`
  );

  // An allowlisted host clears the guard and only then fails at the network
  // layer, which proves AI_ALLOWED_HOSTS is what admits a custom provider.
  const allowlistedHost = await fetch(`${base}/api/ai/chat`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ baseUrl: 'https://api.allowed.example/v1', apiKey: 'k', model: 'm', prompt: 'Hi' }),
  });
  const allowlistedData = await allowlistedHost.json();
  check(
    'AI_ALLOWED_HOSTS admits a custom host',
    allowlistedHost.status === 502 && /Could not reach the AI provider/.test(allowlistedData.error),
    `${allowlistedHost.status} ${JSON.stringify(allowlistedData)}`
  );

  const emptyPrompt = await fetch(`${base}/api/ai/chat`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ baseUrl: 'https://api.openai.com/v1', model: 'm' }),
  });
  check('empty prompt rejected', emptyPrompt.status === 400, `${emptyPrompt.status} ${(await emptyPrompt.json()).error}`);

  // Locking out is per client IP, so it runs after every authenticated check.
  let talkLimited;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    talkLimited = await fetch(`${base}/api/ai/talk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: `Rate limit check ${attempt}` }] }),
    });
    if (talkLimited.status === 429) break;
  }
  const talkLimitData = await talkLimited.json();
  check(
    'public AI Talk requests are rate-limited per IP',
    talkLimited.status === 429 && talkLimitData.code === 'rate_limited' && talkLimited.headers.has('retry-after'),
    `${talkLimited.status} ${JSON.stringify(talkLimitData)}`
  );

  const logout = await fetch(`${base}/api/admin/logout`, {
    method: 'POST',
    headers: adminHeaders(),
  });
  const afterLogout = await fetch(`${base}/api/ai/chat`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ prompt: 'Hi' }),
  });
  check(
    'logout invalidates the session',
    logout.status === 200 && afterLogout.status === 401,
    `${logout.status} then ${afterLogout.status}`
  );

  let limited;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    limited = await fetch(`${base}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode: 'still-wrong' }),
    });
    if (limited.status === 429) break;
  }
  const limitedData = await limited.json();
  check(
    'repeated wrong passcodes are rate-limited',
    limited.status === 429 && limitedData.code === 'admin_locked_out' && limited.headers.has('retry-after'),
    `${limited.status} ${JSON.stringify(limitedData)}`
  );

  const unknownApi = await fetch(`${base}/api/unknown`);
  check('unknown API is JSON 404', unknownApi.status === 404 && (unknownApi.headers.get('content-type') || '').includes('json'));

  const spa = await fetch(`${base}/some/deep/route`);
  const spaText = await spa.text();
  check('SPA fallback serves index.html', spa.status === 200 && spaText.includes('<div id="root">'));

  const notFound = await fetch(`${base}/api/ai/other`);
  check('AI route guard', notFound.status === 404);

  const missingAsset = await fetch(`${base}/assets/missing-chunk.js`);
  const missingText = await missingAsset.text();
  check('missing asset is 404, not HTML', missingAsset.status === 404 && !missingText.includes('<div id="root">'), String(missingAsset.status));
} finally {
  child.kill();
  provider.close();
  await databaseServer.stop().catch(() => {});
  await testDatabase.close().catch(() => {});
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
