import './setup.js';
import { resetStorage } from './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, nextOccurrence, firstOnOrAfter, occurrencesBetween, diffDays, toISO, relativeDue } from '../js/dates.js';
import { migrateLegacy, hasLegacyData } from '../js/migrate.js';
import { buildICS, rrule } from '../js/ics.js';
import { rateText } from '../js/money.js';
import { legacy, getter } from './legacy-fixture.js';

test('monthly dates keep their anchor day', () => {
  assert.equal(addMonths('2026-01-31', 1, 31), '2026-02-28');
  assert.equal(addMonths('2026-02-28', 1, 31), '2026-03-31');
  assert.equal(addMonths('2024-01-31', 1, 31), '2024-02-29');
  assert.equal(addMonths('2026-11-15', 2), '2027-01-15');
  assert.equal(nextOccurrence('2026-12-30', 'quarterly', 30), '2027-03-30');
  assert.equal(nextOccurrence('2026-12-30', 'weekly'), '2027-01-06');
  assert.equal(nextOccurrence('2026-12-30', 'once'), null);
});

test('schedule helpers', () => {
  assert.equal(firstOnOrAfter('2025-01-31', 'monthly', '2026-11-25', 31), '2026-11-30');
  assert.deepEqual(occurrencesBetween('2026-11-28', 'weekly', '2026-11-01', '2026-12-31'), ['2026-11-28', '2026-12-05', '2026-12-12', '2026-12-19', '2026-12-26']);
  assert.deepEqual(occurrencesBetween('2026-11-28', 'weekly', '2026-11-01', '2026-12-31', undefined, '2026-12-10'), ['2026-11-28', '2026-12-05']);
  assert.equal(diffDays('2026-03-28', '2026-03-30'), 2); // across DST change
  assert.equal(relativeDue('2026-11-24', '2026-11-25'), '1 day late');
  assert.equal(toISO(new Date(2026, 0, 5)), '2026-01-05');
});

test('legacy import maps everything without loss', () => {
  assert.ok(hasLegacyData(getter(legacy)));
  const res = migrateLegacy(getter(legacy), { today: '2026-11-25' });
  const { settings, expenses, bills, trips, tripExpenses, categories, report } = res;
  assert.equal(settings.currency, 'EUR');
  assert.equal(settings.monthlyBudget, 2500);

  // bills: duplicate Netflix dropped, gym inactive, insurance ended
  assert.equal(bills.length, 4);
  assert.equal(report.droppedBillDuplicates, 1);
  const rent = bills.find((b) => b.name === 'Rent');
  assert.equal(rent.anchorDay, 31);
  assert.equal(rent.nextDue, '2026-11-30', 'jumps over the year the app was unused');
  const netflix = bills.find((b) => b.name === 'Netflix');
  assert.equal(netflix.nextDue, '2026-12-14', 'continues after the last processed date');
  assert.equal(bills.find((b) => b.name === 'Gym').active, false);
  assert.equal(bills.find((b) => b.name === 'Home insurance').active, false);

  // expenses: zero-amount and trip copy skipped, auto-recurring suffix removed, links kept
  assert.equal(expenses.length, 6);
  assert.equal(report.skippedDuplicates, 1);
  const auto = expenses.find((e) => e.date === '2025-02-28');
  assert.equal(auto.note, 'Rent');
  assert.equal(auto.billId, rent.id);
  assert.equal(expenses.find((e) => e.date === '2025-01-31').billId, rent.id);
  assert.equal(rent.history.length, 2);
  const usd = expenses.find((e) => e.currency === 'USD');
  assert.equal(usd.baseAmount, 18.4);
  assert.ok(categories.find((c) => c.name === 'Pets' && c.custom));
  assert.equal(expenses.find((e) => e.note === 'Cat food').category, 'pets');
  assert.equal(categories.find((c) => c.name === 'Gym').icon, '🏋️');
  assert.equal(expenses.find((e) => e.category === 'entertainment'), undefined);

  // trips
  assert.equal(trips.length, 2);
  const riga = trips.find((t) => t.name === 'Riga weekend');
  assert.equal(riga.closed, true);
  assert.deepEqual(riga.people, ['Me', 'Ada']);
  assert.equal(tripExpenses.length, 3, 'orphan trip expense dropped');
  const dinner = tripExpenses.find((e) => e.note.startsWith('Dinner'));
  assert.equal(dinner.countInMonthly, true);
  assert.equal(dinner.category, 't-food');
  assert.equal(tripExpenses.find((e) => e.payer === 'Ada').category, 't-stay');
});

test('calendar export', () => {
  const bill = { id: 'b1', name: 'Rent, flat', amount: 650, currency: 'EUR', frequency: 'monthly', anchorDay: 31, nextDue: '2026-11-30', remindDays: 2, active: true };
  assert.equal(rrule(bill), 'FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=28,29,30,31;BYSETPOS=-1');
  assert.equal(rrule({ ...bill, frequency: 'biweekly' }), 'FREQ=WEEKLY;INTERVAL=2');
  assert.equal(rrule({ ...bill, frequency: 'yearly', endDate: '2028-01-01' }), 'FREQ=YEARLY;UNTIL=20280101');
  const ics = buildICS([bill], { remindTime: '09:00' }, 'https://x.test/tracker/');
  assert.match(ics, /DTSTART;VALUE=DATE:20261130/);
  assert.match(ics, /SUMMARY:Rent\\, flat €650.00/);
  assert.match(ics, /TRIGGER:-PT2340M/); // 2 days before at 09:00
  assert.match(ics, /TRIGGER:PT540M/); // on the day at 09:00
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
});

test('store: bills, autopay, monthly summary, trips', async () => {
  resetStorage();
  const store = await import('../js/store.js');
  store.load();
  store.update((s) => { s.settings.monthlyBudget = 1000; });
  const t = '2026-11-25';
  store.saveBill({ name: 'Phone', amount: 20, currency: 'EUR', category: 'phone-internet', frequency: 'monthly', nextDue: '2026-11-20', remindDays: 2, autopay: false });
  store.saveBill({ name: 'Gym', amount: 30, currency: 'EUR', category: 'other', frequency: 'monthly', nextDue: '2026-11-22', remindDays: 1, autopay: true });
  store.saveBill({ name: 'Rent', amount: 600, currency: 'EUR', category: 'rent', frequency: 'monthly', nextDue: '2026-11-30', remindDays: 2 });
  const phone = store.getState().bills.find((b) => b.name === 'Phone');
  assert.equal(store.billStatus(phone, t), 'overdue');
  assert.equal(store.attentionCount(t), 2);

  assert.equal(store.runAutopay(t), 1);
  const gym = store.getState().bills.find((b) => b.name === 'Gym');
  assert.equal(gym.nextDue, '2026-12-22');
  assert.equal(store.getState().expenses.find((e) => e.billId === gym.id).date, '2026-11-22');

  store.saveExpense({ amount: 50, currency: 'EUR', category: 'groceries', note: 'Rimi', date: '2026-11-10' });
  let sum = store.monthSummary('2026-11', t);
  assert.equal(sum.spent, 80);
  assert.equal(sum.committed, 620); // phone (overdue) + rent
  assert.equal(sum.left, 300);
  assert.equal(sum.daysLeft, 6);
  assert.equal(sum.perDay, 50);

  store.markBillPaid(phone.id, { paidOn: t });
  assert.equal(store.getState().bills.find((b) => b.id === phone.id).nextDue, '2026-12-20');
  sum = store.monthSummary('2026-11', t);
  assert.equal(sum.spent, 100);
  assert.equal(sum.committed, 600);
  store.undoLastBillAction(phone.id);
  assert.equal(store.getState().bills.find((b) => b.id === phone.id).nextDue, '2026-11-20');
  assert.equal(store.monthSummary('2026-11', t).spent, 80);

  store.saveTrip({ name: 'Paris', startDate: '2026-11-20', endDate: '2026-11-29', budget: 900, currency: 'EUR', people: ['Me', 'Ada', 'Tunde'] });
  const trip = store.getState().trips[0];
  store.saveTripExpense({ tripId: trip.id, amount: 90, currency: 'EUR', tripAmount: 90, baseAmount: 90, category: 't-food', note: '', date: '2026-11-21', payer: 'Me', split: true, countInMonthly: true });
  store.saveTripExpense({ tripId: trip.id, amount: 30, currency: 'EUR', tripAmount: 30, baseAmount: 30, category: 't-taxi', note: '', date: '2026-11-22', payer: 'Ada', split: true, countInMonthly: false });
  const ts = store.tripSummary(trip);
  assert.equal(ts.total, 120);
  assert.deepEqual(ts.settle.map((x) => [x.from, x.to, x.amount]), [['Tunde', 'Me', 40], ['Ada', 'Me', 10]]);
  assert.equal(store.monthSummary('2026-11', t).spent, 170, 'trip expense flagged for monthly is counted');
});

test('exchange rates keep their precision', () => {
  assert.equal(rateText(0.92), '0.92');
  assert.equal(rateText(0.00058), '0.00058');
  assert.equal(rateText(1724.1379), '1724.1');
  assert.equal(rateText(0), '');
});

test('bill schedules: payments left, last payment, summaries', async () => {
  const { nthOccurrence, countOccurrences, describeSchedule } = await import('../js/dates.js');
  assert.equal(nthOccurrence('2026-12-10', 'monthly', 12, 10), '2027-11-10');
  assert.equal(nthOccurrence('2026-01-31', 'monthly', 2, 31), '2026-02-28');
  assert.equal(countOccurrences('2026-12-10', 'monthly', '2027-11-10', 10), 12);
  assert.equal(countOccurrences('2026-12-10', 'monthly', null, 10), Infinity);
  assert.equal(countOccurrences('2026-12-10', 'once', null, 10), 1);
  assert.equal(describeSchedule({ frequency: 'monthly', nextDue: '2026-12-10', endDate: null }), 'Monthly on the 10th, no end date');
  assert.equal(describeSchedule({ frequency: 'monthly', nextDue: '2026-12-01', endDate: '2027-11-30' }), 'Monthly on the 1st, 12 payments left, last on 1 Nov 2027');
  assert.equal(describeSchedule({ frequency: 'once', nextDue: '2026-12-03' }), 'One time, due 3 Dec');
  assert.equal(describeSchedule({ frequency: 'weekly', nextDue: '2026-11-30', endDate: '2026-12-14' }), 'Every Monday, 3 payments left, last on 14 Dec');
});
