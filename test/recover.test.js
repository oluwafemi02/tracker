import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { collectLegacy, planRecovery, applyRecovery, localBundles, parseRecoveryFile } from '../js/recover.js';
import { migrateLegacy } from '../js/migrate.js';
import { legacy, getter } from './legacy-fixture.js';

const baseState = () => ({
  settings: { currency: 'EUR' },
  categories: [{ id: 'dining', name: 'Dining' }, { id: 'food-dining', name: '🍽️ Food & Dining', custom: true }],
  expenses: [],
  trips: [],
  tripExpenses: [],
});

const oldTrip = { id: 1755000000000, name: 'Lagos Christmas', destination: 'Lagos', startDate: '2025-12-18', endDate: '2026-01-04', budget: 1200, currency: 'EUR', status: 'completed' };
const oldTx = (id, amount, date, extra = {}) => ({ id, tripId: oldTrip.id, amount, currency: 'EUR', category: '🍽️ Food & Dining', date, payer: 'Me', description: 'Suya', ...extra });

test('finds trips under any key, including backups and the current-trip slot', () => {
  const entries = [
    ['trips', JSON.stringify([])], // emptied by an update
    ['trip_history_backup', JSON.stringify([oldTrip])],
    ['currentTrip', JSON.stringify({ id: 1756000000000, name: 'Kaunas', startDate: '2026-02-01', endDate: '2026-02-02' })],
    ['travelExpenses', JSON.stringify([oldTx(1, 20, '2025-12-19')])],
    ['travel_expenses_backup', JSON.stringify([oldTx(1, 20, '2025-12-19'), oldTx(2, 35.5, '2025-12-20', { payer: 'Ada' })])],
    ['familyExpenses', JSON.stringify([{ id: 9, amount: 5, category: 'Dining', date: '2025-12-19' }])],
    ['ledger.v1', JSON.stringify({ trips: [{ id: 'tX', name: 'Ignore me', startDate: '2026-01-01', endDate: '2026-01-02' }] })],
  ];
  const found = collectLegacy(entries);
  assert.deepEqual(found.trips.map((t) => t.name).sort(), ['Kaunas', 'Lagos Christmas']);
  assert.deepEqual(found.travelExpenses.map((e) => e.id).sort(), [1, 2]);
});

test('plans and applies missing trips without duplicates', () => {
  const state = baseState();
  const entries = [['trip_history_backup', JSON.stringify([oldTrip])], ['travelExpenses', JSON.stringify([oldTx(1, 20, '2025-12-19'), oldTx(2, 35.5, '2025-12-20', { payer: 'Ada' })])]];
  let groups = planRecovery(state, localBundles(state, entries));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].isNew, true);
  assert.equal(groups[0].trip.name, 'Lagos Christmas');
  assert.equal(groups[0].total, 55.5);
  applyRecovery(state, groups);
  assert.equal(state.trips.length, 1);
  assert.deepEqual(state.trips[0].people, ['Me', 'Ada']);
  assert.equal(state.tripExpenses.length, 2);
  // Running it again finds nothing new.
  groups = planRecovery(state, localBundles(state, entries));
  assert.equal(groups.length, 0);
});

test('adds only the missing expenses to a trip you still have', () => {
  const state = baseState();
  const res = migrateLegacy((k) => ({ trips: JSON.stringify([oldTrip]), travelExpenses: JSON.stringify([oldTx(1, 20, '2025-12-19')]), mainCurrency: 'EUR' })[k] ?? null);
  state.trips = res.trips;
  state.tripExpenses = res.tripExpenses;
  const entries = [['travel_expenses_backup', JSON.stringify([oldTx(1, 20, '2025-12-19'), oldTx(2, 35.5, '2025-12-20'), oldTx(3, 12, '2026-01-06')])], ['trips', JSON.stringify([oldTrip])]];
  const groups = planRecovery(state, localBundles(state, entries));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].isNew, false);
  assert.deepEqual(groups[0].tripExpenses.map((e) => e.amount), [35.5, 12]);
  applyRecovery(state, groups);
  assert.equal(state.tripExpenses.length, 3);
  assert.equal(state.trips[0].endDate, '2026-01-06', 'trip dates widen to cover the expenses');
});

test('rebuilds a trip from "(Trip: name)" copies in monthly spending and keeps the monthly total', () => {
  // The fixture's Riga trip is gone; only the monthly copy survived.
  const L = { ...legacy, trips: '[]', travelExpenses: '[]', trip_history_backup: undefined };
  const res = migrateLegacy(getter(L), { today: '2026-11-25' });
  const copy = res.expenses.find((e) => /\(Trip: Riga\)/.test(e.note));
  assert.ok(copy, 'the copy is kept as a normal expense during import');
  const state = { ...baseState(), categories: res.categories, expenses: res.expenses };
  const monthBefore = state.expenses.filter((e) => e.date.startsWith('2025-08')).reduce((s, e) => s + e.baseAmount, 0);
  const groups = planRecovery(state, localBundles(state, []));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].trip.name, 'Riga');
  assert.deepEqual(groups[0].removeExpenseIds, [copy.id]);
  assert.equal(groups[0].tripExpenses[0].category, 't-food');
  assert.equal(groups[0].tripExpenses[0].note, 'Dinner');
  applyRecovery(state, groups);
  assert.equal(state.expenses.some((e) => e.id === copy.id), false);
  const tx = state.tripExpenses[0];
  assert.equal(tx.countInMonthly, true);
  const monthAfter = state.expenses.filter((e) => e.date.startsWith('2025-08')).reduce((s, e) => s + e.baseAmount, 0)
    + state.tripExpenses.filter((e) => e.countInMonthly && e.date.startsWith('2025-08')).reduce((s, e) => s + e.baseAmount, 0);
  assert.equal(monthAfter, monthBefore);
});

test('reads an old-app backup file', () => {
  const file = JSON.stringify({ expenses: [], trips: [oldTrip], travelExpenses: [oldTx(1, 20, '2025-12-19')], currentTrip: null, version: '1.0' });
  const bundle = parseRecoveryFile('expense-tracker-backup-2026-01-05.json', file, 'EUR');
  const groups = planRecovery(baseState(), [bundle]);
  assert.equal(groups[0].trip.name, 'Lagos Christmas');
  assert.equal(groups[0].sources[0], 'expense-tracker-backup-2026-01-05.json');
});

test('reads an old trip CSV export', () => {
  const csv = '"Date","Category","Amount (€)","Location","Description"\n"2025-12-19","🍽️ Food & Dining","20.00","Lekki","Suya, spicy"\n"2025-12-20","🚕 Taxi/Uber","8.50","",""';
  const bundle = parseRecoveryFile('Lagos_Christmas_expenses.csv', csv, 'EUR');
  assert.equal(bundle.trips[0].name, 'Lagos Christmas');
  assert.equal(bundle.trips[0].startDate, '2025-12-19');
  assert.equal(bundle.trips[0].endDate, '2025-12-20');
  assert.deepEqual(bundle.tripExpenses.map((e) => [e.amount, e.category, e.note]), [[20, 't-food', 'Suya, spicy · Lekki'], [8.5, 't-taxi', '']]);
});

test('rejects files that hold no trips', () => {
  assert.throws(() => parseRecoveryFile('x.json', '{"hello":1}', 'EUR'), /No trips found/);
  assert.throws(() => parseRecoveryFile('x.txt', 'nonsense', 'EUR'), /not a backup or a trip export/);
});

test('early old-app trips with no currency come back in euros, whatever the main currency', () => {
  // Shape of the old app's August 2025 backups: no currency on the trip or its expenses.
  const backup = JSON.stringify({
    expenses: [{ id: 1, amount: 100, category: 'Mortgage', date: '2025-07-10', currency: 'GBP' }],
    trips: [{ id: 42, name: 'Summer road trip', destination: 'Poland', startDate: '2025-07-28', endDate: '2025-08-08', budget: 0, status: 'completed' }],
    travelExpenses: [
      { id: 7, tripId: 42, amount: 113, category: '⛽ Fuel', date: '2025-07-27', location: 'Vilnius', description: '' },
      { id: 8, tripId: 42, amount: 320, category: '🎫 Attractions', date: '2025-07-27', location: 'Poland', description: 'Theme park' },
      { id: 9, tripId: 42, amount: 62, category: '⛽ Fuel', date: '2025-08-07', payer: 'Me', deductFromMainBudget: true },
    ],
    currentTrip: null,
    version: '1.0',
  });
  const bundle = parseRecoveryFile('expense-tracker-backup-2025-08-26.json', backup, 'GBP');
  const state = { ...baseState(), settings: { currency: 'GBP' } };
  const [g] = planRecovery(state, [bundle]);
  assert.equal(g.trip.currency, 'EUR');
  assert.deepEqual(g.tripExpenses.map((e) => [e.currency, e.category, e.countInMonthly]), [['EUR', 't-fuel', false], ['EUR', 't-activities', false], ['EUR', 't-fuel', true]]);
  applyRecovery(state, [g]);
  assert.equal(state.trips[0].startDate, '2025-07-27', 'start moves back to the first expense');
});
