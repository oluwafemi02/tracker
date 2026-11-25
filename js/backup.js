// Encrypted cloud backup. Everything is encrypted on the phone with a key made from
// your passphrase; the push server only stores ciphertext. The passphrase also decides
// where the backup is stored, so restoring on a new phone needs only the passphrase.

const enc = new TextEncoder();
const dec = new TextDecoder();
const SALT = enc.encode('tracker-backup-v1');
export const ITERATIONS = 600000;

function b64(bytes) {
  const arr = new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < arr.length; i += 0x8000) s += String.fromCharCode.apply(null, arr.subarray(i, i + 0x8000));
  return btoa(s);
}
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function deriveKeys(passphrase, iterations = ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: SALT, iterations }, base, 512));
  const keyRaw = bits.slice(0, 32);
  const backupId = hex(await crypto.subtle.digest('SHA-256', bits.slice(32)));
  return { keyRaw: b64(keyRaw), backupId };
}

async function aesKey(keyRaw) {
  return crypto.subtle.importKey('raw', unb64(keyRaw), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptJSON(obj, keyRaw) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(keyRaw), enc.encode(JSON.stringify(obj)));
  return { v: 1, iv: b64(iv), data: b64(data) };
}

export async function decryptJSON(blob, keyRaw) {
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv) }, await aesKey(keyRaw), unb64(blob.data));
    return JSON.parse(dec.decode(plain));
  } catch {
    throw new Error('That passphrase does not open this backup.');
  }
}

// The parts of the state worth backing up. Phone-specific bits are reset on restore.
export function backupPayload(state) {
  const { notified, ...rest } = state;
  return { ...rest, backedUpAt: new Date().toISOString() };
}

export function restoredState(payload, keep) {
  const s = { ...payload };
  delete s.backedUpAt;
  s.notified = {};
  s.settings = {
    ...s.settings,
    // The new phone needs its own notification subscription; the device id is kept so
    // reconnecting reuses it (and the Apple Pay shortcut keeps working).
    push: { ...(s.settings?.push || {}), enabled: false, lastSync: null, lastError: null },
    calendarExportedHash: null,
    cloudBackup: { ...(s.settings?.cloudBackup || {}), ...keep },
  };
  return s;
}

// Cheap fingerprint of the data, to skip uploads when nothing changed.
export function dataHash(state) {
  const { expenses, bills, trips, tripExpenses, categories, merchantRules, settings } = state;
  const { push, cloudBackup, applePay, ...plainSettings } = settings || {};
  const str = JSON.stringify([expenses, bills, trips, tripExpenses, categories, merchantRules, plainSettings]);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `${(h >>> 0).toString(36)}:${str.length}`;
}
