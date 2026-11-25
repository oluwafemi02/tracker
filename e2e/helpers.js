// Shared setup for the end-to-end tests.
import { test as base, expect } from '@playwright/test';

// "Now" for every test unless a test changes it: Wed 25 Nov 2026, 10:00 in Vilnius.
export const NOW = new Date('2026-11-25T10:00:00+02:00');

export const test = base.extend({
  // Collect page errors and console errors; fail the test if any appear.
  errors: [async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      // Exchange-rate lookups may be blocked by the network; the app falls back to manual rates.
      if (/frankfurter|ERR_TUNNEL|ERR_NAME|Failed to load resource/i.test(t)) return;
      errors.push(`console: ${t}`);
    });
    await use(errors);
    expect(errors, 'no errors in the page').toEqual([]);
  }, { auto: true }],
});

export { expect };

/**
 * Open the app with seeded localStorage and a fixed clock.
 * opts.state  -> written to ledger.v1 (the new app's state)
 * opts.legacy -> object of old-app keys
 */
export async function boot(page, { state, legacy, now = NOW, path = '', shareCapture = true, rate, standalone = false } = {}) {
  await page.clock.setFixedTime(now);
  const data = {};
  if (legacy) Object.assign(data, legacy);
  if (state) data['ledger.v1'] = JSON.stringify(state);
  await page.addInitScript(({ data, shareCapture, standalone }) => {
    if (!localStorage.getItem('__e2e')) {
      localStorage.clear();
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
      localStorage.setItem('__e2e', '1');
    }
    if (shareCapture) {
      // The iPhone path shares files through the share sheet; capture what would be shared.
      window.__shared = [];
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (d) => { for (const f of d.files || []) window.__shared.push({ name: f.name, type: f.type, text: await f.text() }); },
      });
    }
    // Opened from the home screen (as an installed app).
    if (standalone) Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
  }, { data, shareCapture, standalone });
  // Exchange rates: answer from a fixed table so tests do not depend on the network.
  await page.route(/frankfurter\.(dev|app)/, (route) => {
    const u = new URL(route.request().url());
    const from = u.searchParams.get('base') || u.searchParams.get('from');
    const to = u.searchParams.get('symbols') || u.searchParams.get('to');
    const table = { 'USD>EUR': 0.92, 'NGN>EUR': 0.00058, 'GBP>EUR': 1.17, 'EUR>NGN': 1724, ...(rate || {}) };
    const r = table[`${from}>${to}`];
    return r ? route.fulfill({ json: { base: from, rates: { [to]: r } } }) : route.fulfill({ status: 404, body: '' });
  });
  await page.goto(path || './');
  await expect(page.locator('#view .top')).toBeVisible();
}

export const getState = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('ledger.v1')));

export async function setClock(page, iso) {
  await page.clock.setFixedTime(new Date(iso));
  // The app re-checks dates when it comes back to the foreground.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

export const sheet = (page) => page.locator('.sheet-wrap.open .sheet').last();

// The confirm step that slides up over a sheet.
export const confirmButton = (page, name) => page.locator('.sheet-wrap.open .confirm').getByRole('button', { name, exact: true });

export async function closeSheet(page) {
  await sheet(page).locator('.sheet-head [data-close]').click();
  await expect(page.locator('.sheet-wrap')).toHaveCount(0);
}

export async function tab(page, name) {
  await page.locator(`.tabbar [data-tab="${name}"]`).click();
  await expect(page.locator('#view')).toHaveAttribute('data-route', name);
}

export async function expectToast(page, text) {
  await expect(page.locator('#toast.show')).toContainText(text);
}

export async function clickToastAction(page) {
  await page.locator('#toast.show button').click();
}

// Minimal state builder. The app fills in anything left out.
export function state({ settings = {}, bills = [], expenses = [], trips = [], tripExpenses = [] } = {}) {
  return {
    version: 1,
    settings: { currency: 'EUR', monthlyBudget: 0, theme: 'system', remindDays: 2, remindTime: '09:00', migratedAt: '2026-11-01T00:00:00Z', ...settings },
    bills: bills.map((b, i) => ({
      id: `bill${i + 1}`, currency: 'EUR', category: 'other', frequency: 'monthly', remindDays: 2, autopay: false, active: true,
      history: [], notes: '', endDate: null, anchorDay: Number(b.nextDue.slice(8)), startDate: b.nextDue, ...b,
    })),
    expenses: expenses.map((e, i) => ({ id: `exp${i + 1}`, currency: 'EUR', category: 'groceries', note: '', person: '', createdAt: `2026-11-01T0${i % 10}:00:00Z`, baseAmount: e.amount, ...e })),
    trips: trips.map((t, i) => ({ id: `trip${i + 1}`, currency: 'EUR', budget: 0, people: ['Me'], countInMonthly: false, closed: false, destination: '', ...t })),
    tripExpenses: tripExpenses.map((e, i) => ({ id: `tx${i + 1}`, currency: 'EUR', split: true, countInMonthly: false, note: '', payer: 'Me', tripAmount: e.amount, baseAmount: e.amount, ...e })),
  };
}
