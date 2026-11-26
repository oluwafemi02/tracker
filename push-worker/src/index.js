// Tracker push server: stores each phone's reminder schedule and sends Web Push
// notifications on time. Runs on a Cloudflare Worker with a KV namespace and a cron trigger.
//
// Routes
//   GET    /vapid                      public VAPID key
//   POST   /register                   { deviceId, subscription, tz }           Bearer <secret>
//   POST   /sync                       { deviceId, items, bills, badge, ... }   Bearer <secret>
//   POST   /test                       { deviceId }                             Bearer <secret>
//   DELETE /device                     (deviceId from body or ?id=)             Bearer <secret>
//   GET    /cal/<deviceId>.ics?k=<secret>  calendar feed of bills
//
// Apple Pay inbox (payments sent by an iPhone Shortcut, picked up by the app)
//   POST   /inbox/setup                { deviceId, token }                       Bearer <secret>
//   POST   /in/<deviceId>/<token>      { amount, merchant, card }                (the Shortcut; write only)
//   GET    /inbox?id=<deviceId>                                                  Bearer <secret>
//   POST   /inbox/ack                  { deviceId, ids }                         Bearer <secret>
//
// Encrypted backups (the server only ever sees ciphertext)
//   PUT    /backup/<backupId>          { deviceId, blob }                        Bearer <secret>
//   GET    /backup/<backupId>          latest and previous copy

import { sendPush } from './webpush.js';
import { buildICS } from './ics.js';

const MAX_ITEMS = 400;
const MAX_INBOX = 300;
const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
const LATE_WINDOW_MS = 12 * 3600e3; // do not send reminders that are more than 12h stale

function cors(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

const json = (env, data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...cors(env) } });

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function vapid(env) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_JWK) throw new Error('Server is missing VAPID keys. See push-worker/README.md.');
  return { publicKey: env.VAPID_PUBLIC_KEY, privateJwk: env.VAPID_PRIVATE_JWK, subject: env.VAPID_SUBJECT || 'mailto:admin@example.com' };
}

const validId = (id) => typeof id === 'string' && /^[a-f0-9]{8,64}$/.test(id);
const bearer = (req) => (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();

async function loadDevice(env, id) {
  return env.DEVICES.get(`d:${id}`, 'json');
}

async function saveDevice(env, id, rec) {
  rec.updatedAt = Date.now();
  await env.DEVICES.put(`d:${id}`, JSON.stringify(rec));
}

async function authed(env, req, id) {
  if (!validId(id)) return { error: 'Missing or invalid device id', status: 400 };
  const secret = bearer(req);
  if (!secret || secret.length < 16) return { error: 'Missing secret', status: 401 };
  const rec = await loadDevice(env, id);
  if (!rec) return { error: 'Device not registered. Connect again from the app.', status: 404 };
  if (rec.secretHash !== await sha256(secret)) return { error: 'Wrong secret', status: 403 };
  return { rec };
}

function validSubscription(sub) {
  return sub && typeof sub.endpoint === 'string' && /^https:\/\//.test(sub.endpoint) && sub.keys?.p256dh && sub.keys?.auth;
}

async function deliver(env, id, rec, payload) {
  if (!rec.subscription) return { ok: false, status: 0, error: 'No subscription' };
  const res = await sendPush(rec.subscription, payload, vapid(env), { ttl: 24 * 3600 });
  if (res.gone) {
    rec.subscription = null;
    rec.lastError = 'Subscription expired. Open the app and connect again.';
  } else if (!res.ok) {
    rec.lastError = `Push service replied ${res.status} ${res.text}`.slice(0, 200);
  } else rec.lastError = null;
  return res;
}

async function handle(req, env) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });

  if (req.method === 'GET' && path === '/') return json(env, { ok: true, service: 'tracker-push' });
  if (req.method === 'GET' && path === '/vapid') return json(env, { publicKey: vapid(env).publicKey });

  const cal = path.match(/^\/cal\/([a-f0-9]{8,64})\.ics$/);
  if (req.method === 'GET' && cal) {
    const rec = await loadDevice(env, cal[1]);
    const k = url.searchParams.get('k') || '';
    if (!rec || rec.secretHash !== await sha256(k)) return new Response('Not found', { status: 404 });
    return new Response(buildICS(rec.bills || [], { remindTime: rec.remindTime || '09:00' }), {
      headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-cache' },
    });
  }

  // ---- Apple Pay inbox: the Shortcut posts here. The token can only add payments.
  const inMatch = path.match(/^\/in\/([a-f0-9]{8,64})\/([a-f0-9]{16,128})$/);
  if (req.method === 'POST' && inMatch) {
    const [, id, token] = inMatch;
    const rec = await loadDevice(env, id);
    if (!rec || !rec.inboxTokenHash || rec.inboxTokenHash !== await sha256(token)) return json(env, { error: 'Unknown inbox' }, 404);
    const raw = await req.text();
    let data = {};
    try { data = JSON.parse(raw); } catch { data = Object.fromEntries(new URLSearchParams(raw)); }
    const tx = {
      amount: String(data.amount ?? data.Amount ?? '').slice(0, 40),
      merchant: String(data.merchant ?? data.Merchant ?? data.name ?? '').slice(0, 80),
      card: String(data.card ?? data.Card ?? '').slice(0, 60),
      receivedAt: new Date().toISOString(),
    };
    if (!tx.amount) return json(env, { error: 'Missing amount' }, 400);
    const list = await env.DEVICES.list({ prefix: `i:${id}:` });
    if (list.keys.length >= MAX_INBOX) return json(env, { error: 'Inbox is full. Open Tracker to empty it.' }, 429);
    const key = `i:${id}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    await env.DEVICES.put(key, JSON.stringify(tx), { expirationTtl: 120 * 86400 });
    return json(env, { ok: true });
  }

  // ---- Encrypted backups
  const bk = path.match(/^\/backup\/([a-f0-9]{64})$/);
  if (bk && req.method === 'GET') {
    const [latest, previous] = await Promise.all([env.DEVICES.get(`b:${bk[1]}:latest`, 'json'), env.DEVICES.get(`b:${bk[1]}:previous`, 'json')]);
    if (!latest) return json(env, { error: 'No backup found for that passphrase' }, 404);
    return json(env, { latest, previous });
  }
  if (bk && req.method === 'PUT') {
    const raw = await req.text();
    if (raw.length > MAX_BACKUP_BYTES) return json(env, { error: 'Backup is too large' }, 413);
    const data = JSON.parse(raw || '{}');
    const a = await authed(env, req, data.deviceId);
    if (a.error) return json(env, { error: a.error }, a.status);
    const blob = data.blob;
    if (!blob || typeof blob.data !== 'string' || typeof blob.iv !== 'string') return json(env, { error: 'Invalid backup' }, 400);
    const latest = await env.DEVICES.get(`b:${bk[1]}:latest`);
    if (latest) await env.DEVICES.put(`b:${bk[1]}:previous`, latest);
    const at = new Date().toISOString();
    await env.DEVICES.put(`b:${bk[1]}:latest`, JSON.stringify({ at, blob }));
    return json(env, { ok: true, at });
  }

  let body = {};
  if (req.method === 'POST' || req.method === 'DELETE') body = await req.json().catch(() => ({}));
  const deviceId = body.deviceId || url.searchParams.get('id');

  if (req.method === 'POST' && path === '/register') {
    if (!validId(deviceId)) return json(env, { error: 'Invalid device id' }, 400);
    const secret = bearer(req);
    if (!secret || secret.length < 16) return json(env, { error: 'Missing secret' }, 401);
    if (!validSubscription(body.subscription)) return json(env, { error: 'Invalid push subscription' }, 400);
    const existing = await loadDevice(env, deviceId);
    const secretHash = await sha256(secret);
    if (existing && existing.secretHash !== secretHash) return json(env, { error: 'Device id already in use' }, 403);
    if (!existing) {
      const max = Number(env.MAX_DEVICES || 5);
      const list = await env.DEVICES.list({ prefix: 'd:' });
      if (list.keys.length >= max) return json(env, { error: `This server allows ${max} devices. Raise MAX_DEVICES to add more.` }, 403);
    }
    const rec = existing || { secretHash, items: [], sent: {}, bills: [], createdAt: Date.now() };
    rec.subscription = body.subscription;
    rec.tz = String(body.tz || 'UTC').slice(0, 64);
    rec.lastError = null;
    await saveDevice(env, deviceId, rec);
    return json(env, { ok: true });
  }

  if (req.method === 'POST' && path === '/sync') {
    const a = await authed(env, req, deviceId);
    if (a.error) return json(env, { error: a.error }, a.status);
    const rec = a.rec;
    if (validSubscription(body.subscription)) rec.subscription = body.subscription;
    if (Array.isArray(body.items)) {
      rec.items = body.items.slice(0, MAX_ITEMS).filter((i) => i && i.id && i.fireAt).map((i) => ({
        id: String(i.id).slice(0, 120), fireAt: String(i.fireAt), title: String(i.title || '').slice(0, 120),
        body: String(i.body || '').slice(0, 240), url: String(i.url || './').slice(0, 200), tag: String(i.tag || '').slice(0, 120),
        ...(i.solo === true ? { solo: true } : {}),
      }));
    }
    if (Array.isArray(body.bills)) rec.bills = body.bills.slice(0, 300);
    if (typeof body.badge === 'number') rec.badge = body.badge;
    if (body.remindTime) rec.remindTime = String(body.remindTime).slice(0, 5);
    if (body.tz) rec.tz = String(body.tz).slice(0, 64);
    // Forget "sent" marks for items that no longer exist (bill paid, edited or deleted).
    const live = new Set(rec.items.map((i) => i.id));
    const cutoff = Date.now() - 40 * 864e5;
    for (const [k, t] of Object.entries(rec.sent || {})) if (!live.has(k) && t < cutoff) delete rec.sent[k];
    await saveDevice(env, deviceId, rec);
    return json(env, { ok: true, items: rec.items.length, subscription: !!rec.subscription, lastError: rec.lastError || null });
  }

  if (req.method === 'POST' && path === '/test') {
    const a = await authed(env, req, deviceId);
    if (a.error) return json(env, { error: a.error }, a.status);
    const res = await deliver(env, deviceId, a.rec, { title: 'Push reminders work', body: 'Bill reminders will arrive like this, even when the app is closed.', url: './?tab=bills', tag: 'test', badge: a.rec.badge || 0 });
    await saveDevice(env, deviceId, a.rec);
    if (!res.ok) return json(env, { error: a.rec.lastError || 'Push failed' }, 502);
    return json(env, { ok: true });
  }

  if (req.method === 'POST' && path === '/inbox/setup') {
    const a = await authed(env, req, deviceId);
    if (a.error) return json(env, { error: a.error }, a.status);
    if (typeof body.token !== 'string' || !/^[a-f0-9]{16,128}$/.test(body.token)) return json(env, { error: 'Invalid token' }, 400);
    a.rec.inboxTokenHash = await sha256(body.token);
    await saveDevice(env, deviceId, a.rec);
    return json(env, { ok: true });
  }

  if (req.method === 'GET' && path === '/inbox') {
    const a = await authed(env, req, deviceId);
    if (a.error) return json(env, { error: a.error }, a.status);
    const list = await env.DEVICES.list({ prefix: `i:${deviceId}:` });
    const items = [];
    for (const k of list.keys) {
      const v = await env.DEVICES.get(k.name, 'json');
      if (v) items.push({ id: k.name.split(':')[2], ...v });
    }
    return json(env, { items });
  }

  if (req.method === 'POST' && path === '/inbox/ack') {
    const a = await authed(env, req, deviceId);
    if (a.error) return json(env, { error: a.error }, a.status);
    const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === 'string' && /^[a-z0-9]{4,40}$/.test(x)).slice(0, MAX_INBOX) : [];
    await Promise.all(ids.map((x) => env.DEVICES.delete(`i:${deviceId}:${x}`)));
    return json(env, { ok: true, removed: ids.length });
  }

  if (req.method === 'DELETE' && path === '/device') {
    const a = await authed(env, req, deviceId);
    if (a.error) return json(env, { error: a.error }, a.status);
    await env.DEVICES.delete(`d:${deviceId}`);
    const inbox = await env.DEVICES.list({ prefix: `i:${deviceId}:` });
    await Promise.all(inbox.keys.map((k) => env.DEVICES.delete(k.name)));
    return json(env, { ok: true });
  }

  return json(env, { error: 'Not found' }, 404);
}

// Runs on the cron schedule (every 15 minutes by default).
export async function runDue(env, now = Date.now()) {
  let sent = 0;
  let cursor;
  do {
    const page = await env.DEVICES.list({ prefix: 'd:', cursor });
    cursor = page.list_complete ? undefined : page.cursor;
    for (const key of page.keys) {
      const id = key.name.slice(2);
      const rec = await loadDevice(env, id);
      if (!rec || !rec.subscription || !Array.isArray(rec.items)) continue;
      rec.sent ||= {};
      const due = rec.items.filter((i) => {
        const t = Date.parse(i.fireAt);
        return t <= now && t > now - LATE_WINDOW_MS && !rec.sent[i.id];
      });
      if (!due.length) continue;
      // Several at once (e.g. after the server was down): send one summary instead of a burst.
      // Items marked solo (the monthly summary) always go on their own.
      const solo = due.filter((d) => d.solo);
      const rest = due.filter((d) => !d.solo);
      const batches = [
        ...solo,
        ...(rest.length > 3
          ? [{ title: `${rest.length} reminders`, body: rest.map((d) => d.title).join('\n'), url: './?tab=bills', tag: 'batch' }]
          : rest),
      ];
      for (const item of batches) {
        const res = await deliver(env, id, rec, { title: item.title, body: item.body, url: item.url, tag: item.tag, badge: rec.badge || 0 });
        if (res.gone) break;
        if (res.ok) sent++;
      }
      for (const d of due) rec.sent[d.id] = now;
      await saveDevice(env, id, rec);
    }
  } while (cursor);
  return sent;
}

export default {
  async fetch(req, env) {
    try { return await handle(req, env); }
    catch (err) { return json(env, { error: err.message || 'Server error' }, 500); }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDue(env));
  },
};
