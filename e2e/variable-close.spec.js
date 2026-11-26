import { test, expect, boot, getState, expectToast, tab, sheet, state } from './helpers.js';

const electricity = (extra = {}) => ({
  name: 'Electricity', amount: 60, nextDue: '2026-11-25', category: 'utilities', variable: true,
  history: [{ due: '2026-09-25', paidOn: '2026-09-25', amount: 72.4 }, { due: '2026-10-25', paidOn: '2026-10-25', amount: 55.1 }],
  ...extra,
});

test.describe('Bills whose amount changes', () => {
  test('set up in the bill form', async ({ page }) => {
    await boot(page, {});
    await tab(page, 'bills');
    await page.getByRole('button', { name: 'Add your first bill' }).click();
    const s = sheet(page);
    await s.locator('input[name="name"]').fill('Water');
    await s.locator('label.toggle', { hasText: 'Amount changes each time' }).click();
    await expect(s.locator('input[name="amount"]')).toHaveAttribute('placeholder', 'Usual amount');
    await s.locator('input[name="amount"]').fill('25');
    await s.getByRole('button', { name: 'Add bill' }).click();
    expect((await getState(page)).bills[0]).toMatchObject({ name: 'Water', amount: 25, variable: true });
    await expect(page.locator('.bill-row', { hasText: 'Water' })).toContainText('≈ €25.00');
  });

  test('Paid asks for the amount, filled in with last time', async ({ page }) => {
    await boot(page, { state: state({ bills: [electricity()] }) });
    const row = page.locator('.bill-row', { hasText: 'Electricity' }).first();
    await expect(row).toContainText('≈ €63.75'); // average of 72.40 and 55.10
    await row.locator('.pay-btn').click();
    const s = sheet(page);
    await expect(s.locator('.sheet-title')).toHaveText('Pay Electricity');
    await expect(s).toContainText('Last time €55.10, usually about €63.75');
    await expect(s.locator('input[name="amount"]')).toHaveValue('55.10');
    await s.locator('input[name="amount"]').fill('68,30');
    await s.getByRole('button', { name: 'Mark as paid' }).click();
    await expectToast(page, 'Electricity paid');
    const st = await getState(page);
    expect(st.expenses[0]).toMatchObject({ amount: 68.3, note: 'Electricity' });
    expect(st.bills[0].history.at(-1).amount).toBe(68.3);
    expect(st.bills[0].nextDue).toBe('2026-12-25');

    // Bill details offer "Enter amount paid" instead of a fixed amount.
    await tab(page, 'bills');
    await page.locator('.bill-row', { hasText: 'Electricity' }).click();
    await expect(sheet(page)).toContainText('Amount changes each time, last €68.30');
    await expect(sheet(page).getByRole('button', { name: 'Enter amount paid' })).toBeVisible();
  });

  test('autopay logs the estimate and asks to confirm the real amount', async ({ page }) => {
    await boot(page, { state: state({ bills: [electricity({ nextDue: '2026-11-24', autopay: true })] }) });
    await expectToast(page, 'Logged 1 automatic payment');
    await expect(page.locator('.nudge', { hasText: 'Electricity was logged at the usual amount' })).toBeVisible();
    await expect(page.locator('.tx-row', { hasText: 'Electricity' })).toContainText('Estimate');
    await page.locator('.nudge', { hasText: 'Electricity was logged' }).click();
    const s = sheet(page);
    await expect(s.locator('input[type="text"]')).toHaveValue('63.75');
    await s.locator('input[type="text"]').fill('70.15');
    await s.getByRole('button', { name: 'Save amounts' }).click();
    await expectToast(page, 'Amount saved');
    const st = await getState(page);
    expect(st.expenses[0]).toMatchObject({ amount: 70.15, amountEstimated: false });
    expect(st.bills[0].history.at(-1).amount).toBe(70.15);
    await expect(page.locator('.nudge', { hasText: 'logged at the usual amount' })).toHaveCount(0);
  });
});

test.describe('Close the month', () => {
  test('add the spending you did not log, then change or remove it', async ({ page }) => {
    await boot(page, { state: state({ settings: { monthlyBudget: 3000 }, expenses: [{ amount: 420, category: 'groceries', note: 'Rimi', date: '2026-11-10' }] }) });
    await tab(page, 'activity');
    await page.getByRole('button', { name: 'Spent more than this? Close the month' }).click();
    const s = sheet(page);
    await expect(s.locator('.sheet-title')).toHaveText('Close November');
    await expect(s).toContainText('You logged €420.00 in November');
    await s.getByRole('button', { name: /The whole budget/ }).click();
    await expect(s.locator('[data-diff]')).toHaveText('Adds €2,580.00 as unlogged spending');
    await s.locator('input[name="real"]').fill('300');
    await s.getByRole('button', { name: 'Save' }).click();
    await expect(s.locator('.form-error')).toContainText('less than you logged (€420.00)');
    await s.locator('input[name="real"]').fill('3000');
    await s.getByRole('button', { name: 'Save' }).click();
    await expectToast(page, 'Added €2,580.00 as unlogged spending');
    await expect(page.locator('.hero-amount')).toHaveText('€3,000.00');
    await expect(page.locator('.cat-bar', { hasText: 'Unlogged spending' })).toContainText('€2,580.00');

    // Home shows the budget as used up.
    await tab(page, 'home');
    await expect(page.locator('.hero-amount')).toHaveText('€0.00');

    // Change it from the entry itself.
    await tab(page, 'activity');
    await page.locator('.tx-row', { hasText: 'Unlogged spending' }).click();
    await expect(sheet(page)).toContainText('plus €2,580.00 of unlogged spending added before');
    await sheet(page).locator('input[name="real"]').fill('2900');
    await sheet(page).getByRole('button', { name: 'Save' }).click();
    let st = await getState(page);
    expect(st.expenses.filter((e) => e.source === 'close').map((e) => e.amount)).toEqual([2480]);

    await page.getByRole('button', { name: 'Change unlogged spending' }).click();
    await sheet(page).getByRole('button', { name: 'Remove' }).click();
    await expectToast(page, 'Unlogged spending removed');
    st = await getState(page);
    expect(st.expenses.filter((e) => e.source === 'close')).toEqual([]);
  });

  test('a past month can be closed too', async ({ page }) => {
    await boot(page, { state: state({ expenses: [{ amount: 100, category: 'dining', date: '2026-10-05' }] }) });
    await tab(page, 'activity');
    await page.locator('[aria-label="Previous month"]').click();
    await page.getByRole('button', { name: /Close the month/ }).click();
    await sheet(page).locator('input[name="real"]').fill('1250');
    await sheet(page).getByRole('button', { name: 'Save' }).click();
    const e = (await getState(page)).expenses.find((x) => x.source === 'close');
    expect(e).toMatchObject({ amount: 1150, date: '2026-10-31', closeMonth: '2026-10' });
  });
});
