// Runs the app against the real push-worker code (in memory), with the Apple Pay
// Shortcut and a second phone simulated.
import { test, expect, boot, getState, expectToast, sheet, state, confirmButton } from './helpers.js';
import worker from '../push-worker/src/index.js';

const SERVER = 'https://push.test';
const deviceId = 'abcdef0123456789abcdef01';
const secret = 'f'.repeat(48);

function fakeServer() {
  const kv = new Map();
  const DEVICES = {
    async get(k, type) { const v = kv.get(k); return v == null ? null : type === 'json' ? JSON.parse(v) : v; },
    async put(k, v) { kv.set(k, v); },
    async delete(k) { kv.delete(k); },
    async list({ prefix }) { return { keys: [...kv.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }; },
  };
  const env = { DEVICES, VAPID_PUBLIC_KEY: 'BNLScfIkZEdrv5z7z2MsKrnIxNfMyU1J4zzOPokTvaS_fqnnxcOBLvPsbqqS-GcG68camFlBZDJKxjC_EbmOwT0', VAPID_PRIVATE_JWK: '{}' };
  const call = (path, init = {}) => worker.fetch(new Request(SERVER + path, init), env);
  return {
    kv,
    call,
    async attach(page) {
      await page.route(`${SERVER}/**`, async (route) => {
        const req = route.request();
        const res = await call(new URL(req.url()).pathname + new URL(req.url()).search, {
          method: req.method(), headers: req.headers(), body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postDataBuffer(),
        });
        await route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
      });
    },
    async register() {
      const sub = { endpoint: 'https://web.push.apple.com/x', keys: { p256dh: 'BP', auth: 'au' } };
      const r = await call('/register', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` }, body: JSON.stringify({ deviceId, subscription: sub, tz: 'Europe/Vilnius' }) });
      expect(r.status).toBe(200);
    },
    // What the iPhone Shortcut does after an Apple Pay payment.
    async shortcut(url, body) {
      const r = await worker.fetch(new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env);
      expect(r.status).toBe(200);
    },
  };
}

const connected = (extra = {}) => {
  const s = state({ expenses: [{ amount: 12, category: 'groceries', note: 'Lunch', date: '2026-11-20' }], ...extra });
  s.settings.push = { url: SERVER, deviceId, secret, enabled: true, lastSync: null, lastError: null };
  return s;
};

// Requests from pages controlled by a service worker skip page.route in WebKit.
test.use({ serviceWorkers: 'block' });

test.describe('Apple Pay logging', () => {
  test('set up, payments arrive, known shops are filed, new ones are checked once', async ({ page }) => {
    const server = fakeServer();
    await server.register();
    await server.attach(page);
    const s = connected();
    s.merchantRules = { rimi: 'groceries', '*rimi': 'groceries' };
    await boot(page, { state: s, standalone: true });
    await page.goto('./#settings/applepay');
    await page.getByRole('button', { name: 'Set up Apple Pay logging' }).click();
    await expectToast(page, 'Apple Pay logging is ready');
    await expect(page.locator('.shortcut-steps')).toHaveAttribute('open', '');
    const address = await page.locator('[data-applepay-url]').innerText();
    expect(address).toMatch(new RegExp(`^${SERVER}/in/${deviceId}/[a-f0-9]{48}$`));

    // Three payments while the app is in the background, one sent twice by the Shortcut.
    await server.shortcut(address, { amount: '€23.40', merchant: 'RIMI VILNIUS', card: 'Revolut' });
    await server.shortcut(address, { amount: '€23.40', merchant: 'RIMI VILNIUS', card: 'Revolut' });
    await server.shortcut(address, { amount: '3,20 €', merchant: 'Caffeine', card: 'Revolut' });
    await server.shortcut(address, { amount: '€4.10', merchant: 'CAFFEINE', card: 'Swedbank' });
    await page.getByRole('button', { name: 'Check for payments now' }).click();
    await expectToast(page, 'Added 3 payments');
    let st = await getState(page);
    expect(st.expenses.filter((e) => e.source === 'applepay').map((e) => [e.note, e.amount, e.category, e.needsReview]))
      .toEqual([['Rimi Vilnius', 23.4, 'groceries', false], ['Caffeine', 3.2, 'other', true], ['Caffeine', 4.1, 'other', true]]);
    expect([...server.kv.keys()].filter((k) => k.startsWith('i:'))).toEqual([]); // inbox emptied

    await page.goto('./#home');
    await expect(page.locator('.review-nudge')).toContainText('2 Apple Pay payments to check');
    await expect(page.locator('.tx-row', { hasText: 'Caffeine' }).first()).toContainText('Check');
    await page.locator('.review-nudge').click();
    const r = sheet(page);
    await expect(r.locator('.review-list li')).toHaveCount(2);
    await r.locator('select').first().selectOption('dining');
    await expect(r.locator('select').nth(1)).toHaveValue('dining'); // same shop filled in
    await r.getByRole('button', { name: 'Save' }).click();
    await expectToast(page, 'Saved');
    await expect(page.locator('.review-nudge')).toHaveCount(0);
    st = await getState(page);
    expect(st.expenses.filter((e) => e.note === 'Caffeine').map((e) => e.category)).toEqual(['dining', 'dining']);
    expect(st.merchantRules.caffeine).toBe('dining');

    // Next time, Caffeine is filed by itself.
    await server.shortcut(address, { amount: '€2.90', merchant: 'Caffeine', card: 'Revolut' });
    await page.goto('./#settings/applepay');
    await page.getByRole('button', { name: 'Check for payments now' }).click();
    await expectToast(page, 'Added 1 payment');
    st = await getState(page);
    expect(st.expenses.at(-1)).toMatchObject({ note: 'Caffeine', amount: 2.9, category: 'dining', needsReview: false });
  });

  test('payments made while the app was closed are added when it opens', async ({ page }) => {
    const server = fakeServer();
    await server.register();
    const token = 'ab'.repeat(24);
    await server.call('/inbox/setup', { method: 'POST', headers: { Authorization: `Bearer ${secret}` }, body: JSON.stringify({ deviceId, token }) });
    await server.shortcut(`${SERVER}/in/${deviceId}/${token}`, { amount: '€8.00', merchant: 'Bolt', card: 'Revolut' });
    await server.shortcut(`${SERVER}/in/${deviceId}/${token}`, { amount: '-€8.00', merchant: 'Bolt', card: 'Revolut' }); // refund
    await server.shortcut(`${SERVER}/in/${deviceId}/${token}`, { amount: '£5.00', merchant: 'Pret', card: 'Monzo' });
    await server.attach(page);
    const s = connected({ settings: {} });
    s.settings.applePay = { enabled: true, token, lastFetch: null, lastError: null };
    await boot(page, { state: s, standalone: true });
    await expectToast(page, 'Added 2 Apple Pay payments. 2 to check.');
    const st = await getState(page);
    const pret = st.expenses.find((e) => e.note === 'Pret');
    expect(pret).toMatchObject({ amount: 5, currency: 'GBP', baseAmount: 5.85 }); // seeded GBP>EUR 1.17
  });

  test('without push connected, the section explains what to do first', async ({ page }) => {
    await boot(page, { state: state() });
    await page.goto('./#settings/applepay');
    await expect(page.locator('#set-applepay')).toContainText('Connect push notifications above first');
  });
});

test.describe('Cloud backup', () => {
  test('back up with a passphrase, then restore on a new phone', async ({ page, browser }) => {
    test.setTimeout(60_000);
    const server = fakeServer();
    await server.register();
    await server.attach(page);
    const s = connected({ trips: [{ name: '2025 Summer', startDate: '2025-07-27', endDate: '2025-08-08' }] });
    s.expenses[0].note = 'Very private lunch';
    await boot(page, { state: s, standalone: true });
    await page.goto('./#settings/data');
    const form = page.locator('[data-cloud-start]');
    await form.locator('[name="pass"]').fill('short');
    await form.locator('[name="pass2"]').fill('short');
    await form.getByRole('button', { name: 'Turn on cloud backup' }).click();
    await expectToast(page, 'at least 10 characters');
    await form.locator('[name="pass"]').fill('mango river 2026');
    await form.locator('[name="pass2"]').fill('mango river 2027');
    await form.getByRole('button', { name: 'Turn on cloud backup' }).click();
    await expectToast(page, 'do not match');
    await form.locator('[name="pass2"]').fill('mango river 2026');
    await form.getByRole('button', { name: 'Turn on cloud backup' }).click();
    await expectToast(page, 'Cloud backup is on');
    await expect(page.locator('#set-data')).toContainText('On. Last backup');
    const stored = [...server.kv.entries()].find(([k]) => k.endsWith(':latest'));
    expect(stored).toBeTruthy();
    expect(stored[1]).not.toContain('Very private lunch');
    expect(stored[1]).not.toContain('2025 Summer');

    // A new phone: empty app, same server.
    const phone2 = await browser.newContext({ ...test.info().project.use, serviceWorkers: 'block' });
    const page2 = await phone2.newPage();
    await server.attach(page2);
    await boot(page2, { state: state() });
    await page2.goto('./#settings/data');
    await page2.locator('.more-cats summary', { hasText: 'Restore from cloud' }).click();
    const rf = page2.locator('[data-cloud-restore]');
    await rf.locator('[name="url"]').fill(SERVER);
    await rf.locator('[name="pass"]').fill('mango river 2025');
    await rf.getByRole('button', { name: 'Find my backup' }).click();
    await expectToast(page2, 'No backup found for that passphrase');
    await rf.locator('[name="pass"]').fill('mango river 2026');
    await rf.getByRole('button', { name: 'Find my backup' }).click();
    await expect(page2.locator('.confirm')).toContainText('1 expenses, 0 bills, 1 trips');
    await confirmButton(page2, 'Restore').click();
    await expectToast(page2, 'Backup restored');
    const st2 = await getState(page2);
    expect(st2.expenses[0].note).toBe('Very private lunch');
    expect(st2.trips[0].name).toBe('2025 Summer');
    expect(st2.settings.push).toMatchObject({ enabled: false, deviceId, url: SERVER });
    expect(st2.settings.cloudBackup.enabled).toBe(true);
    await phone2.close();
  });

  test('backs up by itself when data changed and the last copy is a day old', async ({ page }) => {
    const server = fakeServer();
    await server.register();
    await server.attach(page);
    const { deriveKeys } = await import('../js/backup.js');
    const keys = await deriveKeys('mango river 2026');
    const s = connected();
    s.settings.cloudBackup = { enabled: true, ...keys, lastAt: '2026-11-23T08:00:00Z', lastHash: 'old', lastError: null };
    const puts = [];
    page.on('request', (r) => { if (r.method() === 'PUT' && r.url().includes('/backup/')) puts.push(r.url()); });
    await boot(page, { state: s, standalone: true });
    await expect.poll(() => puts.length).toBe(1);
    await expect.poll(async () => (await getState(page)).settings.cloudBackup.lastAt).not.toBe('2026-11-23T08:00:00Z');
    // Reopening soon after does not upload again.
    await page.reload();
    await expect(page.locator('#view .top')).toBeVisible();
    await page.waitForTimeout(800);
    expect(puts.length).toBe(1);
  });
});
