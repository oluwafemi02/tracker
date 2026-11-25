import { test, expect, boot, getState, expectToast, tab, sheet, state } from './helpers.js';

// The new app is already in use, but a trip went missing before the upgrade.
const lostTrip = { id: 1755000000000, name: 'Lagos Christmas', destination: 'Lagos', startDate: '2025-12-18', endDate: '2026-01-04', budget: 1200, currency: 'EUR', status: 'completed' };
const lostTx = [
  { id: 101, tripId: lostTrip.id, amount: 20, currency: 'EUR', category: '🍽️ Food & Dining', date: '2025-12-19', payer: 'Me', description: 'Suya' },
  { id: 102, tripId: lostTrip.id, amount: 35.5, currency: 'EUR', category: '🚕 Taxi/Uber', date: '2025-12-20', payer: 'Ada', description: '' },
];

const seeded = () => {
  const s = state({
    expenses: [
      { amount: 45, category: 'other', note: 'Dinner (Trip: Riga)', date: '2025-08-02' },
      { amount: 12, category: 'dining', note: 'Lunch', date: '2026-11-20' },
    ],
  });
  return {
    state: s,
    legacy: {
      trips: '[]',
      trip_history_backup: JSON.stringify([lostTrip]),
      travel_expenses_backup: JSON.stringify(lostTx),
    },
  };
};

test.describe('Find lost trips', () => {
  test('finds a trip in old storage and rebuilds one from monthly copies', async ({ page }) => {
    await boot(page, seeded());
    await page.goto('./#settings/data');
    await page.getByRole('button', { name: 'Find lost trips' }).click();
    const s = sheet(page);
    await expect(s.locator('.recover-list li')).toHaveCount(2);
    const lagos = s.locator('.recover-list li', { hasText: 'Lagos Christmas' });
    await expect(lagos).toContainText('18 Dec 2025 to 4 Jan');
    await expect(lagos).toContainText('2 expenses, €55.50');
    await expect(lagos).toContainText('Found in this phone');
    const riga = s.locator('.recover-list li', { hasText: 'Riga' });
    await expect(riga).toContainText('Moves 1 copied item out of monthly spending');
    await s.getByRole('button', { name: 'Add selected trips' }).click();
    await expectToast(page, 'Added 2 trips');

    const st = await getState(page);
    expect(st.trips.map((t) => t.name).sort()).toEqual(['Lagos Christmas', 'Riga']);
    expect(st.tripExpenses).toHaveLength(3);
    expect(st.expenses.map((e) => e.note)).toEqual(['Lunch']);
    expect(st.trips.find((t) => t.name === 'Lagos Christmas').people).toEqual(['Me', 'Ada']);

    await tab(page, 'trips');
    await page.locator('.trip-card', { hasText: 'Lagos Christmas' }).click();
    await expect(page.locator('.hero-amount')).toHaveText('€55.50');
    await expect(page.locator('.settle li')).toHaveText([/Me\s*pays\s*Ada\s*€7.75/]);

    // Nothing is offered twice.
    await page.goto('./#settings/data');
    await page.getByRole('button', { name: 'Find lost trips' }).click();
    await expect(sheet(page)).toContainText('No lost trips found on this phone');
  });

  test('unticked trips are left out', async ({ page }) => {
    await boot(page, seeded());
    await page.goto('./#settings/data');
    await page.getByRole('button', { name: 'Find lost trips' }).click();
    await sheet(page).locator('.recover-list li', { hasText: 'Riga' }).locator('.toggle-ui').click();
    await sheet(page).getByRole('button', { name: 'Add selected trips' }).click();
    await expectToast(page, 'Added 1 trip');
    const st = await getState(page);
    expect(st.trips.map((t) => t.name)).toEqual(['Lagos Christmas']);
    expect(st.expenses).toHaveLength(2);
  });

  test('recovers a trip from an old trip CSV file', async ({ page }) => {
    await boot(page, { state: state() });
    await page.goto('./#settings/data');
    await page.getByRole('button', { name: 'Find lost trips' }).click();
    await expect(sheet(page)).toContainText('No lost trips found on this phone');
    const csv = '"Date","Category","Amount (€)","Location","Description"\n"2026-03-02","🏨 Accommodation","180.00","Old Town","Hotel"\n"2026-03-03","🍽️ Food & Dining","42.00","",""';
    await sheet(page).locator('input[data-recover-file]').setInputFiles({ name: 'Vilnius_weekend_expenses.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(sheet(page).locator('.recover-list li')).toContainText('Vilnius weekend');
    await expect(sheet(page).locator('.recover-list li')).toContainText('2 expenses, €222.00');
    await sheet(page).getByRole('button', { name: 'Add selected trips' }).click();
    await expectToast(page, 'Added 1 trip');
    expect((await getState(page)).trips[0]).toMatchObject({ name: 'Vilnius weekend', startDate: '2026-03-02', endDate: '2026-03-03' });
  });

  test('a file with no trips gives a clear message', async ({ page }) => {
    await boot(page, { state: state() });
    await page.goto('./#settings/data');
    await page.getByRole('button', { name: 'Find lost trips' }).click();
    await sheet(page).locator('input[data-recover-file]').setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"a":1}') });
    await expectToast(page, 'No trips found in that file.');
  });

  test('Restore accepts a full backup from the old app', async ({ page }) => {
    await boot(page, { state: state({ expenses: [{ amount: 1, category: 'other', date: '2026-11-01' }] }) });
    await page.goto('./#settings/data');
    const old = { expenses: [{ id: 5, amount: 9.5, category: 'Groceries', date: '2025-12-01', description: 'Rimi' }], monthlyBudget: 2000, recurringExpenses: [], trips: [lostTrip], travelExpenses: lostTx, currentTrip: null, version: '1.0' };
    await page.locator('input[data-restore]').setInputFiles({ name: 'expense-tracker-backup-2026-01-05.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(old)) });
    await expect(page.locator('.confirm')).toContainText('1 expenses, 0 bills, 1 trips');
    await page.locator('.sheet-wrap.open .confirm').getByRole('button', { name: 'Restore', exact: true }).click();
    await expectToast(page, 'Backup restored');
    const st = await getState(page);
    expect(st.expenses.map((e) => e.note)).toEqual(['Rimi']);
    expect(st.trips[0].name).toBe('Lagos Christmas');
    expect(st.tripExpenses).toHaveLength(2);
    expect(st.settings.monthlyBudget).toBe(2000);
  });
});
