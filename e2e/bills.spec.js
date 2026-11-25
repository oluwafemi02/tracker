import { test, expect, boot, getState, expectToast, clickToastAction, tab, sheet, state, setClock, confirmButton } from './helpers.js';

const billsState = () => state({
  settings: { monthlyBudget: 1000 },
  bills: [
    { name: 'Phone', amount: 20, nextDue: '2026-11-20', category: 'phone-internet' },
    { name: 'Spotify', amount: 9.99, nextDue: '2026-11-25', category: 'subscriptions' },
    { name: 'Rent', amount: 600, nextDue: '2026-11-30', category: 'rent' },
    { name: 'Netflix', amount: 12.99, nextDue: '2026-12-14', category: 'subscriptions' },
    { name: 'Gym', amount: 40, nextDue: '2026-12-05', active: false },
  ],
});

test.describe('Bills', () => {
  test('groups bills by when they are due and shows the badge count', async ({ page }) => {
    await boot(page, { state: billsState() });
    await expect(page.locator('.tabbar .dot')).toHaveText('2');
    await tab(page, 'bills');
    const group = (t) => page.locator('.block', { has: page.locator('.block-title', { hasText: t }) }).locator('.bill-name');
    await expect(group('Overdue')).toHaveText(['Phone']);
    await expect(group('Due in the next 7 days')).toHaveText(['Spotify', 'Rent']);
    await expect(group('Later')).toHaveText(['Netflix']);
    await expect(group('Paused or finished')).toHaveText(['Gym']);
    await expect(page.locator('.bill-row', { hasText: 'Phone' })).toContainText('Due 5 days late');
    await expect(page.locator('.bill-row', { hasText: 'Spotify' })).toContainText('Due today');
    await expect(page.locator('.top-sub')).toHaveText('€642.98 a month across 4 bills');
  });

  test('add a bill with validation', async ({ page }) => {
    await boot(page, {});
    await tab(page, 'bills');
    await page.getByRole('button', { name: 'Add your first bill' }).click();
    const s = sheet(page);
    await s.getByRole('button', { name: 'Add bill' }).click();
    await expect(s.locator('.form-error')).toHaveText('Give the bill a name.');
    await s.locator('input[name="name"]').fill('Internet');
    await s.getByRole('button', { name: 'Add bill' }).click();
    await expect(s.locator('.form-error')).toHaveText('Enter an amount above zero.');
    await s.locator('input[name="amount"]').fill('24.99');
    await s.locator('input[name="nextDue"]').fill('2026-12-03');
    await s.locator('select[name="frequency"]').selectOption('monthly');
    await s.locator('.chip', { hasText: '3 days before' }).click();
    await s.locator('select[name="category"]').selectOption('phone-internet');
    await s.getByRole('button', { name: 'Add bill' }).click();
    await expectToast(page, 'Internet added');
    const b = (await getState(page)).bills[0];
    expect(b).toMatchObject({ name: 'Internet', amount: 24.99, nextDue: '2026-12-03', frequency: 'monthly', remindDays: 3, anchorDay: 3, autopay: false, active: true, category: 'phone-internet' });
    await expect(page.locator('.bill-row', { hasText: 'Internet' })).toContainText('Due in 8 days');
  });

  test('one-tap Paid from Home logs an expense, moves the date, and Undo reverts', async ({ page }) => {
    await boot(page, { state: billsState() });
    await page.locator('.bill-row', { hasText: 'Phone' }).getByRole('button', { name: /Mark Phone paid/ }).click();
    await expectToast(page, 'Phone paid. Next 20 Dec');
    let st = await getState(page);
    const phone = st.bills.find((b) => b.name === 'Phone');
    expect(phone.nextDue).toBe('2026-12-20');
    expect(phone.history).toHaveLength(1);
    const exp = st.expenses.find((e) => e.billId === phone.id);
    expect(exp).toMatchObject({ amount: 20, date: '2026-11-25', note: 'Phone', category: 'phone-internet' });
    await expect(page.locator('.tabbar .dot')).toHaveText('1');
    await expect(page.locator('.hero-stats')).toContainText('€20');

    await clickToastAction(page);
    st = await getState(page);
    expect(st.bills.find((b) => b.name === 'Phone').nextDue).toBe('2026-11-20');
    expect(st.expenses).toHaveLength(0);
    await expect(page.locator('.tabbar .dot')).toHaveText('2');
  });

  test('pay a different amount on another date', async ({ page }) => {
    await boot(page, { state: billsState() });
    await tab(page, 'bills');
    await page.locator('.bill-row', { hasText: 'Rent' }).click();
    await sheet(page).getByRole('button', { name: 'Change amount or date' }).click();
    const s = sheet(page);
    await expect(s.locator('.sheet-title')).toHaveText('Pay Rent');
    await s.locator('input[name="amount"]').fill('615.40');
    await s.locator('.chip', { hasText: 'Yesterday' }).click();
    await s.getByRole('button', { name: 'Mark as paid' }).click();
    await expectToast(page, 'Rent paid');
    const st = await getState(page);
    const rent = st.bills.find((b) => b.name === 'Rent');
    expect(rent.nextDue).toBe('2026-12-30');
    expect(rent.history[0]).toMatchObject({ due: '2026-11-30', paidOn: '2026-11-24', amount: 615.4 });
    expect(st.expenses[0]).toMatchObject({ amount: 615.4, date: '2026-11-24' });
  });

  test('skip, undo from history, pause and resume', async ({ page }) => {
    await boot(page, { state: billsState() });
    await tab(page, 'bills');
    await page.locator('.bill-row', { hasText: 'Netflix' }).click();
    await sheet(page).getByRole('button', { name: 'Skip this time' }).click();
    await expectToast(page, 'Skipped. Next due 14 Jan');
    let n = (await getState(page)).bills.find((b) => b.name === 'Netflix');
    expect(n.nextDue).toBe('2027-01-14');
    expect(n.history).toEqual([{ due: '2026-12-14', skipped: true }]);

    await page.locator('.bill-row', { hasText: 'Netflix' }).click();
    await expect(sheet(page).locator('.history li')).toContainText(['Skipped']);
    await sheet(page).getByRole('button', { name: 'Undo' }).click();
    n = (await getState(page)).bills.find((b) => b.name === 'Netflix');
    expect(n.nextDue).toBe('2026-12-14');

    await page.locator('.bill-row', { hasText: 'Netflix' }).click();
    await sheet(page).getByRole('button', { name: 'Pause this bill' }).click();
    await expectToast(page, 'Netflix paused');
    await expect(page.locator('.block', { hasText: 'Paused or finished' })).toContainText('Netflix');
    await page.locator('.bill-row', { hasText: 'Netflix' }).click();
    await sheet(page).getByRole('button', { name: 'Resume' }).click();
    n = (await getState(page)).bills.find((b) => b.name === 'Netflix');
    expect(n.active).toBe(true);
    expect(n.nextDue).toBe('2026-12-14');
  });

  test('edit a bill and delete it, keeping past payments', async ({ page }) => {
    await boot(page, { state: billsState() });
    await page.locator('.bill-row', { hasText: 'Phone' }).getByRole('button', { name: /Mark Phone paid/ }).click();
    await tab(page, 'bills');
    await page.locator('.bill-row', { hasText: 'Phone' }).click();
    await sheet(page).getByRole('button', { name: 'Edit' }).click();
    const s = sheet(page);
    await expect(s.locator('input[name="name"]')).toHaveValue('Phone');
    await s.locator('input[name="amount"]').fill('22');
    await s.locator('select[name="frequency"]').selectOption('quarterly');
    await s.getByRole('button', { name: 'Save changes' }).click();
    let st = await getState(page);
    expect(st.bills.find((b) => b.name === 'Phone')).toMatchObject({ amount: 22, frequency: 'quarterly', nextDue: '2026-12-20' });

    await page.keyboard.press('Escape');
    await page.locator('.bill-row', { hasText: 'Phone' }).click();
    await sheet(page).getByRole('button', { name: 'Edit' }).click();
    await sheet(page).getByRole('button', { name: 'Delete' }).click();
    await confirmButton(page, 'Delete').click();
    await expectToast(page, 'Bill deleted');
    await expect(page.locator('.sheet-wrap')).toHaveCount(0);
    st = await getState(page);
    expect(st.bills.find((b) => b.name === 'Phone')).toBeUndefined();
    expect(st.expenses).toHaveLength(1);
    expect(st.expenses[0].billId).toBeNull();
  });

  test('month-end bill stays on the last day of each month', async ({ page }) => {
    await boot(page, {
      now: new Date('2027-01-31T10:00:00+02:00'),
      state: state({ bills: [{ name: 'Rent', amount: 600, nextDue: '2027-01-31', category: 'rent' }] }),
    });
    for (const [day, next] of [['2027-01-31', '28 Feb'], ['2027-02-28', '31 Mar'], ['2027-03-31', '30 Apr']]) {
      await setClock(page, `${day}T10:00:00+02:00`);
      await page.locator('.bill-row', { hasText: 'Rent' }).locator('.pay-btn').first().click();
      await expectToast(page, `Next ${next}`);
    }
    const rent = (await getState(page)).bills[0];
    expect(rent.history.map((h) => h.due)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
    expect(rent.anchorDay).toBe(31);
  });

  test('autopay bills are logged automatically when their day comes', async ({ page }) => {
    await boot(page, { state: state({ bills: [{ name: 'Gym', amount: 30, nextDue: '2026-11-26', autopay: true }] }) });
    await expect(page.locator('.bill-row', { hasText: 'Gym' })).toContainText('Autopay');
    await expect(page.locator('.bill-row .pay-btn')).toHaveCount(0);
    await setClock(page, '2026-11-27T08:00:00+02:00');
    await expectToast(page, 'Logged 1 automatic payment');
    const st = await getState(page);
    expect(st.expenses).toHaveLength(1);
    expect(st.expenses[0]).toMatchObject({ date: '2026-11-26', amount: 30 });
    expect(st.bills[0].nextDue).toBe('2026-12-26');
  });

  test('a one-time bill finishes after it is paid', async ({ page }) => {
    await boot(page, { state: state({ bills: [{ name: 'Car tax', amount: 120, nextDue: '2026-11-25', frequency: 'once' }] }) });
    await page.locator('.pay-btn').click();
    const b = (await getState(page)).bills[0];
    expect(b.active).toBe(false);
    expect(b.nextDue).toBeNull();
    await tab(page, 'bills');
    await expect(page.locator('.block', { hasText: 'Paused or finished' })).toContainText('Car tax');
  });
});
