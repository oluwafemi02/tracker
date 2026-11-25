import { test, expect, boot, getState, expectToast, clickToastAction, tab, sheet, state, confirmButton } from './helpers.js';

const lisbon = () => state({
  settings: { monthlyBudget: 1000 },
  trips: [
    { name: 'Lisbon', destination: 'Portugal', startDate: '2026-11-22', endDate: '2026-11-28', budget: 900, people: ['Me', 'Ada', 'Tunde'] },
    { name: 'Riga', startDate: '2026-08-01', endDate: '2026-08-03', budget: 300 },
    { name: 'Lagos', startDate: '2026-12-20', endDate: '2027-01-05', currency: 'NGN', budget: 500000 },
  ],
  tripExpenses: [
    { tripId: 'trip1', amount: 240, category: 't-stay', note: 'Apartment', date: '2026-11-22', payer: 'Ada' },
    { tripId: 'trip1', amount: 60, category: 't-food', note: 'Dinner', date: '2026-11-23', payer: 'Me' },
  ],
});

test.describe('Trips', () => {
  test('lists trips by status and shows the trip on Home', async ({ page }) => {
    await boot(page, { state: lisbon() });
    await expect(page.locator('.trip-mini')).toContainText('Lisbon');
    await expect(page.locator('.trip-mini')).toContainText('Day 4 of 7');
    await expect(page.locator('.trip-mini')).toContainText('€300.00');
    await tab(page, 'trips');
    const group = (t) => page.locator('.block', { has: page.locator('.block-title', { hasText: t }) }).locator('.trip-card b');
    await expect(group('On now')).toHaveText(['Lisbon']);
    await expect(group('Coming up')).toHaveText(['Lagos']);
    await expect(group('Past trips')).toHaveText(['Riga']);
    await expect(page.locator('.trip-card', { hasText: 'Lagos' })).toContainText('Starts in 25 days');
  });

  test('trip detail: totals, per day, categories and who owes whom', async ({ page }) => {
    await boot(page, { state: lisbon() });
    await page.goto('./#trip/trip1');
    await expect(page.locator('.hero .top-title')).toHaveText('Lisbon');
    await expect(page.locator('.hero-amount')).toHaveText('€300.00');
    // 600 left over 4 remaining days (25th to 28th)
    await expect(page.locator('.hero-caption')).toHaveText('spent, €600.00 left, about €150.00 a day');
    await expect(page.locator('.hero-stats')).toContainText('€75.00');
    await expect(page.locator('.hero-stats')).toContainText('4/7');
    await expect(page.locator('.cat-bar').first()).toContainText('Stay');
    // Each owes 100; Ada paid 240 (+140), Me 60 (-40), Tunde 0 (-100)
    await expect(page.locator('.settle li')).toHaveText([/Tunde\s*pays\s*Ada\s*€100.00/, /Me\s*pays\s*Ada\s*€40.00/]);
  });

  test('add a trip expense in another currency, not split, counted monthly', async ({ page }) => {
    await boot(page, { state: lisbon() });
    await page.goto('./#trip/trip1');
    await page.locator('.fab').click();
    const s = sheet(page);
    await expect(s.locator('.sheet-title')).toHaveText('Lisbon');
    await s.locator('input[name="amount"]').fill('30');
    await s.locator('select[name="currency"]').selectOption('GBP');
    await expect(s.locator('.convert input')).toHaveValue('1.17');
    await s.locator('.chip', { hasText: 'Taxi & rides' }).click();
    await s.locator('.chip', { hasText: 'Tunde' }).click();
    await s.locator('label.toggle', { hasText: 'Split equally' }).click();
    await s.locator('label.toggle', { hasText: 'Also count in monthly budget' }).click();
    await s.getByRole('button', { name: 'Add to trip' }).click();
    await expectToast(page, 'Added £30.00 to Lisbon');
    const x = (await getState(page)).tripExpenses.at(-1);
    expect(x).toMatchObject({ amount: 30, currency: 'GBP', tripAmount: 35.1, baseAmount: 35.1, payer: 'Tunde', split: false, countInMonthly: true, category: 't-taxi' });
    await expect(page.locator('.hero-amount')).toHaveText('€335.10');
    // Not split: Tunde paid for himself only, so the settle-up does not change.
    await expect(page.locator('.settle li')).toHaveText([/Tunde\s*pays\s*Ada\s*€100.00/, /Me\s*pays\s*Ada\s*€40.00/]);
    // Counted in the monthly budget on Home.
    await tab(page, 'home');
    await expect(page.locator('.hero-stats')).toContainText('€35.10');
    await tab(page, 'activity');
    await expect(page.locator('.cat-bar', { hasText: 'Travel' })).toContainText('€35.10');
  });

  test('the + button during a trip offers to add to the trip', async ({ page }) => {
    await boot(page, { state: lisbon() });
    await page.locator('.fab').click();
    await sheet(page).locator('input[name="amount"]').fill('12');
    await sheet(page).locator('.trip-switch').click();
    const s = sheet(page);
    await expect(s.locator('.sheet-title')).toHaveText('Lisbon');
    await expect(s.locator('input[name="amount"]')).toHaveValue('12');
    await s.locator('.chip', { hasText: 'Food & drink' }).click();
    await s.getByRole('button', { name: 'Add to trip' }).click();
    const st = await getState(page);
    expect(st.tripExpenses).toHaveLength(3);
    expect(st.expenses).toHaveLength(0);
  });

  test('create a trip with validation, edit, finish, reopen and delete', async ({ page }) => {
    await boot(page, {});
    await tab(page, 'trips');
    await page.getByRole('button', { name: 'Create a trip' }).click();
    let s = sheet(page);
    await s.getByRole('button', { name: 'Create trip' }).click();
    await expect(s.locator('.form-error')).toHaveText('Give the trip a name.');
    await s.locator('input[name="name"]').fill('Kaunas');
    await s.locator('input[name="startDate"]').fill('2026-11-24');
    await s.locator('input[name="endDate"]').fill('2026-11-20');
    await s.getByRole('button', { name: 'Create trip' }).click();
    await expect(s.locator('.form-error')).toHaveText('The end date is before the start date.');
    await s.locator('input[name="endDate"]').fill('2026-11-26');
    await s.locator('input[name="budget"]').fill('200');
    await s.locator('input[name="people"]').fill('Me, Ada');
    await s.getByRole('button', { name: 'Create trip' }).click();
    await expectToast(page, 'Kaunas created');
    let t = (await getState(page)).trips[0];
    expect(t).toMatchObject({ name: 'Kaunas', budget: 200, people: ['Me', 'Ada'], startDate: '2026-11-24', endDate: '2026-11-26' });

    await page.locator('.trip-card', { hasText: 'Kaunas' }).click();
    await page.getByRole('button', { name: 'Edit' }).click();
    s = sheet(page);
    await s.locator('input[name="budget"]').fill('250');
    await s.getByRole('button', { name: 'Save changes' }).click();
    expect((await getState(page)).trips[0].budget).toBe(250);

    await page.getByRole('button', { name: 'Mark trip as finished' }).click();
    await expectToast(page, 'Trip marked as finished');
    await page.getByRole('button', { name: 'Reopen trip' }).click();
    await expectToast(page, 'Trip reopened');
    await expect.poll(async () => (await getState(page)).trips[0].closed).toBe(false);

    await page.getByRole('button', { name: 'Edit' }).click();
    await sheet(page).getByRole('button', { name: 'Delete' }).click();
    await confirmButton(page, 'Delete').click();
    await expectToast(page, 'Trip deleted');
    await expect(page.locator('#view')).toHaveAttribute('data-route', 'trips');
    expect((await getState(page)).trips).toHaveLength(0);
  });

  test('edit and delete a trip expense with undo', async ({ page }) => {
    await boot(page, { state: lisbon() });
    await page.goto('./#trip/trip1');
    await page.locator('.tx-row', { hasText: 'Dinner' }).click();
    let s = sheet(page);
    await expect(s.locator('.sheet-title')).toHaveText('Edit trip expense');
    await s.locator('input[name="amount"]').fill('66');
    await s.getByRole('button', { name: 'Save changes' }).click();
    expect((await getState(page)).tripExpenses.find((e) => e.note === 'Dinner').tripAmount).toBe(66);
    await page.locator('.tx-row', { hasText: 'Dinner' }).click();
    await sheet(page).getByRole('button', { name: 'Delete' }).click();
    await confirmButton(page, 'Delete').click();
    await expectToast(page, 'Expense deleted');
    expect((await getState(page)).tripExpenses).toHaveLength(1);
    await clickToastAction(page);
    expect((await getState(page)).tripExpenses).toHaveLength(2);
  });
});
