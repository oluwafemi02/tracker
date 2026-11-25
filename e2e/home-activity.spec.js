import { test, expect, boot, getState, tab, state } from './helpers.js';

const month = () => state({
  settings: { monthlyBudget: 1000 },
  bills: [
    { name: 'Phone', amount: 20, nextDue: '2026-11-20' },
    { name: 'Rent', amount: 600, nextDue: '2026-11-30', category: 'rent' },
    { name: 'Insurance', amount: 99, nextDue: '2026-12-10' },
  ],
  expenses: [
    { amount: 60, category: 'groceries', note: 'Rimi', date: '2026-11-10' },
    { amount: 40, category: 'dining', note: 'Lunch', date: '2026-11-24' },
    { amount: 25, category: 'dining', note: 'Old', date: '2026-10-15' },
    { amount: 300, category: 'shopping', note: 'Boots', date: '2026-09-02' },
  ],
});

test.describe('Home', () => {
  test('safe-to-spend math after the bills still to come', async ({ page }) => {
    await boot(page, { state: month() });
    await expect(page.locator('.top-title')).toHaveText('November');
    // 1000 - 100 spent - (20 overdue + 600 rent) = 280, over 6 days left (25th to 30th)
    await expect(page.locator('.hero-amount')).toHaveText('€280.00');
    await expect(page.locator('.hero-caption')).toHaveText('left to spend, about €46.67 a day for 6 days');
    await expect(page.locator('.hero-stats dd')).toHaveText(['€100', '€620', '€1,000']);
    await expect(page.locator('.block', { hasText: 'Needs paying' }).locator('.bill-name')).toHaveText(['Phone']);
    await expect(page.locator('.block', { hasText: 'Coming up' }).locator('.bill-name')).toHaveText(['Rent']); // Insurance is 15 days away, outside the 14-day window
    await expect(page.locator('.tx-row .tx-title')).toHaveText(['Lunch', 'Rimi', 'Old', 'Boots']);
  });

  test('month strip has a notch per day, today marked, pins on due days', async ({ page }) => {
    await boot(page, { state: month() });
    await expect(page.locator('.rw-day')).toHaveCount(30);
    await expect(page.locator('.rw-day.past')).toHaveCount(24);
    await expect(page.locator('.rw-day.now')).toHaveCount(1);
    await expect(page.locator('.rw-day').nth(19).locator('.rw-pin.late')).toHaveCount(1); // Phone, 20th, late
    await expect(page.locator('.rw-day').nth(29).locator('.rw-pin')).toHaveCount(1); // Rent, 30th
    await expect(page.locator('.rw-day').nth(29)).toHaveAttribute('title', 'Rent €600.00');
  });

  test('over budget turns the figure red', async ({ page }) => {
    const s = month();
    s.expenses.push({ id: 'big', amount: 500, category: 'shopping', date: '2026-11-12', baseAmount: 500, currency: 'EUR', note: 'TV', createdAt: 'x' });
    await boot(page, { state: s });
    await expect(page.locator('.hero-figure')).toHaveClass(/over/);
    await expect(page.locator('.hero-amount')).toHaveText('€220.00');
    await expect(page.locator('.hero-caption')).toHaveText('over budget after the bills still to come');
  });

  test('no budget yet links to the budget setting', async ({ page }) => {
    const s = month();
    s.settings.monthlyBudget = 0;
    await boot(page, { state: s });
    await expect(page.locator('.hero-caption')).toHaveText('spent so far, with €620.00 in bills still to come');
    await page.getByRole('button', { name: /Set a monthly budget/ }).click();
    await expect(page.locator('#view')).toHaveAttribute('data-route', 'settings');
    await page.locator('[data-setting="monthlyBudget"]').fill('1500');
    await page.locator('[data-setting="monthlyBudget"]').blur();
    await expect.poll(async () => (await getState(page)).settings.monthlyBudget).toBe(1500);
  });
});

test.describe('Activity', () => {
  test('month navigation, trend, categories, filter and search', async ({ page }) => {
    await boot(page, { state: month() });
    await tab(page, 'activity');
    await expect(page.locator('.top-title')).toHaveText('November');
    await expect(page.locator('.hero-amount')).toHaveText('€100.00');
    await expect(page.locator('[aria-label="Next month"]')).toBeDisabled();
    await expect(page.locator('.trend-col')).toHaveCount(6);
    await expect(page.locator('.trend-budget')).toContainText('Budget €1,000');
    await expect(page.locator('.cat-bar .cb-label')).toHaveText([/Groceries/, /Dining/]);

    await page.locator('.cat-bar', { hasText: 'Dining' }).click();
    await expect(page.locator('.tx-row')).toHaveCount(1);
    await expect(page.locator('.filter-pill')).toContainText('Showing Dining');
    await page.locator('.filter-pill').getByRole('button', { name: 'Show all' }).click();
    await expect(page.locator('.tx-row')).toHaveCount(2);

    await page.locator('.search input').fill('rim');
    await expect(page.locator('.tx-row')).toHaveCount(1);
    await expect(page.locator('.tx-row')).toContainText('Rimi');
    await expect(page.locator('.search input')).toBeFocused();
    await page.locator('.search input').fill('zzz');
    await expect(page.locator('.empty-title')).toHaveText('Nothing matches');
    await page.locator('.search input').fill('');

    await page.locator('[aria-label="Previous month"]').click();
    await expect(page.locator('.top-title')).toHaveText('October');
    await expect(page.locator('.hero-amount')).toHaveText('€25.00');
    await page.locator('.trend-col', { hasText: 'Sep' }).click();
    await expect(page.locator('.top-title')).toHaveText('September');
    await expect(page.locator('.hero-amount')).toHaveText('€300.00');
    await expect(page.locator('.day-head').first()).toContainText('Wed, 2 Sep');
  });

  test('empty month invites you to add', async ({ page }) => {
    await boot(page, { state: month() });
    await tab(page, 'activity');
    await page.locator('.trend-col', { hasText: 'Jul' }).click();
    await expect(page.locator('.empty-title')).toHaveText('Nothing logged this month');
  });
});
