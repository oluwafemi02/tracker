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

// ---- several due at once: bills are batched, the monthly summary always goes alone
{
  const at = new Date(now + 10 * 86400e3).toISOString();
  const many = [1, 2, 3, 4].map((n) => ({ id: `bill${n}:due`, fireAt: at, title: `Bill ${n} is due today`, body: '', url: './?tab=bills' }));
  many.push({ id: 'summary:2026-11', fireAt: at, title: 'November: €2,140 spent', body: '€310 under budget.', url: './?tab=activity&month=2026-11', tag: 'summary:2026-11', solo: true });
  r = await call('POST', '/sync', { deviceId, items: many }, secret);
  assert.equal(r.status, 200);
  const before = delivered.length;
  sent = await runDue(env, now + 10 * 86400e3 + 60e3);
  assert.equal(sent, 2);
  const got = delivered.slice(before).map((d) => d.title);
  assert.deepEqual(got, ['November: €2,140 spent', '4 reminders']);
  assert.equal(delivered.at(-2).url, './?tab=activity&month=2026-11');
}

// ---- Apple Pay inbox
const token = 'a1'.repeat(16);
r = await call('POST', `/in/${deviceId}/${token}`, { amount: '€12.50', merchant: 'Rimi' });
assert.equal(r.status, 404, 'no inbox before setup');
r = await call('POST', '/inbox/setup', { deviceId, token }, 'wrong-secret-wrong-secret');
assert.equal(r.status, 403);
r = await call('POST', '/inbox/setup', { deviceId, token }, secret);
assert.equal(r.status, 200);
r = await call('POST', `/in/${deviceId}/${token}`, { amount: '€12.50', merchant: 'Rimi', card: 'Revolut' });
assert.equal(r.status, 200);
r = await worker.fetch(new Request(`https://w.example/in/${deviceId}/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'amount=3%2C20+%E2%82%AC&merchant=Caffeine' }), env);
assert.equal(r.status, 200, 'form bodies work too');
r = await call('POST', `/in/${deviceId}/${'b2'.repeat(16)}`, { amount: '€1' });
assert.equal(r.status, 404, 'wrong token');
r = await call('POST', `/in/${deviceId}/${token}`, { merchant: 'No amount' });
assert.equal(r.status, 400);
r = await worker.fetch(new Request(`https://w.example/inbox?id=${deviceId}`, { headers: { Authorization: 'Bearer nope-nope-nope-nope' } }), env);
assert.equal(r.status, 403, 'the inbox cannot be read without the device secret');
r = await worker.fetch(new Request(`https://w.example/inbox?id=${deviceId}`, { headers: { Authorization: `Bearer ${secret}` } }), env);
const inbox = (await r.json()).items;
assert.deepEqual(inbox.map((i) => [i.amount, i.merchant]).sort(), [['3,20 €', 'Caffeine'], ['€12.50', 'Rimi']]);
assert.ok(inbox.every((i) => i.id && i.receivedAt));
r = await call('POST', '/inbox/ack', { deviceId, ids: [inbox[0].id] }, secret);
assert.equal((await r.json()).removed, 1);
r = await worker.fetch(new Request(`https://w.example/inbox?id=${deviceId}`, { headers: { Authorization: `Bearer ${secret}` } }), env);
assert.equal((await r.json()).items.length, 1);

// ---- Encrypted backups
const bid = 'c3'.repeat(32);
r = await worker.fetch(new Request(`https://w.example/backup/${bid}`), env);
assert.equal(r.status, 404);
const put = (blob, auth = secret) => worker.fetch(new Request(`https://w.example/backup/${bid}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` }, body: JSON.stringify({ deviceId, blob }) }), env);
r = await put({ v: 1, iv: 'aaa', data: 'first' }, 'wrong-secret-wrong-secret');
assert.equal(r.status, 403, 'only a registered device can write backups');
assert.equal((await put({ v: 1, iv: 'aaa', data: 'first' })).status, 200);
assert.equal((await put({ v: 1, iv: 'bbb', data: 'second' })).status, 200);
r = await worker.fetch(new Request(`https://w.example/backup/${bid}`), env);
const got = await r.json();
assert.equal(got.latest.blob.data, 'second');
assert.equal(got.previous.blob.data, 'first', 'the copy before is kept');
assert.equal((await put({ v: 1, iv: 'x', data: 'x'.repeat(5 * 1024 * 1024 + 10) })).status, 413);

r = await call('DELETE', '/device', { deviceId }, secret);
assert.equal(r.status, 200);
assert.equal([...kv.keys()].filter((k) => !k.startsWith('b:')).length, 0, 'device and inbox removed; backups stay for restoring');
console.log('worker ok:', delivered.length, 'pushes delivered and decrypted');
