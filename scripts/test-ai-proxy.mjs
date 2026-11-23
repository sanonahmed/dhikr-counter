import http from 'node:http';
import { spawn } from 'node:child_process';

const providerPort = 5099;
const appPort = 8790;

const provider = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {};
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

const child = spawn(process.execPath, ['server.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(appPort),
    NODE_ENV: 'development',
    AI_API_KEY: 'test-key',
    AI_BASE_URL: `http://127.0.0.1:${providerPort}/v1`,
    AI_MODEL: 'mock-model',
    AI_ALLOWED_HOSTS: '',
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

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` :: ${detail}` : ''}`);
}

try {
  await waitForServer();

  const health = await fetch(`${base}/api/health`).then((r) => r.json());
  check('health reports server key', health.ok === true && health.ai.serverKeyConfigured === true, JSON.stringify(health.ai));

  const defaultsOnly = await fetch(`${base}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'Hi' }),
  }).then((r) => r.json());
  check('server defaults + server key used', defaultsOnly.content === 'Mock reply for model mock-model', JSON.stringify(defaultsOnly));

  const proxied = await fetch(`${base}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl: `http://127.0.0.1:${providerPort}/v1`, apiKey: 'test-key', model: 'mock-model', prompt: 'Hi', maxTokens: 20 }),
  }).then((r) => r.json());
  check('proxy completion', proxied.content === 'Mock reply for model mock-model', JSON.stringify(proxied));

  const badKey = await fetch(`${base}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl: `http://127.0.0.1:${providerPort}/v1`, apiKey: 'wrong', model: 'mock-model', prompt: 'Hi' }),
  });
  check('upstream auth error surfaced', badKey.status === 502, `${badKey.status} ${(await badKey.json()).error}`);

  const nonHttps = await fetch(`${base}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl: 'http://example.com/v1', apiKey: 'k', model: 'm', prompt: 'Hi' }),
  });
  check('non-https rejected', nonHttps.status === 400, `${nonHttps.status} ${(await nonHttps.json()).error}`);

  const emptyPrompt = await fetch(`${base}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl: 'https://api.openai.com/v1', model: 'm' }),
  });
  check('empty prompt rejected', emptyPrompt.status === 400, `${emptyPrompt.status} ${(await emptyPrompt.json()).error}`);

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
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
