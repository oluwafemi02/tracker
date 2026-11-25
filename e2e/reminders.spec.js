import { test, expect, boot, getState, expectToast, tab, state } from './helpers.js';

const withBills = (extra = {}) => state({
  bills: [
    { name: 'Rent, flat', amount: 650, nextDue: '2026-11-30', category: 'rent', remindDays: 2 },
    { name: 'Phone', amount: 20, nextDue: '2026-11-20', remindDays: 0 },
    { name: 'Gym', amount: 30, nextDue: '2026-12-05', active: false },
  ],
  ...extra,
});

test.describe('Reminders', () => {
  test('calendar export builds a valid file with repeating events and alerts', async ({ page }) => {
    await boot(page, { state: withBills() });
    await page.goto('./#settings/reminders');
    await page.getByRole('button', { name: 'Add bills to calendar' }).click();
    await expectToast(page, 'Calendar file ready');
    const shared = await page.evaluate(() => window.__shared);
    expect(shared).toHaveLength(1);
    expect(shared[0]).toMatchObject({ name: 'bills.ics', type: 'text/calendar' });
    const ics = shared[0].text;
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.trim().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2); // paused bill left out
    expect(ics).toContain('SUMMARY:Rent\\, flat €650.00');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261130');
    expect(ics).toContain('RRULE:FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=28,29,30;BYSETPOS=-1');
    expect(ics).toContain('TRIGGER:-PT2340M'); // 2 days before at 09:00
    expect(ics).toContain('TRIGGER:PT540M'); // on the day at 09:00
    expect(ics).toContain('UID:bill1@tracker.bills');
    expect(ics.replace(/\r\n /g, '')).toMatch(/\?bill=bill1/); // long lines are folded
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);

    // After export the status says reminders are in the calendar.
    await tab(page, 'bills');
    await expect(page.locator('.status-pill')).toContainText('Reminders are in your calendar');
  });

  test('changing a bill after export asks to update the calendar', async ({ page }) => {
    await boot(page, { state: withBills() });
    await page.goto('./#settings/reminders');
    await page.getByRole('button', { name: 'Add bills to calendar' }).click();
    await expectToast(page, 'Calendar file ready');
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('ledger.v1'));
      s.bills[0].amount = 700;
      localStorage.setItem('ledger.v1', JSON.stringify(s));
    });
    await page.goto('./#home');
    await page.reload();
    await expect(page.locator('.nudge')).toContainText('Your bills changed');
    await tab(page, 'bills');
    await expect(page.locator('.status-pill')).toContainText('Calendar is out of date');
    await page.goto('./#home');
    await page.locator('.nudge').click();
    await expectToast(page, 'Calendar file ready');
    await expect(page.locator('.nudge', { hasText: 'Your bills changed' })).toHaveCount(0);
  });

  test('calendar time follows the reminder time setting', async ({ page }) => {
    await boot(page, { state: withBills({ settings: { remindTime: '07:30' } }) });
    await page.goto('./#settings/reminders');
    await page.getByRole('button', { name: 'Add bills to calendar' }).click();
    await expectToast(page, 'Calendar file ready');
    const ics = (await page.evaluate(() => window.__shared))[0].text;
    expect(ics).toContain('TRIGGER:-PT2430M'); // 2*1440 - 450
    expect(ics).toContain('TRIGGER:PT450M');
  });

  test('notifications: enable, test, badge and the once-a-day alert on open', async ({ page, context, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright WebKit cannot grant notification permission');
    await context.grantPermissions(['notifications']);
    await boot(page, { state: withBills(), standalone: true });
    // A due bill on open produces one summary notification.
    const notes = async () => page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return (await reg.getNotifications()).map((n) => ({ title: n.title, body: n.body, tag: n.tag }));
    });
    await expect.poll(notes, { timeout: 15_000 }).toEqual([{ title: 'Phone €20.00 needs paying', body: 'Phone €20.00', tag: 'ledger-due' }]);
    let st = await getState(page);
    expect(st.notified['local:2026-11-25']).toBeTruthy();

    // Opening again the same day does not alert again.
    await page.evaluate(async () => { for (const n of await (await navigator.serviceWorker.ready).getNotifications()) n.close(); });
    await page.reload();
    await expect(page.locator('#view .top')).toBeVisible();
    await page.waitForTimeout(500);
    expect(await notes()).toEqual([]);

    await page.goto('./#settings/reminders');
    await expect(page.locator('.status-line.ok')).toContainText('Notifications are on');
    await page.getByRole('button', { name: 'Send a test' }).click();
    await expect.poll(notes, { timeout: 15_000 }).toContainEqual(expect.objectContaining({ title: 'Reminders are on', tag: 'ledger-test' }));

    // The service worker keeps a copy of what is due for empty pushes.
    const cached = await page.evaluate(async () => (await (await caches.open('ledger-state')).match('state/reminders.json')).json());
    expect(cached.badge).toBe(1);
    expect(cached.due[0].line).toBe('Phone €20.00');
  });

  test('settings shows install steps on iPhone Safari outside the home screen', async ({ page }) => {
    await boot(page, { state: withBills() });
    await page.goto('./#settings/reminders');
    await expect(page.locator('.callout')).toContainText('Install the app to get notifications');
    await expect(page.locator('.callout')).toContainText('Add to Home Screen');
  });

  test('push: connect sends the subscription and the reminder schedule', async ({ page, context, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright WebKit cannot grant notification permission');
    await context.grantPermissions(['notifications']);
    const calls = [];
    await page.route('https://push.example.dev/**', async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const body = req.postData() ? JSON.parse(req.postData()) : null;
      calls.push({ method: req.method(), path: url.pathname, auth: req.headers().authorization, body });
      if (url.pathname === '/vapid') return route.fulfill({ json: { publicKey: 'BNLScfIkZEdrv5z7z2MsKrnIxNfMyU1J4zzOPokTvaS_fqnnxcOBLvPsbqqS-GcG68camFlBZDJKxjC_EbmOwT0' } });
      if (url.pathname === '/test') return route.fulfill({ json: { ok: true } });
      return route.fulfill({ json: { ok: true } });
    });
    // Headless browsers cannot reach a real push service, so stand in a fake subscription.
    await page.addInitScript(() => {
      const fake = { endpoint: 'https://web.push.apple.com/fake', toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'BPfake', auth: 'authfake' } }; }, unsubscribe: async () => true };
      PushManager.prototype.subscribe = async () => fake;
      PushManager.prototype.getSubscription = async () => (window.__subscribed ? fake : null);
      const orig = PushManager.prototype.subscribe;
      PushManager.prototype.subscribe = async (...a) => { window.__subscribed = true; return orig(...a); };
    });
    await boot(page, { state: withBills({ settings: { remindTime: '09:00' } }), standalone: true });
    await page.goto('./#settings/reminders');
    await expect(page.locator('[data-push-url]')).toHaveValue('https://tracker-push.femisteve02.workers.dev');
    await page.locator('[data-push-url]').fill('https://push.example.dev/');
    await page.getByRole('button', { name: 'Connect' }).click();
    await expectToast(page, 'Push reminders connected');

    const reg = calls.find((c) => c.path === '/register');
    expect(reg.auth).toMatch(/^Bearer [a-f0-9]{48}$/);
    expect(reg.body.deviceId).toMatch(/^[a-f0-9]{24}$/);
    expect(reg.body.subscription.endpoint).toBe('https://web.push.apple.com/fake');
    expect(reg.body.tz).toBe('Europe/Vilnius');
    const sync = calls.filter((c) => c.path === '/sync').at(-1);
    expect(sync.body.badge).toBe(1);
    expect(sync.body.bills.map((b) => b.name)).toEqual(['Rent, flat', 'Phone']);
    const rentBefore = sync.body.items.find((i) => i.id === 'bill1:2026-11-30:before');
    expect(rentBefore).toMatchObject({ fireAt: '2026-11-28T07:00:00.000Z', title: 'Rent, flat is due in 2 days', body: '€650.00 due 30 Nov.', url: './?bill=bill1' });
    expect(sync.body.items.find((i) => i.id === 'bill1:2026-12-30:due')).toBeTruthy();
    // Past reminders are not sent; the overdue one's "still unpaid" alert was yesterday.
    expect(sync.body.items.every((i) => new Date(i.fireAt) > new Date('2026-11-25T02:00:00Z'))).toBe(true);

    await expect(page.locator('.status-line.ok', { hasText: 'Connected' })).not.toContainText('never');
    await page.getByRole('button', { name: 'Send test push' }).click();
    await expectToast(page, 'Test sent');
    expect(calls.some((c) => c.path === '/test')).toBe(true);

    // Hiding amounts removes them from what is sent.
    await page.locator('label.toggle', { hasText: 'Hide amounts in alerts' }).click();
    await expect.poll(() => calls.filter((c) => c.path === '/sync').at(-1).body.items[0].body).not.toContain('€');
    expect(calls.filter((c) => c.path === '/sync').at(-1).body.bills[0].amount).toBeNull();

    // Paying a bill re-sends the schedule without that bill's November reminders.
    await page.goto('./#bills');
    await page.locator('.bill-row', { hasText: 'Phone' }).locator('.pay-btn').click();
    await expect.poll(() => calls.filter((c) => c.path === '/sync').at(-1).body.badge).toBe(0);

    await page.goto('./#settings/reminders');
    await page.getByRole('button', { name: 'Disconnect push server' }).click();
    await expectToast(page, 'Push server disconnected');
    expect(calls.at(-1)).toMatchObject({ method: 'DELETE', path: '/device' });
    expect((await getState(page)).settings.push.enabled).toBe(false);
  });

  test('push: a wrong server address shows a clear error', async ({ page, context, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright WebKit cannot grant notification permission');
    await context.grantPermissions(['notifications']);
    await page.route('https://nothing.example.dev/**', (r) => r.fulfill({ status: 404, body: '' }));
    await boot(page, { state: withBills(), standalone: true });
    await page.goto('./#settings/reminders');
    await page.locator('[data-push-url]').fill('http://insecure.example');
    await page.getByRole('button', { name: 'Connect' }).click();
    await expectToast(page, 'Use the https:// address');
    await page.locator('[data-push-url]').fill('https://nothing.example.dev');
    await page.getByRole('button', { name: 'Connect' }).click();
    await expectToast(page, 'Could not reach the push server');
    expect((await getState(page)).settings.push.enabled).toBe(false);
  });
});
