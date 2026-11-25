import { test, expect, boot, getState, expectToast, tab, sheet, state } from './helpers.js';

async function newBill(page, name, amount) {
  await tab(page, 'bills');
  await page.getByRole('button', { name: /Add (your first )?bill/ }).first().click();
  const s = sheet(page);
  await s.locator('input[name="name"]').fill(name);
  await s.locator('input[name="amount"]').fill(amount);
  return s;
}

test.describe('Bill schedule', () => {
  test('one-time bill hides the repeat options', async ({ page }) => {
    await boot(page, {});
    const s = await newBill(page, 'Car tax', '120');
    await expect(s.locator('select[name="frequency"]')).toBeVisible();
    await s.locator('.segmented label', { hasText: 'One time' }).click();
    await expect(s.locator('select[name="frequency"]')).toBeHidden();
    await expect(s.locator('[data-due-label]')).toHaveText('Due on');
    await s.locator('input[name="nextDue"]').fill('2026-12-03');
    await expect(s.locator('.schedule-summary')).toHaveText('One time, due 3 Dec');
    await s.getByRole('button', { name: 'Add bill' }).click();
    const b = (await getState(page)).bills[0];
    expect(b).toMatchObject({ name: 'Car tax', frequency: 'once', nextDue: '2026-12-03', endDate: null });
    await expect(page.locator('.bill-row', { hasText: 'Car tax' })).toContainText('One time');
  });

  test('repeating with no end date (a mortgage)', async ({ page }) => {
    await boot(page, {});
    const s = await newBill(page, 'Mortgage', '1160');
    await s.locator('input[name="nextDue"]').fill('2026-12-10');
    await expect(s.locator('.schedule-summary')).toHaveText('Monthly on the 10th, no end date');
    await s.getByRole('button', { name: 'Add bill' }).click();
    expect((await getState(page)).bills[0]).toMatchObject({ frequency: 'monthly', endDate: null, endMode: 'never' });
  });

  test('ends after a number of payments, and editing shows what is left', async ({ page }) => {
    await boot(page, {});
    const s = await newBill(page, 'Car loan', '300');
    await s.locator('input[name="nextDue"]').fill('2026-12-12');
    await s.locator('.segmented label', { hasText: 'After' }).click();
    await expect(s.locator('input[name="endCount"]')).toBeVisible();
    await expect(s.locator('input[name="endDate"]')).toBeHidden();
    await s.locator('input[name="endCount"]').fill('24');
    await expect(s.locator('.schedule-summary')).toHaveText('Monthly on the 12th, 24 payments left, last on 12 Nov 2028');
    await s.getByRole('button', { name: 'Add bill' }).click();
    let b = (await getState(page)).bills[0];
    expect(b).toMatchObject({ endDate: '2028-11-12', endMode: 'count' });
    await expect(page.locator('.bill-row', { hasText: 'Car loan' })).toContainText('24 left');

    // Pay one; 23 left.
    await page.locator('.bill-row', { hasText: 'Car loan' }).click();
    await expect(sheet(page).locator('.schedule-summary')).toContainText('24 payments left');
    await sheet(page).getByRole('button', { name: /^Paid/ }).click();
    await expect(page.locator('.bill-row', { hasText: 'Car loan' })).toContainText('23 left');
    await page.locator('.bill-row', { hasText: 'Car loan' }).click();
    await sheet(page).getByRole('button', { name: 'Edit' }).click();
    await expect(sheet(page).locator('input[name="endCount"]')).toHaveValue('23');
  });

  test('ends on a date, with checks', async ({ page }) => {
    await boot(page, {});
    const s = await newBill(page, 'Casco', '82');
    await s.locator('input[name="nextDue"]').fill('2026-12-12');
    await s.locator('.segmented label', { hasText: 'On a date' }).click();
    await s.getByRole('button', { name: 'Add bill' }).click();
    await expect(s.locator('.form-error')).toHaveText('Pick the date of the last payment.');
    await s.locator('input[name="endDate"]').fill('2026-11-01');
    await s.getByRole('button', { name: 'Add bill' }).click();
    await expect(s.locator('.form-error')).toHaveText('The last payment is before the next one.');
    await s.locator('input[name="endDate"]').fill('2027-05-26');
    await expect(s.locator('.schedule-summary')).toHaveText('Monthly on the 12th, 6 payments left, last on 12 May 2027');
    await s.getByRole('button', { name: 'Add bill' }).click();
    expect((await getState(page)).bills[0]).toMatchObject({ endDate: '2027-05-26', endMode: 'date' });
  });

  test('the last payment finishes the bill', async ({ page }) => {
    await boot(page, { state: state({ bills: [{ name: 'Phone plan', amount: 20, nextDue: '2026-11-25', endDate: '2026-11-25', endMode: 'count' }] }) });
    await expect(page.locator('.bill-row', { hasText: 'Phone plan' })).toContainText('Last one');
    await page.locator('.bill-row', { hasText: 'Phone plan' }).locator('.pay-btn').click();
    await tab(page, 'bills');
    await expect(page.locator('.block', { hasText: 'Paused or finished' })).toContainText('Finished');
  });
});

test.describe('Version', () => {
  test('Settings shows the version, and an update is announced once', async ({ page }) => {
    const s = state({ expenses: [{ amount: 5, category: 'other', date: '2026-11-20' }] });
    s.settings.lastSeenVersion = '1.0.0';
    await boot(page, { state: s });
    const { VERSION } = await import('../js/version.js');
    await expectToast(page, `Updated to version ${VERSION}`);
    expect((await getState(page)).settings.lastSeenVersion).toBe(VERSION);
    await page.goto('./#settings');
    await expect(page.locator('.about')).toContainText(`Tracker version ${VERSION}`);
    await page.reload();
    await expect(page.locator('#view .top')).toBeVisible();
    await page.waitForTimeout(900);
    await expect(page.locator('#toast.show', { hasText: 'Updated to version' })).toHaveCount(0);
  });
});
