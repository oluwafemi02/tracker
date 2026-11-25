// End-to-end test of the worker routes and cron with an in-memory KV and a fake push service.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import ece from 'http_ece';
import worker, { runDue } from '../src/index.js';
import { generateVapidKeys, b64url } from '../src/webpush.js';

const kv = new Map();
const DEVICES = {
  async get(k, type) { const v = kv.get(k); return v == null ? null : type === 'json' ? JSON.parse(v) : v; },
  async put(k, v) { kv.set(k, v); },
  async delete(k) { kv.delete(k); },
  async list({ prefix }) { return { keys: [...kv.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }; },
};
const keys = await generateVapidKeys();
const env = { DEVICES, VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_JWK: JSON.stringify(keys.privateJwk), VAPID_SUBJECT: 'mailto:t@example.com' };

// Fake browser subscription and push service
const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
const auth = crypto.randomBytes(16);
const subscription = { endpoint: 'https://web.push.apple.com/fake', keys: { p256dh: b64url(ua.getPublicKey()), auth: b64url(auth) } };
const delivered = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://web.push.apple.com/')) {
    assert.match(init.headers.Authorization, /^vapid t=.+, k=/);
    const plain = ece.decrypt(Buffer.from(init.body), { version: 'aes128gcm', privateKey: ua, authSecret: auth });
    delivered.push(JSON.parse(plain.toString()));
    return new Response('', { status: 201 });
  }
  return realFetch(url, init);
};

const call = (method, path, body, secret) => worker.fetch(new Request('https://w.example' + path, {
  method, headers: { 'Content-Type': 'application/json', ...(secret ? { Authorization: `Bearer ${secret}` } : {}) },
  body: body ? JSON.stringify(body) : undefined,
}), env);

const deviceId = 'abcdef0123456789abcdef01';
const secret = 'f'.repeat(48);

let r = await call('GET', '/vapid');
assert.equal((await r.json()).publicKey, keys.publicKey);

r = await call('POST', '/register', { deviceId, subscription, tz: 'Europe/Vilnius' }, secret);
assert.equal(r.status, 200, await r.clone().text());

r = await call('POST', '/sync', { deviceId, items: [] }, 'wrong-secret-wrong-secret');
assert.equal(r.status, 403);

const now = Date.now();
const items = [
  { id: 'b1:2026-12-01:before', fireAt: new Date(now - 60e3).toISOString(), title: 'Rent is due in 2 days', body: '€650.00 due 1 Dec.', url: './?bill=b1' },
  { id: 'b2:2026-12-05:before', fireAt: new Date(now + 3600e3).toISOString(), title: 'Later', body: 'not yet' },
  { id: 'b3:2026-10-01:due', fireAt: new Date(now - 48 * 3600e3).toISOString(), title: 'Stale', body: 'too old' },
];
r = await call('POST', '/sync', { deviceId, items, badge: 1, bills: [{ id: 'b1', name: 'Rent', amount: 650, currency: 'EUR', frequency: 'monthly', anchorDay: 1, nextDue: '2026-12-01', remindDays: 2 }] }, secret);
assert.equal(r.status, 200);

let sent = await runDue(env, now);
assert.equal(sent, 1);
assert.equal(delivered[0].title, 'Rent is due in 2 days');
assert.equal(delivered[0].badge, 1);
sent = await runDue(env, now + 60e3);
assert.equal(sent, 0, 'does not resend');
sent = await runDue(env, now + 3700e3);
assert.equal(sent, 1, 'sends the later one when due');

r = await call('POST', '/test', { deviceId }, secret);
assert.equal(r.status, 200);
assert.equal(delivered.at(-1).title, 'Push reminders work');

r = await call('GET', `/cal/${deviceId}.ics?k=${secret}`);
const ics = await r.text();
assert.match(ics, /BEGIN:VEVENT/);
assert.match(ics, /RRULE:FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=1/);
r = await call('GET', `/cal/${deviceId}.ics?k=nope`);
assert.equal(r.status, 404);

r = await call('DELETE', '/device', { deviceId }, secret);
assert.equal(r.status, 200);
assert.equal(kv.size, 0);
console.log('worker ok:', delivered.length, 'pushes delivered and decrypted');
