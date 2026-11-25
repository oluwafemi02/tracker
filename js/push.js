// Client for the optional push server in /push-worker (a free Cloudflare Worker).
// The phone keeps all data. It sends the server only the reminder schedule
// (bill name, amount unless hidden, and when to alert) plus a calendar list of bills.

import { getState, update, attentionCount, uid } from './store.js';
import { inboxToExpenses } from './applepay.js';
import { lastRate, fetchRate, ECB } from './money.js';
import { encryptJSON, decryptJSON, backupPayload, dataHash, deriveKeys, restoredState } from './backup.js';
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

// ---------- Apple Pay inbox

export const inboxReady = () => {
  const s = getState().settings;
  return !!(s.push.deviceId && s.push.secret && s.push.url && s.applePay?.enabled && s.applePay?.token);
};

export function inboxUrl() {
  const { url, deviceId } = getState().settings.push;
  const { token } = getState().settings.applePay || {};
  return url && deviceId && token ? `${cleanUrl(url)}/in/${deviceId}/${token}` : null;
}

export async function setupInbox() {
  const s = getState().settings;
  if (!s.push.deviceId || !s.push.secret) throw new Error('Connect push reminders first.');
  const token = s.applePay?.token || randomToken(24);
  await api('/inbox/setup', { deviceId: s.push.deviceId, token });
  update((st) => { st.settings.applePay = { ...st.settings.applePay, enabled: true, token, lastError: null }; });
}

export function stopInbox() {
  update((st) => { st.settings.applePay = { enabled: false, token: '', lastFetch: null, lastError: null }; });
}

let fetching = null;
// Pick up payments the Shortcut sent, add them, then clear them from the server.
export function fetchInbox() {
  if (!inboxReady()) return Promise.resolve(null);
  if (fetching) return fetching;
  fetching = (async () => {
    const { deviceId } = getState().settings.push;
    try {
      const { items = [] } = await api(`/inbox?id=${deviceId}`, null, 'GET');
      if (!items.length) {
        update((st) => { st.settings.applePay.lastFetch = new Date().toISOString(); st.settings.applePay.lastError = null; }, { silent: true });
        return { added: 0 };
      }
      const main = getState().settings.currency;
      const curs = new Set(items.map((i) => (String(i.amount).match(/\b[A-Z]{3}\b/) || [])[0]).filter(Boolean));
      for (const c of curs) if (c !== main && ECB.has(c) && !lastRate(c, main)) await fetchRate(c, main);
      const res = inboxToExpenses(items, {
        main, rules: getState().merchantRules, existing: getState().expenses, uid, rate: (c) => lastRate(c, main),
      });
      update((st) => {
        st.expenses.push(...res.expenses);
        st.settings.applePay.lastFetch = new Date().toISOString();
        st.settings.applePay.lastError = null;
      });
      await api('/inbox/ack', { deviceId, ids: res.done });
      return { added: res.expenses.length, review: res.expenses.filter((e) => e.needsReview).length, refunds: res.refunds };
    } catch (err) {
      update((st) => { st.settings.applePay.lastError = err.message; }, { silent: true });
      throw err;
    } finally {
      fetching = null;
    }
  })();
  return fetching;
}

// ---------- Encrypted cloud backup

export const backupReady = () => {
  const s = getState().settings;
  return !!(s.push.deviceId && s.push.secret && s.push.url && s.cloudBackup?.enabled && s.cloudBackup?.keyRaw);
};

export async function startBackup(passphrase) {
  const s = getState().settings;
  if (!s.push.deviceId || !s.push.secret) throw new Error('Connect push reminders first. Backups are stored on the same server.');
  const { keyRaw, backupId } = await deriveKeys(passphrase);
  update((st) => { st.settings.cloudBackup = { ...st.settings.cloudBackup, enabled: true, keyRaw, backupId, lastError: null, lastHash: null }; }, { silent: true });
  return backupNow();
}

export async function backupNow() {
  const s = getState();
  const { keyRaw, backupId } = s.settings.cloudBackup;
  try {
    const blob = await encryptJSON(backupPayload(s), keyRaw);
    const hash = dataHash(s);
    const res = await api(`/backup/${backupId}`, { deviceId: s.settings.push.deviceId, blob }, 'PUT');
    update((st) => { Object.assign(st.settings.cloudBackup, { lastAt: res.at || new Date().toISOString(), lastHash: hash, lastError: null }); });
    return res;
  } catch (err) {
    update((st) => { st.settings.cloudBackup.lastError = err.message; }, { silent: true });
    throw err;
  }
}

// At most once a day, and only when something changed.
export async function autoBackup() {
  if (!backupReady()) return false;
  const cb = getState().settings.cloudBackup;
  if (cb.lastAt && Date.now() - new Date(cb.lastAt).getTime() < 20 * 3600e3) return false;
  if (cb.lastHash && cb.lastHash === dataHash(getState())) return false;
  await backupNow();
  return true;
}

// On a new phone: find and open the backup with only the passphrase.
export async function fetchBackup(serverUrl, passphrase) {
  const url = cleanUrl(serverUrl);
  if (!/^https:\/\//.test(url)) throw new Error('Use the https:// address of your push server.');
  const { keyRaw, backupId } = await deriveKeys(passphrase);
  const res = await fetch(`${url}/backup/${backupId}`).catch(() => null);
  if (!res) throw new Error('Could not reach the server. Check the address.');
  if (res.status === 404) throw new Error('No backup found for that passphrase.');
  if (!res.ok) throw new Error(`Server replied ${res.status}`);
  const { latest, previous } = await res.json();
  let payload, at = latest.at;
  try { payload = await decryptJSON(latest.blob, keyRaw); } catch (err) {
    if (!previous) throw err;
    payload = await decryptJSON(previous.blob, keyRaw);
    at = previous.at;
  }
  const state = restoredState(payload, { enabled: true, keyRaw, backupId, lastAt: at, lastHash: null, lastError: null });
  state.settings.push.url = url;
  return { state, at };
}
