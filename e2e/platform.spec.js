import { test, expect, boot, getState, sheet, state, tab } from './helpers.js';

const basic = () => state({
  settings: { monthlyBudget: 1000 },
  bills: [{ name: 'Phone', amount: 20, nextDue: '2026-11-20' }, { name: 'Rent', amount: 600, nextDue: '2026-11-30', category: 'rent' }],
  expenses: [{ amount: 12.5, category: 'dining', note: 'Lunch', date: '2026-11-24' }],
  trips: [{ name: 'Lisbon', startDate: '2026-11-22', endDate: '2026-11-28', budget: 900, people: ['Me', 'Ada'] }],
});

test.describe('Links and navigation', () => {
  test('a notification link opens the bill', async ({ page }) => {
    await boot(page, { state: basic(), path: './?bill=bill2' });
    await expect(sheet(page).locator('.sheet-title')).toContainText('Rent');
    await expect(page).toHaveURL(/\/tracker\/#bills$/);
  });

  test('home screen shortcut ?add=1 opens a new expense', async ({ page }) => {
    await boot(page, { state: basic(), path: './?add=1' });
    await expect(sheet(page).locator('.sheet-title')).toHaveText('New expense');
  });

  test('?tab=bills opens Bills; back and forward work between tabs', async ({ page }) => {
    await boot(page, { state: basic(), path: './?tab=bills' });
    await expect(page.locator('#view')).toHaveAttribute('data-route', 'bills');
    await tab(page, 'trips');
    await page.locator('.trip-card').click();
    await expect(page.locator('#view')).toHaveAttribute('data-route', 'trip');
    await page.goBack();
    await expect(page.locator('#view')).toHaveAttribute('data-route', 'trips');
    await page.goBack();
    await expect(page.locator('#view')).toHaveAttribute('data-route', 'bills');
    await page.goForward();
    await expect(page.locator('#view')).toHaveAttribute('data-route', 'trips');
  });

  test('unknown routes and missing trips fall back cleanly', async ({ page }) => {
    await boot(page, { state: basic(), path: './#nope' });
    await expect(page.locator('#view')).toHaveAttribute('data-route', 'home');
    await page.goto('./#trip/missing');
    await expect(page.locator('.empty-title')).toHaveText('Trip not found');
  });
});

test.describe('Offline and install', () => {
  test('works offline after the first visit', async ({ page, context }) => {
    await boot(page, { state: basic() });
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload(); // let the service worker take control and fill the cache
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await page.waitForTimeout(500);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('.hero-amount')).toHaveText('€367.50');
    await page.locator('.fab').click();
    await sheet(page).locator('input[name="amount"]').fill('5');
    await sheet(page).locator('.chip', { hasText: 'Groceries' }).first().click();
    await sheet(page).getByRole('button', { name: 'Add expense' }).click();
    expect((await getState(page)).expenses).toHaveLength(2);
    await context.setOffline(false);
  });

  test('manifest and icons are valid for the home screen', async ({ page, request }) => {
    await boot(page, { state: basic() });
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    const manifest = await (await request.get(new URL(href, page.url()).href)).json();
    expect(manifest).toMatchObject({ display: 'standalone', start_url: './', scope: './' });
    for (const icon of manifest.icons) {
      const res = await request.get(new URL(icon.src, page.url()).href);
      expect(res.status(), icon.src).toBe(200);
      expect(res.headers()['content-type']).toContain('image/png');
    }
    const touch = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    expect((await request.get(new URL(touch, page.url()).href)).status()).toBe(200);
  });
});

test.describe('Phone layout', () => {
  for (const width of [320, 390, 430]) {
    test(`no sideways scrolling at ${width}px on any screen`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await boot(page, { state: basic() });
      for (const route of ['#home', '#activity', '#bills', '#trips', '#trip/trip1', '#settings']) {
        await page.goto(`./${route}`);
        await expect(page.locator('#view .top')).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${route} at ${width}px`).toBeLessThanOrEqual(0);
      }
      const sheets = {
        'new expense': async () => { await page.goto('./#home'); await page.locator('.fab').click(); },
        'new bill': async () => { await page.goto('./#bills'); await page.getByRole('button', { name: 'Add bill' }).click(); },
        'bill detail': async () => { await page.goto('./#bills'); await page.locator('.bill-row').first().click(); },
        'edit trip': async () => { await page.goto('./#trip/trip1'); await page.getByRole('button', { name: 'Edit' }).click(); },
        'trip expense': async () => { await page.goto('./#trip/trip1'); await page.locator('.fab').click(); },
      };
      for (const [name, open] of Object.entries(sheets)) {
        await open();
        await expect(sheet(page)).toBeVisible();
        const wide = await page.evaluate(() => {
          const s = document.querySelector('.sheet-wrap.open .sheet');
          const box = s.getBoundingClientRect();
          return [...s.querySelectorAll('input, select, button, .chip')]
            .filter((el) => el.offsetParent !== null && getComputedStyle(el).opacity !== '0')
            .filter((el) => el.getBoundingClientRect().right > box.right + 0.5)
            .map((el) => el.name || el.textContent.trim().slice(0, 20));
        });
        expect(wide, `${name} sheet at ${width}px`).toEqual([]);
        await page.keyboard.press('Escape');
        await expect(page.locator('.sheet-wrap')).toHaveCount(0);
      }
    });
  }

  test('every text field is at least 16px so iPhone does not zoom in', async ({ page }) => {
    await boot(page, { state: basic() });
    const check = async (label) => {
      const small = await page.evaluate(() => [...document.querySelectorAll('input:not([type=radio]):not([type=checkbox]):not([type=file]), select, textarea')]
        .filter((el) => el.offsetParent !== null || el.closest('.chip-date'))
        .map((el) => ({ name: el.name || el.dataset.setting || el.className, size: parseFloat(getComputedStyle(el).fontSize) }))
        .filter((x) => x.size < 16));
      expect(small, label).toEqual([]);
    };
    await page.goto('./#settings');
    await check('settings');
    await page.goto('./#activity');
    await check('activity');
    for (const open of [() => page.locator('.fab').click(), async () => { await tab(page, 'bills'); await page.getByRole('button', { name: 'Add bill' }).click(); }]) {
      await page.goto('./#home');
      await open();
      await expect(sheet(page)).toBeVisible();
      await check('sheet');
      await page.keyboard.press('Escape');
    }
  });

  test('main buttons are big enough to tap', async ({ page }) => {
    await boot(page, { state: basic() });
    const sizes = await page.evaluate(() => [...document.querySelectorAll('.tab, .fab, .pay-btn, .gear')].map((el) => {
      const r = el.getBoundingClientRect();
      return { cls: el.className, w: r.width, h: r.height };
    }));
    for (const s of sizes) {
      expect(s.h, s.cls).toBeGreaterThanOrEqual(32);
      expect(s.w, s.cls).toBeGreaterThanOrEqual(40);
    }
  });

  test('screens render in dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await boot(page, { state: basic() });
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(18, 32, 28)');
  });
});
