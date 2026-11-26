import { test, expect, boot, getState, expectToast, tab, sheet, state } from './helpers.js';

// Fixed clock: Wed 25 Nov 2026.
const dining = (amount, date, note = '') => ({ amount, date, category: 'dining', note });

test.describe('Category limits', () => {
  test('set a limit, get an alert at 80%, see it on Home and Activity', async ({ page }) => {
    await boot(page, { state: state({ expenses: [dining(120, '2026-11-10'), dining(30, '2026-11-14'), dining(70, '2026-10-12')] }) });
    await tab(page, 'activity');
    await page.getByRole('button', { name: 'Set limits for categories' }).click();
    const s = sheet(page);
    await expect(s.locator('.sheet-title')).toHaveText('Category limits');
    const row = s.locator('.limit-edit li', { hasText: 'Dining' });
    await expect(row).toContainText('€150.00 this month');
    await row.locator('input').fill('200');
    await s.getByRole('button', { name: 'Save limits' }).click();
    await expectToast(page, '1 limit saved');
    expect((await getState(page)).limits).toEqual({ dining: 200 });
    await expect(page.locator('.cat-bar', { hasText: 'Dining' })).toContainText('of €200');

    // 150 + 15 = 165, 82%: one alert, and the Undo toast stays.
    await page.locator('.fab').click();
    const e = sheet(page);
    await e.locator('input[name="amount"]').fill('15');
    await e.locator('label.chip[data-cat]', { hasText: 'Dining' }).click();
    await e.getByRole('button', { name: 'Add expense' }).click();
    await expect(page.locator('#notice.show')).toHaveText('Dining is at 82% of its limit: €165.00 of €200.00, €35.00 left');
    await expect(page.locator('#notice')).toHaveClass(/notice-near/);
    await expectToast(page, 'Added €15.00');
    await expect(page.locator('.cat-bar.lv-near', { hasText: 'Dining' })).toBeVisible();

    await tab(page, 'home');
    const block = page.locator('.block', { hasText: 'Close to the limit' });
    await expect(block.locator('.limit-row.lv-near')).toContainText('€35.00 left');

    // Going over: a second alert.
    await page.locator('.fab').click();
    await sheet(page).locator('input[name="amount"]').fill('50');
    await sheet(page).locator('label.chip[data-cat]', { hasText: 'Dining' }).click();
    await sheet(page).getByRole('button', { name: 'Add expense' }).click();
    await expect(page.locator('#notice.show')).toHaveText('Dining is over its limit: €215.00 of €200.00 this month');
    await expect(block.locator('.limit-row.lv-over')).toContainText('€15.00 over');

    // Tapping the row shows this month's Dining in Activity.
    await block.locator('.limit-row').click();
    await expect(page.locator('#view')).toHaveAttribute('data-route', 'activity');
    await expect(page.locator('.filter-pill')).toContainText('Showing Dining');
  });

  test('limits in Settings', async ({ page }) => {
    await boot(page, { state: { ...state({}), limits: { shopping: 150 } } });
    await page.locator('.gear').click();
    const sec = page.locator('#set-limits');
    await expect(sec).toContainText('Shopping');
    await expect(sec).toContainText('€150.00 a month');
    await sec.getByRole('button', { name: 'Change limits' }).click();
    await sheet(page).locator('.limit-edit li', { hasText: 'Shopping' }).locator('input').fill('');
    await sheet(page).getByRole('button', { name: 'Save limits' }).click();
    await expectToast(page, 'Limits removed');
    expect((await getState(page)).limits).toEqual({});
  });
});

test.describe('Bill price changes', () => {
  const netflix = { name: 'Netflix', amount: 13.99, nextDue: '2026-11-25', category: 'subscriptions' };

  test('paying a different amount offers to update the bill', async ({ page }) => {
    await boot(page, { state: state({ bills: [netflix] }) });
    await page.locator('.bill-row', { hasText: 'Netflix' }).first().click();
    await sheet(page).getByRole('button', { name: 'Change amount or date' }).click();
    const pay = page.locator('.sheet-wrap.open .sheet', { has: page.locator('.sheet-title', { hasText: 'Pay Netflix' }) });
    await expect(pay).toBeVisible();
    await pay.locator('input[name="amount"]').fill('15.99');
    await pay.getByRole('button', { name: 'Mark as paid' }).click();
    const ask = page.locator('.sheet-wrap.open .sheet', { has: page.locator('.sheet-title', { hasText: 'Did Netflix go up?' }) });
    await expect(ask).toContainText('You paid €15.99. The bill is set to €13.99.');
    await ask.getByRole('button', { name: 'Update to €15.99' }).click();
    await expectToast(page, 'Netflix is now €15.99');
    const st = await getState(page);
    expect(st.bills[0].amount).toBe(15.99);
    expect(st.bills[0].priceChanges).toEqual([{ date: '2026-11-25', from: 13.99, to: 15.99 }]);
    expect(st.expenses[0].amount).toBe(15.99);
    await tab(page, 'bills');
    await page.locator('.bill-row', { hasText: 'Netflix' }).click();
    await expect(sheet(page)).toContainText('Price changed from €13.99 on 25 Nov');
    await expect(sheet(page).locator('.hero-amount')).toHaveText('€15.99');
  });

  test('just this time keeps the bill amount; editing the payment also asks', async ({ page }) => {
    await boot(page, { state: state({ bills: [netflix] }) });
    await page.locator('.bill-row', { hasText: 'Netflix' }).first().locator('.pay-btn').click();
    await expectToast(page, 'Netflix paid');
    await expect(page.locator('.sheet-wrap')).toHaveCount(0);
    // Fix the amount on the logged payment afterwards (a one-off late fee).
    await page.locator('.tx-row', { hasText: 'Netflix' }).click();
    await sheet(page).locator('input[name="amount"]').fill('18.99');
    await sheet(page).getByRole('button', { name: 'Save changes' }).click();
    const ask = page.locator('.sheet-wrap.open .sheet', { has: page.locator('.sheet-title', { hasText: 'Did Netflix go up?' }) });
    await ask.getByRole('button', { name: 'Just this time, keep €13.99' }).click();
    await expect(page.locator('.sheet-wrap')).toHaveCount(0);
    const st = await getState(page);
    expect(st.bills[0].amount).toBe(13.99);
    expect(st.bills[0].history[0].amount).toBe(18.99);
  });
});

test.describe('Monthly summary', () => {
  const recapState = (settings = {}) => state({
    settings: { monthlyBudget: 2450, ...settings },
    expenses: [
      { amount: 100, date: '2026-10-05', category: 'groceries' },
      { amount: 118, date: '2026-11-05', category: 'groceries' },
      { amount: 2022, date: '2026-11-01', category: 'rent' },
    ],
  });

  test('scheduled for the 1st with the push reminders', async ({ page }) => {
    await boot(page, { state: recapState() });
    const items = await page.evaluate(async () => (await import('./js/reminders.js')).reminderSchedule());
    const it = items.find((i) => i.id === 'summary:2026-11');
    expect(it).toMatchObject({ title: 'November: €2,140.00 spent', body: '€310.00 under budget, Groceries up 18% on October.', url: './?tab=activity&month=2026-11', solo: true });
    expect(new Date(it.fireAt).toISOString()).toBe(new Date('2026-12-01T09:00:00+02:00').toISOString());
  });

  test('shown on Home in the first week, opens the month', async ({ page }) => {
    await boot(page, { state: recapState(), now: new Date('2026-12-02T10:00:00+02:00') });
    const n = page.locator('.nudge', { hasText: 'November: €2,140.00 spent' });
    await expect(n).toContainText('€310.00 under budget, Groceries up 18% on October.');
    await n.click();
    await expect(page.locator('#view')).toHaveAttribute('data-route', 'activity');
    await expect(page.locator('.top-title')).toHaveText('November');
    await tab(page, 'home');
    await expect(page.locator('.nudge', { hasText: 'November:' })).toHaveCount(0);
    expect((await getState(page)).settings.summarySeen).toBe('2026-11');
  });

  test('the notification link opens that month; the toggle turns it off', async ({ page }) => {
    await boot(page, { state: recapState(), now: new Date('2026-12-01T09:05:00+02:00'), path: './?tab=activity&month=2026-11' });
    await expect(page.locator('#view')).toHaveAttribute('data-route', 'activity');
    await expect(page.locator('.top-title')).toHaveText('November');
    await page.goto('./#home');
    await expect(page.locator('.nudge', { hasText: 'November:' })).toHaveCount(0);
  });

  test('can be turned off', async ({ page }) => {
    await boot(page, { state: recapState(), now: new Date('2026-12-02T10:00:00+02:00') });
    await page.locator('.gear').click();
    await page.locator('label.toggle', { hasText: 'Monthly summary' }).click();
    await expectToast(page, 'Saved');
    expect((await getState(page)).settings.monthlySummary).toBe(false);
    await tab(page, 'home');
    await expect(page.locator('.nudge', { hasText: 'November:' })).toHaveCount(0);
  });
});

test.describe('Trip savings', () => {
  const japan = { name: 'Japan', destination: 'Tokyo', startDate: '2027-06-12', endDate: '2027-06-26', currency: 'JPY' };

  test('set a goal, put money aside from Home, see progress on the card', async ({ page }) => {
    await boot(page, { state: state({ trips: [japan] }) });
    await tab(page, 'trips');
    await page.locator('.trip-card', { hasText: 'Japan' }).click();
    await page.getByRole('button', { name: /Save up for this trip/ }).click();
    const s = sheet(page);
    await s.locator('input[name="target"]').fill('1800');
    await expect(s.locator('[data-plan]')).toHaveText('About €258.00 a month for 7 months gets you there by 12 Jun 2027.');
    await s.locator('select[name="day"]').selectOption('20');
    await s.getByRole('button', { name: 'Start saving' }).click();
    await expectToast(page, 'Saving for Japan');
    const block = page.locator('.savings');
    await expect(block.locator('.save-amt')).toHaveText('€0.00 of €1,800.00 saved');
    await expect(block).toContainText('Put aside about €258.00 a month to reach it by 12 Jun 2027. Reminder on the 20th of each month.');

    // The 20th has passed this month, so Home asks to put it aside.
    await tab(page, 'home');
    const nudge = page.locator('.savings-nudge');
    await expect(nudge).toContainText('Put aside €258.00 for Japan');
    await nudge.getByRole('button', { name: 'Done' }).click();
    await expectToast(page, 'Put aside €258.00 for Japan');
    await expect(page.locator('.savings-nudge')).toHaveCount(0);
    expect((await getState(page)).trips[0].savings).toMatchObject({ target: 1800, remind: true, day: 20, deposits: [{ amount: 258, date: '2026-11-25' }] });

    await tab(page, 'trips');
    const card = page.locator('.trip-card', { hasText: 'Japan' });
    await expect(card.locator('.trip-card-amt')).toHaveText('€258.00 of €1,800 saved');
    await expect(card).toContainText('About €257.00 a month to go');

    // Add money by hand, then edit it.
    await card.click();
    await page.getByRole('button', { name: 'Add money' }).click();
    await sheet(page).locator('input[name="amount"]').fill('100');
    await sheet(page).getByRole('button', { name: 'Add to savings' }).click();
    await expectToast(page, 'Put aside €100.00');
    await expect(page.locator('.savings .save-amt')).toHaveText('€358.00 of €1,800.00 saved');
    await page.locator('.deposits .tx-row').first().click();
    await sheet(page).getByRole('button', { name: 'Delete' }).click();
    await expectToast(page, 'Removed');
    await expect(page.locator('.savings .save-amt')).toHaveText('€258.00 of €1,800.00 saved');
  });

  test('monthly reminders go to the push server; the notification opens the trip', async ({ page }) => {
    const st = state({ trips: [{ ...japan, savings: { target: 1800, monthly: 200, remind: true, day: 28, deposits: [] } }] });
    await boot(page, { state: st });
    const items = await page.evaluate(async () => (await import('./js/reminders.js')).reminderSchedule());
    const saves = items.filter((i) => i.id.startsWith('save:'));
    expect(saves.map((i) => i.id)).toEqual(['save:trip1:2026-11', 'save:trip1:2026-12', 'save:trip1:2027-01', 'save:trip1:2027-02']);
    expect(saves[0]).toMatchObject({ title: 'Put aside €200.00 for Japan', body: '€0.00 of €1,800.00 saved. Japan starts 12 Jun 2027.', url: './?trip=trip1' });

    await page.goto('./?trip=trip1');
    await expect(page.locator('#view')).toHaveAttribute('data-route', 'trip');
    await expect(page.locator('.top-title')).toHaveText('Japan');
    await expect(page.locator('.savings')).toContainText('Put aside €200.00 a month');
  });

  test('remove the goal', async ({ page }) => {
    await boot(page, { state: state({ trips: [{ ...japan, savings: { target: 900, monthly: 0, remind: false, day: 1, deposits: [{ id: 's1', amount: 900, date: '2026-11-01' }] } }] }) });
    await page.goto('./#trip/trip1');
    await expect(page.locator('.savings')).toContainText('Goal reached.');
    await expect(page.getByRole('button', { name: 'Add money' })).toHaveCount(0);
    await page.locator('.savings').getByRole('button', { name: 'Edit goal' }).click();
    await sheet(page).getByRole('button', { name: 'Remove goal' }).click();
    await page.locator('.sheet-wrap.open .confirm').getByRole('button', { name: 'Remove', exact: true }).click();
    await expectToast(page, 'Savings goal removed');
    await expect(page.getByRole('button', { name: /Save up for this trip/ })).toBeVisible();
  });
});
