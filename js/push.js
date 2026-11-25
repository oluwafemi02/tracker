// Client for the optional push server in /push-worker (a free Cloudflare Worker).
// The phone keeps all data. It sends the server only the reminder schedule
// (bill name, amount unless hidden, and when to alert) plus a calendar list of bills.

import { getState, update, attentionCount } from './store.js';
import { reminderSchedule } from './reminders.js';

const b64ToBytes = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const randomToken = (n = 24) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');

const cleanUrl = (u) => String(u || '').trim().replace(/\/+$/, '');

async function api(path, body, method = 'POST') {
  const { url, secret } = getState().settings.push;
  const res = await fetch(cleanUrl(url) + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Server replied ${res.status}`);
  return data;
}

export async function connect(serverUrl) {
  const url = cleanUrl(serverUrl);
  if (!/^https:\/\//.test(url)) throw new Error('Use the https:// address of your push server.');
  const res = await fetch(url + '/vapid').catch(() => null);
  if (!res || !res.ok) throw new Error('Could not reach the push server. Check the address.');
  const { publicKey } = await res.json();
  if (!publicKey) throw new Error('The server did not return a public key. Check its setup.');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (sub) await sub.unsubscribe().catch(() => {});
  sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
  const s = getState();
  const deviceId = s.settings.push.deviceId || randomToken(12);
  const secret = s.settings.push.secret || randomToken(24);
  update((st) => { st.settings.push = { ...st.settings.push, url, deviceId, secret }; }, { silent: true });
  await api('/register', { deviceId, subscription: sub.toJSON(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
  update((st) => { st.settings.push.enabled = true; st.settings.push.lastError = null; });
  await sync();
}

export async function disconnect() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  try { await api('/device', null, 'DELETE'); } catch { /* server gone */ }
  if (sub) await sub.unsubscribe().catch(() => {});
  update((st) => { st.settings.push.enabled = false; st.settings.push.lastSync = null; });
}

let timer = null;
export function scheduleSync() {
  if (!getState().settings.push.enabled) return;
  clearTimeout(timer);
  timer = setTimeout(() => sync().catch(() => {}), 1500);
}

export async function sync() {
  const s = getState();
  if (!s.settings.push.enabled) return;
  try {
    // If iOS dropped the subscription (it can after reinstall), re-register it.
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    const bills = s.bills.filter((b) => b.active).map((b) => ({
      id: b.id, name: b.name, amount: s.settings.hideAmountsInPush ? null : b.amount, currency: b.currency,
      frequency: b.frequency, anchorDay: b.anchorDay, nextDue: b.nextDue, endDate: b.endDate, remindDays: b.remindDays, autopay: b.autopay,
    }));
    await api('/sync', {
      deviceId: s.settings.push.deviceId,
      subscription: sub ? sub.toJSON() : null,
      items: reminderSchedule(),
      badge: attentionCount(),
      bills,
      remindTime: s.settings.remindTime,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    update((st) => { st.settings.push.lastSync = new Date().toISOString(); st.settings.push.lastError = null; }, { silent: true });
  } catch (err) {
    update((st) => { st.settings.push.lastError = err.message; }, { silent: true });
    throw err;
  }
}

export async function sendTestPush() {
  await sync();
  return api('/test', { deviceId: getState().settings.push.deviceId });
}

export function calendarFeedUrl() {
  const { url, deviceId, secret, enabled } = getState().settings.push;
  if (!enabled || !url) return null;
  return `${cleanUrl(url).replace(/^https:/, 'webcal:')}/cal/${deviceId}.ics?k=${secret}`;
}
