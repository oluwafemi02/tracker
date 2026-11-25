import { test, expect, boot, getState, expectToast, clickToastAction, tab, sheet, state, confirmButton } from './helpers.js';

test.describe('Expenses', () => {
  test('add with a comma decimal, shows on Home and Activity', async ({ page }) => {
    await boot(page, { state: state({ settings: { monthlyBudget: 1000 } }) });
    await page.locator('.fab').click();
    const s = sheet(page);
    await expect(s.locator('.sheet-title')).toHaveText('New expense');
    await expect(s.locator('input[name="amount"]')).toBeFocused();
    await s.locator('input[name="amount"]').fill('14,80');
    await s.locator('.chip', { hasText: 'Groceries' }).first().click();
    await s.locator('input[name="note"]').fill('Coffee beans');
    await s.getByRole('button', { name: 'Add expense' }).click();
    await expectToast(page, 'Added €14.80');
    await expect(page.locator('.sheet-wrap')).toHaveCount(0);

    const st = await getState(page);
    expect(st.expenses).toHaveLength(1);
    expect(st.expenses[0]).toMatchObject({ amount: 14.8, baseAmount: 14.8, currency: 'EUR', category: 'groceries', note: 'Coffee beans', date: '2026-11-25' });
    await expect(page.locator('.tx-row').first()).toContainText('Coffee beans');
    await expect(page.locator('.hero-stats')).toContainText('€14.80');
    await expect(page.locator('.hero-amount')).toHaveText('€985.20');

    await tab(page, 'activity');
    await expect(page.locator('.day-group').first()).toContainText('Today');
    await expect(page.locator('.hero-amount')).toHaveText('€14.80');
    await expect(page.locator('.cat-bar', { hasText: 'Groceries' })).toContainText('€14.80');
  });

  test('validates amount and category', async ({ page }) => {
    await boot(page, {});
    await page.locator('.fab').click();
    const s = sheet(page);
    await s.getByRole('button', { name: 'Add expense' }).click();
    await expect(s.locator('.form-error')).toHaveText('Enter an amount above zero.');
    await s.locator('input[name="amount"]').fill('-5');
    await s.getByRole('button', { name: 'Add expense' }).click();
    await expect(s.locator('.form-error')).toHaveText('Enter an amount above zero.');
    await s.locator('input[name="amount"]').fill('5');
    await s.getByRole('button', { name: 'Add expense' }).click();
    await expect(s.locator('.form-error')).toHaveText('Pick a category.');
    expect((await getState(page)).expenses).toHaveLength(0);
  });

  test('Yesterday and Other day set the date', async ({ page }) => {
    await boot(page, {});
    await page.locator('.fab').click();
    let s = sheet(page);
    await s.locator('input[name="amount"]').fill('3');
    await s.locator('.chip', { hasText: 'Dining' }).first().click();
    await s.locator('.chip', { hasText: 'Yesterday' }).click();
    await s.getByRole('button', { name: 'Add expense' }).click();
    await page.locator('.fab').click();
    s = sheet(page);
    await s.locator('input[name="amount"]').fill('4');
    await s.locator('.chip', { hasText: 'Dining' }).first().click();
    await s.locator('input[name="date"]').fill('2026-11-02');
    await expect(s.locator('.chip-date')).toContainText('2 Nov');
    await s.getByRole('button', { name: 'Add expense' }).click();
    const dates = (await getState(page)).expenses.map((e) => e.date).sort();
    expect(dates).toEqual(['2026-11-02', '2026-11-24']);
  });

  test('edit, delete and undo', async ({ page }) => {
    await boot(page, { state: state({ expenses: [{ amount: 20, category: 'dining', note: 'Lunch', date: '2026-11-24' }] }) });
    await page.locator('.tx-row', { hasText: 'Lunch' }).click();
    let s = sheet(page);
    await expect(s.locator('.sheet-title')).toHaveText('Edit expense');
    await expect(s.locator('input[name="amount"]')).toHaveValue('20');
    await expect(s.locator('input[name="category"]:checked')).toHaveValue('dining');
    await s.locator('input[name="amount"]').fill('22.5');
    await s.getByRole('button', { name: 'Save changes' }).click();
    await expectToast(page, 'Changes saved');
    expect((await getState(page)).expenses[0]).toMatchObject({ id: 'exp1', amount: 22.5, baseAmount: 22.5 });

    await page.locator('.tx-row', { hasText: 'Lunch' }).click();
    s = sheet(page);
    await s.getByRole('button', { name: 'Delete' }).click();
    await confirmButton(page, 'Delete').click();
    await expectToast(page, 'Expense deleted');
    expect((await getState(page)).expenses).toHaveLength(0);
    await clickToastAction(page);
    await expect(page.locator('.tx-row', { hasText: 'Lunch' })).toBeVisible();
    expect((await getState(page)).expenses[0].amount).toBe(22.5);
  });

  test('foreign currency converts to EUR and remembers the rate', async ({ page }) => {
    await boot(page, {});
    await page.locator('.fab').click();
    const s = sheet(page);
    await s.locator('input[name="amount"]').fill('50');
    await s.locator('select[name="currency"]').selectOption('USD');
    await expect(s.locator('.convert')).toBeVisible();
    await expect(s.locator('.convert input')).toHaveValue('0.92');
    await expect(s.locator('.convert-out')).toHaveText('≈ €46.00');
    await s.locator('.chip', { hasText: 'Groceries' }).first().click();
    await s.getByRole('button', { name: 'Add expense' }).click();
    const e = (await getState(page)).expenses[0];
    expect(e).toMatchObject({ amount: 50, currency: 'USD', baseAmount: 46 });
    const rates = await page.evaluate(() => JSON.parse(localStorage.getItem('ledger.rates')));
    expect(rates['USD>EUR'].rate).toBe(0.92);
    await expect(page.locator('.tx-row').first()).toContainText('€46.00');
    await expect(page.locator('.tx-row').first()).toContainText('$50.00');
  });

  test('asks for a rate when none can be looked up', async ({ page }) => {
    await boot(page, {});
    await page.locator('.fab').click();
    const s = sheet(page);
    await s.locator('input[name="amount"]').fill('10000');
    await s.locator('select[name="currency"]').selectOption('NGN');
    await s.locator('.chip', { hasText: 'Dining' }).first().click();
    await s.getByRole('button', { name: 'Add expense' }).click();
    await expect(s.locator('.form-error')).toHaveText('Enter the NGN to EUR rate.');
    await s.locator('.convert input').fill('0.00058');
    await s.getByRole('button', { name: 'Add expense' }).click();
    expect((await getState(page)).expenses[0].baseAmount).toBe(5.8);
    // The rate is remembered for next time.
    await page.locator('.fab').click();
    await sheet(page).locator('select[name="currency"]').selectOption('NGN');
    await expect(sheet(page).locator('.convert input')).toHaveValue('0.00058');
  });

  test('new category from the expense sheet, then removed in Settings', async ({ page }) => {
    await boot(page, {});
    await page.locator('.fab').click();
    await sheet(page).locator('input[name="amount"]').fill('35');
    await sheet(page).getByRole('button', { name: '+ New category' }).click();
    const c = sheet(page);
    await c.locator('input[name="icon"]').fill('🏋️');
    await c.locator('input[name="name"]').fill('Gym');
    await c.getByRole('button', { name: 'Add category' }).click();
    const s = sheet(page);
    await expect(s.locator('input[name="category"]:checked')).toHaveValue('gym');
    await s.getByRole('button', { name: 'Add expense' }).click();
    expect((await getState(page)).expenses[0].category).toBe('gym');

    await page.goto('./#settings');
    await page.locator('.plain-list li', { hasText: 'Gym' }).getByRole('button', { name: 'Remove' }).click();
    await expectToast(page, '1 item moved to Other');
    const st = await getState(page);
    expect(st.categories.find((x) => x.id === 'gym')).toBeUndefined();
    expect(st.expenses[0].category).toBe('other');
  });

  test('sheet closes with the close button and with Escape', async ({ page }) => {
    await boot(page, {});
    await page.locator('.fab').click();
    await expect(sheet(page)).toBeVisible();
    await sheet(page).locator('.sheet-head [data-close]').click();
    await expect(page.locator('.sheet-wrap')).toHaveCount(0);
    await page.locator('.fab').click();
    await expect(sheet(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.sheet-wrap')).toHaveCount(0);
  });
});
