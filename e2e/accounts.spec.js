import { test, expect, boot, getState, expectToast, tab, sheet, state, confirmButton } from './helpers.js';

const withBills = () => {
  const s = state({
    bills: [
      { name: 'Mortgage', amount: 1160, nextDue: '2026-12-10', category: 'mortgage' },
      { name: 'Car insurance', amount: 82, nextDue: '2026-12-07', category: 'insurance' },
      { name: 'House insurance', amount: 17, nextDue: '2026-12-20', category: 'insurance' },
      { name: 'Health insurance', amount: 101, nextDue: '2026-12-07', category: 'insurance' },
      { name: 'Casco', amount: 150, nextDue: '2026-12-12', category: 'insurance' },
    ],
  });
  return s;
};

test.describe('Accounts', () => {
  test('add accounts, assign bills, see what each account needs', async ({ page }) => {
    await boot(page, { state: withBills() });
    await tab(page, 'bills');
    await page.locator('.bills-view label', { hasText: 'By account' }).click();
    await expect(page.locator('.callout')).toContainText('Add the accounts your bills are paid from');

    // Add two accounts from Settings.
    await page.goto('./#settings/accounts');
    for (const name of ['Swedbank', 'SEB']) {
      await page.getByRole('button', { name: 'Add an account' }).click();
      await sheet(page).locator('input[name="name"]').fill(name);
      await sheet(page).getByRole('button', { name: 'Add account' }).click();
      await expectToast(page, `${name} added`);
    }
    await page.getByRole('button', { name: 'Add an account' }).click();
    await sheet(page).locator('input[name="name"]').fill('seb');
    await sheet(page).getByRole('button', { name: 'Add account' }).click();
    await expect(sheet(page).locator('.form-error')).toHaveText('You already have an account with that name.');
    await page.keyboard.press('Escape');
    await expect(page.locator('#set-accounts .plain-list li')).toHaveCount(2);

    // Assign in one go.
    await page.goto('./#bills');
    await expect(page.locator('.nudge')).toContainText('5 bills have no account yet');
    await page.locator('.nudge').click();
    const st0 = await getState(page);
    const id = (n) => st0.accounts.find((a) => a.name === n).id;
    const s = sheet(page);
    for (const [bill, acc] of [['Mortgage', 'Swedbank'], ['Car insurance', 'Swedbank'], ['House insurance', 'Swedbank'], ['Health insurance', 'Swedbank'], ['Casco', 'SEB']]) {
      await s.locator('.review-list li', { hasText: bill }).locator('select').selectOption(id(acc));
    }
    await s.getByRole('button', { name: 'Save' }).click();
    await expectToast(page, 'Saved 5 bills');

    // November has nothing left; December shows the plan.
    await page.locator('[aria-label="Next month"]').click();
    await expect(page.locator('.acct-month-title')).toHaveText('December');
    const swed = page.locator('.acct-card', { hasText: 'Swedbank' });
    await expect(swed.locator('.acct-total')).toHaveText('€1,360.00');
    await expect(swed.locator('.acct-sub')).toContainText('first payment 7 Dec');
    await expect(swed.locator('.acct-cats > li')).toHaveText([/Mortgage.*€1,160\.00/s, /Insurance.*Car insurance, Health insurance, House insurance.*€200\.00/s]);
    await expect(swed.locator('.acct-haveby')).toContainText('Have by 7 Dec€183.00');
    await expect(swed.locator('.acct-haveby')).toContainText('Have by 10 Dec€1,343.00');
    await expect(page.locator('.acct-card', { hasText: 'SEB' }).locator('.acct-total')).toHaveText('€150.00');
    await expect(page.locator('.acct-total-line')).toContainText('€1,510.00 in bills in December across 2 accounts');

    // Expand a category to see the bills, then open one.
    await swed.locator('.acct-cats summary', { hasText: 'Insurance' }).click();
    const ins = swed.locator('.acct-cats details', { hasText: 'Insurance' });
    await expect(ins.locator('.acct-bills li')).toHaveCount(3);
    await ins.locator('.acct-bills li', { hasText: 'Car insurance' }).click();
    await expect(sheet(page)).toContainText('Paid from Swedbank');
  });

  test('bill form: choose or create the account it is paid from', async ({ page }) => {
    await boot(page, {});
    await tab(page, 'bills');
    await page.getByRole('button', { name: 'Add your first bill' }).click();
    const s = sheet(page);
    await s.locator('input[name="name"]').fill('Life insurance');
    await s.locator('input[name="amount"]').fill('25');
    await s.locator('select[name="accountId"]').selectOption('__new');
    await sheet(page).locator('input[name="name"]').fill('Revolut');
    await sheet(page).getByRole('button', { name: 'Add account' }).click();
    await expect(sheet(page).locator('select[name="accountId"]')).toHaveValue(/^a/);
    await sheet(page).getByRole('button', { name: 'Add bill' }).click();
    const st = await getState(page);
    expect(st.bills[0].accountId).toBe(st.accounts[0].id);
    // The next bill starts with the same account.
    await expect(page.locator('.sheet-wrap')).toHaveCount(0);
    await page.locator('#view [data-action="new-bill"]').first().click();
    await expect(sheet(page).locator('select[name="accountId"]')).toHaveValue(st.accounts[0].id);
  });

  test('transfer reminder on Home, marked as moved', async ({ page }) => {
    const s = withBills();
    s.accounts = [{ id: 'aswed', name: 'Swedbank', currency: 'EUR' }];
    s.bills.forEach((b) => { if (b.name !== 'Casco') b.accountId = 'aswed'; });
    await boot(page, { state: s, now: new Date('2026-12-05T09:00:00+02:00') });
    const n = page.locator('.transfer-nudge');
    await expect(n).toContainText('Move €1,360.00 to Swedbank by 7 Dec');
    await n.getByRole('button', { name: 'Done' }).click();
    await expectToast(page, 'Marked as moved');
    await expect(page.locator('.transfer-nudge')).toHaveCount(0);
    expect((await getState(page)).settings.transfersDone['aswed:2026-12']).toBeTruthy();
  });

  test('transfer reminder setting and days', async ({ page }) => {
    const s = withBills();
    s.accounts = [{ id: 'aswed', name: 'Swedbank', currency: 'EUR' }];
    s.bills.forEach((b) => { b.accountId = 'aswed'; });
    await boot(page, { state: s, now: new Date('2026-12-02T09:00:00+02:00') });
    await expect(page.locator('.transfer-nudge')).toHaveCount(0); // 5 days away
    await page.goto('./#settings/accounts');
    await page.locator('[data-setting="transferReminder.daysBefore"]').selectOption('5');
    await expect.poll(async () => (await getState(page)).settings.transferReminder).toEqual({ enabled: true, daysBefore: 5 });
    await page.goto('./#home');
    await expect(page.locator('.transfer-nudge')).toContainText('Move €1,510.00 to Swedbank by 7 Dec');
    await page.goto('./#settings/accounts');
    await page.locator('#set-accounts label.toggle').click();
    await expect.poll(async () => (await getState(page)).settings.transferReminder.enabled).toBe(false);
    await page.goto('./#home');
    await expect(page.locator('.transfer-nudge')).toHaveCount(0);
  });

  test('expenses can be marked "Paid with", and usual spending shows on the account', async ({ page }) => {
    const s = withBills();
    s.accounts = [{ id: 'arev', name: 'Revolut', currency: 'EUR' }];
    s.bills[0].accountId = 'arev';
    s.expenses = [
      { id: 'o1', amount: 300, currency: 'EUR', baseAmount: 300, category: 'groceries', note: '', date: '2026-10-10', accountId: 'arev', createdAt: 'x' },
      { id: 'o2', amount: 300, currency: 'EUR', baseAmount: 300, category: 'groceries', note: '', date: '2026-09-10', accountId: 'arev', createdAt: 'y' },
      { id: 'o3', amount: 300, currency: 'EUR', baseAmount: 300, category: 'groceries', note: '', date: '2026-11-10', accountId: 'arev', createdAt: 'z' },
    ];
    await boot(page, { state: s });
    await page.locator('.fab').click();
    const f = sheet(page);
    await f.locator('input[name="amount"]').fill('9.50');
    await f.locator('.chip', { hasText: 'Groceries' }).first().click();
    await f.locator('.chip', { hasText: 'Revolut' }).click();
    await f.getByRole('button', { name: 'Add expense' }).click();
    const st = await getState(page);
    expect(st.expenses.at(-1).accountId).toBe('arev');
    await page.locator('.fab').click();
    await expect(sheet(page).locator('input[name="accountId"]:checked')).toHaveValue('arev'); // remembered
    await page.keyboard.press('Escape');

    await tab(page, 'bills');
    await page.locator('.bills-view label', { hasText: 'By account' }).click();
    await page.locator('[aria-label="Next month"]').click();
    await expect(page.locator('.acct-card', { hasText: 'Revolut' }).locator('.acct-everyday')).toContainText('usually about €303 a month'); // Sep, Oct, Nov incl. the 9.50 added today
  });

  test('deleting an account leaves its bills without one', async ({ page }) => {
    const s = withBills();
    s.accounts = [{ id: 'aswed', name: 'Swedbank', currency: 'EUR' }];
    s.bills[0].accountId = 'aswed';
    await boot(page, { state: s });
    await page.goto('./#settings/accounts');
    await page.locator('#set-accounts .plain-list li', { hasText: 'Swedbank' }).getByRole('button', { name: 'Edit' }).click();
    await sheet(page).getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('.confirm')).toContainText('1 bill will have no account');
    await confirmButton(page, 'Delete').click();
    await expectToast(page, 'Account deleted');
    const st = await getState(page);
    expect(st.accounts).toEqual([]);
    expect(st.bills[0].accountId).toBeNull();
  });
});
