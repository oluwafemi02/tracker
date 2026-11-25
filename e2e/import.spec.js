import { test, expect, boot, getState, expectToast, tab, sheet, confirmButton } from './helpers.js';
import { legacy } from '../test/legacy-fixture.js';

test.describe('Import from the old version', () => {
  test('imports old data on first open and leaves the old keys alone', async ({ page }) => {
    await boot(page, { legacy });
    await expectToast(page, 'Imported 6 expenses, 4 bills, 2 trips');
    const s = await getState(page);
    expect(s.expenses).toHaveLength(6);
    expect(s.bills.map((b) => b.name).sort()).toEqual(['Gym', 'Home insurance', 'Netflix', 'Rent']);
    expect(s.trips).toHaveLength(2);
    expect(s.tripExpenses).toHaveLength(3);
    expect(s.settings.monthlyBudget).toBe(2500);
    expect(s.settings.migratedAt).toBeTruthy();
    const old = await page.evaluate(() => localStorage.getItem('familyExpenses'));
    expect(old).toBe(legacy.familyExpenses);

    // Imported data shows up in the screens.
    await tab(page, 'bills');
    await expect(page.locator('.bill-row', { hasText: 'Rent' })).toContainText('Due in 5 days');
    await expect(page.locator('.block', { hasText: 'Paused or finished' }).locator('.bill-row')).toHaveCount(2);
    await tab(page, 'trips');
    await expect(page.locator('.trip-card')).toHaveCount(2);
  });

  test('does not import again on the next open', async ({ page }) => {
    await boot(page, { legacy });
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('ledger.v1'));
      s.expenses = s.expenses.slice(0, 1);
      localStorage.setItem('ledger.v1', JSON.stringify(s));
    });
    await page.reload();
    await expect(page.locator('#view .top')).toBeVisible();
    expect((await getState(page)).expenses).toHaveLength(1);
  });

  test('"Import again" in Settings replaces data from the old keys', async ({ page }) => {
    await boot(page, { legacy });
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('ledger.v1'));
      s.expenses = [];
      localStorage.setItem('ledger.v1', JSON.stringify(s));
    });
    await page.goto('./#settings');
    await page.getByRole('button', { name: 'Import again from the old version' }).click();
    await confirmButton(page, 'Import').click();
    await expectToast(page, 'Imported 6 expenses');
    expect((await getState(page)).expenses).toHaveLength(6);
  });

  test('fresh install shows empty states and no import', async ({ page }) => {
    await boot(page, {});
    await expect(page.locator('.empty-title')).toContainText(['Add your regular bills', 'No expenses yet']);
    await expect(page.locator('.hero-amount')).toHaveText('€0.00');
    const s = await getState(page);
    expect(s.expenses).toEqual([]);
    expect(s.settings.migratedAt).toBeNull();
  });
});
