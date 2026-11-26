// 1.6: monthly summary, category limits, bill price changes, trip savings.
import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const store = await import('../js/store.js');
const rem = await import('../js/reminders.js');

const T = '2026-11-26';
const exp = (amount, category, date, extra = {}) => store.saveExpense({ amount, currency: 'EUR', category, note: '', date, ...extra });

test('old saved state loads with the new defaults', () => {
  localStorage.setItem('ledger.v1', JSON.stringify({ version: 1, settings: { currency: 'EUR', monthlyBudget: 2450 }, expenses: [], bills: [], trips: [{ id: 't1', name: 'Old', startDate: '2025-08-01', endDate: '2025-08-10', currency: 'EUR', people: ['Me'] }] }));
  const { state } = store.load();
  assert.deepEqual(state.limits, {});
  assert.equal(state.settings.monthlySummary, true);
  assert.deepEqual(state.settings.limitAlerts, {});
  assert.equal(store.tripSavings(state.trips[0], T), null, 'trips without a goal have no savings');
  assert.equal(state.settings.monthlyBudget, 2450, 'saved values kept');
});

test('monthly recap: total, budget and the biggest category change', () => {
  exp(100, 'groceries', '2026-10-05');
  exp(60, 'dining', '2026-10-06');
  exp(118, 'groceries', '2026-11-05');
  exp(50, 'dining', '2026-11-06');
  exp(1922, 'rent', '2026-11-01');
  const r = store.monthRecap('2026-11');
  assert.equal(r.total, 2090);
  assert.equal(r.underBy, 360);
  assert.deepEqual(r.change, { category: 'groceries', pct: 18, diff: 18 }, 'a rise wins over a bigger drop in percent');

  const items = rem.summarySchedule(T);
  assert.equal(items.length, 1);
  const it = items[0];
  assert.equal(it.id, 'summary:2026-11');
  assert.equal(it.fireAt, new Date(2026, 11, 1, 9, 0).toISOString(), 'on the 1st at the reminder time');
  assert.match(it.title, /^November: €2,090(\.00)? spent$/);
  assert.match(it.body, /^€360(\.00)? under budget, Groceries up 18% on October\.$/);
  assert.equal(it.url, './?tab=activity&month=2026-11');
  assert.equal(it.solo, true);

  store.update((s) => { s.settings.hideAmountsInPush = true; });
  assert.equal(rem.summarySchedule(T)[0].title, 'Your November summary is ready');
  store.update((s) => { s.settings.hideAmountsInPush = false; s.settings.monthlySummary = false; });
  assert.deepEqual(rem.summarySchedule(T), [], 'can be turned off');
  store.update((s) => { s.settings.monthlySummary = true; });
  assert.deepEqual(rem.summarySchedule('2026-07-10'), [], 'nothing sent for an empty month');
});

test('category limits alert once at 80% and once when over', () => {
  store.setLimits({ dining: 200, shopping: 0 });
  assert.deepEqual(store.getState().limits, { dining: 200 }, 'zero means no limit');
  // 50 already spent on dining in November
  exp(100, 'dining', '2026-11-10');
  assert.deepEqual(store.newLimitAlerts(T), [], '150 of 200 is fine');
  exp(15, 'dining', '2026-11-11');
  let a = store.newLimitAlerts(T);
  assert.equal(a.length, 1);
  assert.equal(a[0].threshold, 80);
  assert.equal(a[0].left, 35);
  assert.deepEqual(store.newLimitAlerts(T), [], 'only once');
  exp(45, 'dining', '2026-11-12');
  a = store.newLimitAlerts(T);
  assert.equal(a[0].threshold, 100);
  assert.equal(a[0].spent, 210);
  assert.deepEqual(store.newLimitAlerts(T), []);
  assert.equal(store.limitStatus('2026-11')[0].level, 'over');
  assert.deepEqual(store.monthRecap('2026-11').overLimits, ['dining']);
  // A higher limit starts again.
  store.setLimits({ dining: 300 });
  assert.deepEqual(store.newLimitAlerts(T), [], '210 of 300 is 70%');
  exp(40, 'dining', '2026-11-13');
  assert.equal(store.newLimitAlerts(T)[0].threshold, 80);
  // A new month starts fresh.
  exp(250, 'dining', '2026-12-02');
  assert.equal(store.newLimitAlerts('2026-12-02')[0].threshold, 80);
  assert.ok(Object.keys(store.getState().settings.limitAlerts).every((k) => k.endsWith('2026-11') || k.endsWith('2026-12')));
  assert.equal(store.categoryAverages('2026-12').groceries, round(218 / 3));
});

const round = (n) => Math.round(n * 100) / 100;

test('paying a fixed bill a different amount offers to update it', () => {
  store.saveBill({ name: 'Netflix', amount: 13.99, currency: 'EUR', category: 'subscriptions', frequency: 'monthly', nextDue: '2026-11-20', remindDays: 2 });
  store.saveBill({ name: 'Power', amount: 60, currency: 'EUR', category: 'utilities', frequency: 'monthly', nextDue: '2026-11-20', variable: true });
  const nf = store.getState().bills.find((b) => b.name === 'Netflix');
  const pw = store.getState().bills.find((b) => b.name === 'Power');
  assert.equal(store.priceChange(nf.id, 13.99), null);
  assert.equal(store.priceChange(pw.id, 75), null, 'changing bills never ask');
  const ch = store.priceChange(nf.id, 15.99);
  assert.deepEqual({ from: ch.from, to: ch.to }, { from: 13.99, to: 15.99 });
  const e1 = store.markBillPaid(nf.id, { paidOn: '2026-11-20', amount: 15.99 });
  assert.ok(store.isLatestPayment(nf.id, e1.id));
  store.updateBillAmount(nf.id, 15.99, T);
  const after = store.getState().bills.find((b) => b.id === nf.id);
  assert.equal(after.amount, 15.99);
  assert.deepEqual(after.priceChanges, [{ date: T, from: 13.99, to: 15.99 }]);
  assert.match(rem.reminderSchedule().find((i) => i.id.startsWith(nf.id)).body + rem.reminderSchedule().find((i) => i.id.startsWith(nf.id)).title, /15\.99/);
  const e2 = store.markBillPaid(nf.id, { paidOn: '2026-12-20' });
  assert.equal(e2.amount, 15.99, 'next payment uses the new price');
  assert.ok(!store.isLatestPayment(nf.id, e1.id), 'an older payment is not the latest');
});

test('trip savings: progress, monthly amount, reminders and the Home card', () => {
  store.saveTrip({ name: 'Japan', startDate: '2027-06-12', endDate: '2027-06-26', budget: 0, currency: 'JPY', people: ['Me'] });
  let trip = store.getState().trips.find((t) => t.name === 'Japan');
  store.saveSavingsGoal(trip.id, { target: 1800, monthly: 0, remind: true, day: 25 });
  trip = store.getState().trips.find((t) => t.id === trip.id);
  let sv = store.tripSavings(trip, T);
  assert.equal(sv.months, 7, 'November to May');
  assert.equal(sv.suggested, 258);
  assert.equal(sv.monthly, 258);
  assert.equal(store.savingsDue(T).length, 1, 'the 25th has passed and nothing is saved this month');
  assert.equal(store.savingsDue('2026-11-24').length, 0, 'not before the reminder day');

  // Reminders from the next month on (this month's day has passed: the Home card covers it).
  let items = rem.savingsSchedule(T);
  assert.deepEqual(items.map((i) => i.id), [`save:${trip.id}:2026-12`, `save:${trip.id}:2027-01`, `save:${trip.id}:2027-02`]);
  assert.match(items[0].title, /^Put aside €258(\.00)? for Japan$/);
  assert.equal(items[0].fireAt, new Date(2026, 11, 25, 9, 0).toISOString());
  assert.equal(items[0].url, `./?trip=${trip.id}`);

  store.saveDeposit(trip.id, { amount: 300, date: T });
  trip = store.getState().trips.find((t) => t.id === trip.id);
  sv = store.tripSavings(trip, T);
  assert.equal(sv.saved, 300);
  assert.equal(sv.months, 6);
  assert.equal(sv.suggested, 250);
  assert.equal(store.savingsDue(T).length, 0);

  store.saveSavingsGoal(trip.id, { target: 1800, monthly: 200, remind: true, day: 31 });
  trip = store.getState().trips.find((t) => t.id === trip.id);
  sv = store.tripSavings(trip, T);
  assert.equal(sv.monthly, 200, 'a fixed monthly amount wins');
  assert.equal(sv.deposits.length, 1, 'editing the goal keeps what was saved');
  items = rem.savingsSchedule('2027-02-01');
  assert.equal(items[0].fireAt, new Date(2027, 1, 28, 9, 0).toISOString(), 'the 31st is clamped in February');

  // Reaching the goal stops reminders.
  store.saveDeposit(trip.id, { amount: 1500, date: '2026-12-25' });
  trip = store.getState().trips.find((t) => t.id === trip.id);
  assert.ok(store.tripSavings(trip, T).done);
  assert.deepEqual(rem.savingsSchedule(T), []);

  // No reminder on or after the start date.
  store.deleteDeposit(trip.id, store.tripSavings(trip, T).deposits[0].id);
  trip = store.getState().trips.find((t) => t.id === trip.id);
  assert.ok(rem.savingsSchedule('2027-05-30').every((i) => i.fireAt < new Date(2027, 5, 12).toISOString()));

  store.removeSavingsGoal(trip.id);
  assert.equal(store.getState().trips.find((t) => t.id === trip.id).savings, undefined);
});
