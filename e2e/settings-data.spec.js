import { test, expect, boot, getState, expectToast, sheet, state, confirmButton } from './helpers.js';

const data = () => state({
  settings: { monthlyBudget: 1200 },
  bills: [{ name: 'Rent', amount: 600, nextDue: '2026-11-30', category: 'rent', remindDays: 2 }, { name: 'Phone', amount: 20, nextDue: '2026-12-02', remindDays: 0 }],
  expenses: [{ amount: 12.5, category: 'dining', note: 'Lunch, "big" one', date: '2026-11-24' }, { amount: 50, currency: 'USD', baseAmount: 46, category: 'shopping', note: 'Book', date: '2026-11-20' }],
  trips: [{ name: 'Riga', startDate: '2026-08-01', endDate: '2026-08-03' }],
  tripExpenses: [{ tripId: 'trip1', amount: 45, category: 't-food', note: 'Dinner', date: '2026-08-02', payer: 'Ada' }],
});

test.describe('Settings', () => {
  test('budget, currency, reminder timing and apply to all bills', async ({ page }) => {
    await boot(page, { state: data() });
    await page.goto('./#settings');
    await page.locator('[data-setting="monthlyBudget"]').fill('1500,50');
    await page.locator('[data-setting="monthlyBudget"]').blur();
    await expectToast(page, 'Saved');
    await page.locator('[data-setting="remindTime"]').fill('07:45');
    await page.locator('[data-setting="remindTime"]').dispatchEvent('change');
    await page.locator('[data-setting="remindDays"]').selectOption('3');
    await page.getByRole('button', { name: 'Use this timing for all existing bills' }).click();
    await expectToast(page, 'Updated all bills');
    let st = await getState(page);
    expect(st.settings).toMatchObject({ monthlyBudget: 1500.5, remindTime: '07:45', remindDays: 3 });
    expect(st.bills.map((b) => b.remindDays)).toEqual([3, 3]);

    await page.locator('[data-setting="currency"]').selectOption('GBP');
    st = await getState(page);
    expect(st.settings.currency).toBe('GBP');
    await page.goto('./#home');
    await expect(page.locator('.hero-stats')).toContainText('£');
  });

  test('theme switch applies right away and is remembered', async ({ page }) => {
    await boot(page, { state: data() });
    await page.goto('./#settings');
    await page.locator('.segmented label', { hasText: 'Dark' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(18, 32, 28)');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.locator('.segmented label', { hasText: 'Light' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});

test.describe('Your data', () => {
  test('backup, erase everything, restore', async ({ page }) => {
    await boot(page, { state: data() });
    await page.goto('./#settings/data');
    await page.getByRole('button', { name: 'Download backup' }).click();
    await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(1);
    const backup = (await page.evaluate(() => window.__shared))[0];
    expect(backup.name).toBe('tracker-backup-2026-11-25.json');
    const parsed = JSON.parse(backup.text);
    expect(parsed.expenses).toHaveLength(2);
    expect(parsed.bills).toHaveLength(2);
    await expect.poll(async () => (await getState(page)).settings.lastBackupAt).toBeTruthy();

    await page.getByRole('button', { name: 'Erase all data' }).click();
    await confirmButton(page, 'Erase everything').click();
    await expect(page.locator('#view')).toHaveAttribute('data-route', 'home');
    await expect(page.locator('.empty-title').first()).toBeVisible();
    let st = await getState(page);
    expect(st.expenses).toEqual([]);
    expect(st.bills).toEqual([]);

    await page.goto('./#settings/data');
    await page.locator('input[data-restore]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backup.text) });
    await expect(page.locator('.confirm')).toContainText('2 expenses, 2 bills, 1 trips');
    await confirmButton(page, 'Restore').click();
    await expectToast(page, 'Backup restored');
    st = await getState(page);
    expect(st.expenses).toHaveLength(2);
    expect(st.bills.map((b) => b.name)).toEqual(['Rent', 'Phone']);
  });

  test('restore rejects a file that is not a backup', async ({ page }) => {
    await boot(page, { state: data() });
    await page.goto('./#settings/data');
    await page.locator('input[data-restore]').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
    await expectToast(page, 'That file is not a Tracker backup.');
    expect((await getState(page)).expenses).toHaveLength(2);
  });

  test('CSV export has everyday, bill and trip rows with quoting', async ({ page }) => {
    await boot(page, { state: data() });
    await page.goto('./#settings/data');
    await page.getByRole('button', { name: 'Export expenses as CSV' }).click();
    await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(1);
    const csv = (await page.evaluate(() => window.__shared))[0];
    expect(csv.name).toBe('tracker-expenses-2026-11-25.csv');
    const lines = csv.text.split('\n');
    expect(lines[0]).toBe('"Date","Amount","Currency","Amount (EUR)","Category","Note","Type","Trip","Paid by"');
    expect(lines).toContain('"2026-11-24","12.5","EUR","12.5","Dining","Lunch, ""big"" one","Expense","",""');
    expect(lines).toContain('"2026-11-20","50","USD","46","Shopping","Book","Expense","",""');
    expect(lines).toContain('"2026-08-02","45","EUR","45","Food & drink","Dinner","Trip","Riga","Ada"');
  });
});
