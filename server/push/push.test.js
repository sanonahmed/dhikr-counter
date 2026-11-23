import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import test, { after, before, beforeEach } from 'node:test';
import express from 'express';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';

const require = createRequire(import.meta.url);
const webpush = require('web-push');
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { createPostgresDatabase } from './db.js';
import { registerPushRoutes } from './router.js';
import { createPushRuntime } from './runtime.js';
import { sendPushToAll } from './send.js';
import { createPushStore, loadPushMigrationSql } from './store.js';
import { normalizePushSubscription, validatePushEndpoint } from './validate.js';
import { isValidVapidSubject, loadVapidConfig, validateVapidKeyPair } from './vapid.js';

const quietLogger = { log() {}, warn() {} };
let pglite;
let socketServer;
let databaseUrl;

before(async () => {
  pglite = await PGlite.create();
  socketServer = new PGLiteSocketServer({ db: pglite, port: 0, host: '127.0.0.1', maxConnections: 10 });
  await socketServer.start();
  const address = socketServer.server.address();
  databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${address.port}/postgres`;
});

beforeEach(async () => {
  await pglite.exec(loadPushMigrationSql());
  await pglite.exec('TRUNCATE TABLE push_subscriptions RESTART IDENTITY');
});

after(async () => {
  await socketServer?.stop();
  await pglite?.close();
});

function validSubscription(endpoint = `https://push.example.com/${randomUUID()}`) {
  return { endpoint, keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) }, expirationTime: null };
}

function createDatabase() {
  return createPostgresDatabase({
    connectionString: databaseUrl,
    migrationSql: loadPushMigrationSql(),
    logger: quietLogger,
  });
}

function makeRuntime() {
  const keys = webpush.generateVAPIDKeys();
  return createPushRuntime({
    webpush: { setVapidDetails() {}, async sendNotification() {} },
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      VAPID_PUBLIC_KEY: keys.publicKey,
      VAPID_PRIVATE_KEY: keys.privateKey,
      VAPID_SUBJECT: 'mailto:test@example.com',
    },
    required: true,
    logger: quietLogger,
  });
}

test('push validation rejects unsafe endpoints and malformed subscription keys', () => {
  const subscription = validSubscription();
  assert.equal(validatePushEndpoint(subscription.endpoint), subscription.endpoint);
  assert.equal(validatePushEndpoint('http://push.example.com/send'), null);
  assert.equal(validatePushEndpoint('https://user:pass@push.example.com/send'), null);
  assert.equal(validatePushEndpoint('https://127.0.0.1/send', { allowInsecureLocalhost: false }), null);
  assert.equal(validatePushEndpoint('https://metadata.google.internal/latest'), null);
  assert.equal(normalizePushSubscription({ ...subscription, keys: { ...subscription.keys, p256dh: 'bad' } }), null);
  assert.deepEqual(normalizePushSubscription({ ...subscription, extra: 'ignored' }), subscription);
});

test('VAPID validation checks keypair, subject, and required configuration', () => {
  const keys = webpush.generateVAPIDKeys();
  assert.deepEqual(validateVapidKeyPair(keys.publicKey, keys.privateKey), { ok: true, reason: '' });
  assert.equal(validateVapidKeyPair(keys.publicKey, webpush.generateVAPIDKeys().privateKey).ok, false);
  assert.equal(isValidVapidSubject('mailto:admin@example.com'), true);
  assert.equal(isValidVapidSubject('http://admin.example.com'), false);
  const config = loadVapidConfig({
    VAPID_PUBLIC_KEY: keys.publicKey,
    VAPID_PRIVATE_KEY: keys.privateKey,
    VAPID_SUBJECT: 'mailto:test@example.com',
  });
  assert.equal(config.enabled, true);
  assert.throws(() => createPushRuntime({ webpush: {}, env: {}, required: true }), { code: 'push_config_invalid' });
});

test('PostgreSQL store upserts idempotently, scopes owners, and requires key proof for deletion', async () => {
  const database = createDatabase();
  const store = createPushStore({ database, logger: quietLogger });
  const otherOwner = createPushStore({ database, ownerId: 'another-owner', logger: quietLogger });
  try {
    const subscription = validSubscription();
    assert.ok(await store.upsert(subscription));
    assert.ok(await store.upsert({ ...subscription, expirationTime: 123 }));
    assert.equal(await store.count(), 1);
    assert.equal((await store.find(subscription.endpoint)).expirationTime, 123);
    assert.equal(await otherOwner.count(), 0);
    assert.equal(await otherOwner.upsert(subscription), null);
    assert.equal(await otherOwner.remove(subscription.endpoint, subscription.keys), false);
    assert.equal(
      await store.remove(subscription.endpoint, { p256dh: 'B'.repeat(86) + 'C', auth: subscription.keys.auth }),
      false
    );
    assert.equal(await store.remove(subscription.endpoint, subscription.keys), true);
    assert.equal(await store.count(), 0);

    const batch = [validSubscription(), validSubscription()];
    for (const item of batch) await store.upsert(item);
    assert.equal(await store.removeMany([batch[0].endpoint, batch[0].endpoint, '']), 1);
    assert.equal((await store.list()).length, 1);
  } finally {
    await database.close();
  }
});

test('runtime reports PostgreSQL readiness and broadcasts to registered devices', async () => {
  const runtime = makeRuntime();
  try {
    const status = await runtime.prepare();
    assert.equal(status.connected, true);
    assert.equal(status.kind, 'postgres');
    await runtime.store.upsert(validSubscription());
    assert.deepEqual(await runtime.broadcast({ title: 'Reminder', body: 'Remember Allah' }), {
      total: 1, sent: 1, failed: 0, removed: 0,
    });
    assert.equal((await runtime.status()).subscribers, 1);
  } finally {
    await runtime.close();
  }
});

test('delivery prunes expired endpoints and normalizes unsafe notification URLs', async () => {
  const database = createDatabase();
  const store = createPushStore({ database, logger: quietLogger });
  const expired = validSubscription();
  const live = validSubscription();
  await store.upsert(expired);
  await store.upsert(live);
  try {
    const result = await sendPushToAll({
      store,
      notification: { title: 'Reminder', body: 'Message', url: '//unsafe.example' },
      logger: quietLogger,
      async sendNotification(subscription, payload, options) {
        assert.equal(JSON.parse(payload).url, '/');
        assert.equal(options.TTL, 3600);
        if (subscription.endpoint === expired.endpoint) throw Object.assign(new Error('gone'), { statusCode: 410 });
      },
    });
    assert.deepEqual(result, { total: 2, sent: 1, failed: 1, removed: 1 });
    assert.equal(await store.find(expired.endpoint), null);
    assert.ok(await store.find(live.endpoint));
  } finally {
    await database.close();
  }
});

test('push router validates registration, reports status, and requires subscription keys to unsubscribe', async () => {
  const runtime = makeRuntime();
  const app = express();
  app.use(express.json());
  registerPushRoutes(app, { runtime, requireAdmin: (_req, _res, next) => next(), logger: quietLogger });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const config = await fetch(`${base}/api/push/config`).then((response) => response.json());
    assert.equal(config.enabled, true);
    const subscription = validSubscription();
    const register = (value) => fetch(`${base}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: value }),
    });
    assert.equal((await register({ ...subscription, endpoint: 'http://push.example.com/x' })).status, 400);
    assert.equal((await register(subscription)).status, 200);
    assert.equal((await register(subscription)).status, 200);
    const adminStatus = await fetch(`${base}/api/admin/push`).then((response) => response.json());
    assert.equal(adminStatus.subscribers, 1);
    assert.equal((await fetch(`${base}/api/push/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    })).status, 400);
    const wrongKeys = await fetch(`${base}/api/push/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint, keys: { ...subscription.keys, p256dh: 'B'.repeat(86) + 'C' } }),
    }).then((response) => response.json());
    assert.equal(wrongKeys.removed, false);
    const removed = await fetch(`${base}/api/push/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint, keys: subscription.keys }),
    }).then((response) => response.json());
    assert.equal(removed.removed, true);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await runtime.close();
  }
});
