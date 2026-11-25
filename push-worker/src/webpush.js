// Web Push sender using only WebCrypto, so it runs on Cloudflare Workers (and Node 20+).
// Implements RFC 8291 (message encryption, aes128gcm) and RFC 8292 (VAPID).

const enc = new TextEncoder();

export function b64url(bytes) {
  let s = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(str) {
  const pad = '='.repeat((4 - (str.length % 4)) % 4);
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function concat(...parts) {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

// Encrypts `payload` for a browser subscription. Returns the request body.
export async function encryptPayload(subscription, payload, { salt, localKeys } = {}) {
  const uaPublic = fromB64url(subscription.keys.p256dh);
  const authSecret = fromB64url(subscription.keys.auth);
  salt = salt || crypto.getRandomValues(new Uint8Array(16));

  const local = localKeys || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));

  // RFC 8291 section 3.4
  const prkKey = await hmac(authSecret, ecdhSecret);
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hmac(prkKey, concat(keyInfo, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, enc.encode('Content-Encoding: aes128gcm\0\x01'))).slice(0, 16);
  const nonce = (await hmac(prk, enc.encode('Content-Encoding: nonce\0\x01'))).slice(0, 12);

  const plain = concat(enc.encode(typeof payload === 'string' ? payload : JSON.stringify(payload)), new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plain));

  const rs = new Uint8Array([0, 0, 16, 0]); // record size 4096
  const header = concat(salt, rs, new Uint8Array([asPublic.length]), asPublic);
  return concat(header, cipher);
}

// VAPID JWT signed with ES256. privateJwk is the JSON Web Key of the VAPID private key.
export async function vapidAuthHeader(endpoint, { publicKey, privateJwk, subject }) {
  const aud = new URL(endpoint).origin;
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey('jwk', typeof privateJwk === 'string' ? JSON.parse(privateJwk) : privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${publicKey}`;
}

export async function sendPush(subscription, payload, vapid, { ttl = 24 * 3600, urgency = 'high', topic } = {}) {
  const body = await encryptPayload(subscription, payload);
  const headers = {
    Authorization: await vapidAuthHeader(subscription.endpoint, vapid),
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: String(ttl),
    Urgency: urgency,
  };
  if (topic) headers.Topic = topic.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
  const res = await fetch(subscription.endpoint, { method: 'POST', headers, body });
  return { status: res.status, ok: res.status >= 200 && res.status < 300, gone: res.status === 404 || res.status === 410, text: res.ok ? '' : await res.text().catch(() => '') };
}

export async function generateVapidKeys() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publicKey = b64url(await crypto.subtle.exportKey('raw', kp.publicKey));
  const privateJwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  return { publicKey, privateJwk };
}
