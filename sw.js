// Service worker: offline app shell, push notifications, notification taps.
// The deploy workflow rewrites CACHE_NAME on every deploy so phones pick up new files.
const CACHE_NAME = 'tracker-v1.4.0';
const STATE_CACHE = 'ledger-state';

const SHELL = [
  './',
  'index.html',
  'manifest.json',
  'css/app.css',
  'fonts/bricolage.woff2',
  'icons/icon-192.png',
  'icons/apple-touch-icon.png',
  'js/app.js',
  'js/store.js',
  'js/dates.js',
  'js/money.js',
  'js/categories.js',
  'js/ics.js',
  'js/migrate.js',
  'js/recover.js',
  'js/applepay.js',
  'js/backup.js',
  'js/version.js',
  'js/ui.js',
  'js/forms.js',
  'js/reminders.js',
  'js/push.js',
  'js/views-home.js',
  'js/views-bills.js',
  'js/views-trips.js',
  'js/views-settings.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== STATE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network first for our own files so updates show up right away; cache when offline.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
        if (hit) return hit;
        if (req.mode === 'navigate') return caches.match('index.html');
        return Response.error();
      }),
  );
});

async function readState() {
  try {
    const res = await (await caches.open(STATE_CACHE)).match('state/reminders.json');
    return res ? res.json() : null;
  } catch { return null; }
}

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let data = null;
    try { data = event.data ? event.data.json() : null; } catch { data = event.data ? { title: 'Tracker', body: event.data.text() } : null; }
    if (!data) {
      // Empty push: describe what is due from the last saved state.
      const st = await readState();
      const due = st?.due || [];
      data = due.length
        ? { title: due.length === 1 ? `${due[0].line} needs paying` : `${due.length} bills need paying`, body: due.map((d) => d.line).join('\n'), url: './?tab=bills', badge: due.length }
        : { title: 'Tracker', body: 'Check your upcoming bills.', url: './?tab=bills' };
    }
    if (typeof data.badge === 'number' && self.navigator.setAppBadge) {
      try { data.badge > 0 ? await self.navigator.setAppBadge(data.badge) : await self.navigator.clearAppBadge(); } catch { /* ignore */ }
    }
    await self.registration.showNotification(data.title || 'Tracker', {
      body: data.body || '',
      tag: data.tag || 'tracker',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      data: { url: data.url || './' },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './', self.registration.scope).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      if (client.url.startsWith(self.registration.scope)) {
        await client.focus();
        const u = new URL(target);
        client.postMessage({ type: 'navigate', url: u.pathname + u.search });
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
