// App state: one JSON document in localStorage, with change subscribers.

import { today, addDays, nextOccurrence, occurrencesBetween, monthBounds, monthKey, diffDays, daysInMonth, parseISO } from './dates.js';
import { SPEND_CATEGORIES, TRIP_CATEGORIES } from './categories.js';
import { round2 } from './money.js';
import { migrateLegacy, hasLegacyData } from './migrate.js';
import { learn, merchantKey } from './applepay.js';

export const STORAGE_KEY = 'ledger.v1';

const DEFAULT_STATE = () => ({
  version: 1,
  settings: {
    currency: 'EUR',
    monthlyBudget: 0,
    theme: 'system',
    remindDays: 2,
    remindTime: '09:00',
    hideAmountsInPush: false,
    push: { url: '', deviceId: '', secret: '', enabled: false, lastSync: null, lastError: null },
    calendarExportedHash: null,
    migratedAt: null,
    lastBackupAt: null,
    lastSeenVersion: null,
    applePay: { enabled: false, token: '', lastFetch: null, lastError: null },
    cloudBackup: { enabled: false, keyRaw: '', backupId: '', lastAt: null, lastHash: null, lastError: null },
  },
  categories: SPEND_CATEGORIES.map((c) => ({ ...c, kind: 'spend' })),
  expenses: [],
  bills: [],
  trips: [],
  tripExpenses: [],
  merchantRules: {},
  notified: {},
});

let state = null;
const listeners = new Set();

export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function deepMerge(base, extra) {
  for (const [k, v] of Object.entries(extra || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      deepMerge(base[k], v);
    } else if (v !== undefined) base[k] = v;
  }
  return base;
}

export function load() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { saved = null; }
  state = deepMerge(DEFAULT_STATE(), saved || {});
  if (saved) persist(); // store the full shape with any new defaults
  let migration = null;
  if (!saved && hasLegacyData((k) => localStorage.getItem(k))) {
    migration = importLegacy();
  } else if (!saved) {
    // Fresh install: carry over currency/budget if the old app had them.
    const cur = localStorage.getItem('mainCurrency');
    if (cur) state.settings.currency = cur;
    persist();
  }
  return { state, migration };
}

export function importLegacy() {
  const res = migrateLegacy((k) => localStorage.getItem(k), { defaultRemindDays: state.settings.remindDays });
  state.settings = deepMerge(state.settings, res.settings);
  state.settings.migratedAt = new Date().toISOString();
  state.categories = res.categories;
  state.expenses = res.expenses;
  state.bills = res.bills;
  state.trips = res.trips;
  state.tripExpenses = res.tripExpenses;
  persist();
  return res.report;
}

export const getState = () => state;

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Could not save', err);
    throw err;
  }
}

export function update(fn, { silent } = {}) {
  fn(state);
  persist();
  if (!silent) listeners.forEach((l) => l(state));
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function replaceAll(data) {
  state = deepMerge(DEFAULT_STATE(), data);
  persist();
  listeners.forEach((l) => l(state));
}

// ---------- categories

export function category(id) {
  return state.categories.find((c) => c.id === id) ||
    TRIP_CATEGORIES.find((c) => c.id === id) ||
    { id, name: id || 'Other', icon: '📝' };
}

// Categories ordered by how often they were used in the last 90 days.
export function categoriesByUse() {
  const since = addDays(today(), -90);
  const counts = {};
  for (const e of state.expenses) if (e.date >= since) counts[e.category] = (counts[e.category] || 0) + 1;
  return [...state.categories].sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
}

// ---------- expenses

export function saveExpense(data) {
  update((s) => {
    if (data.source === 'applepay' && data.category) {
      learn(s.merchantRules, data.note, data.category);
      data = { ...data, needsReview: false };
    }
    const base = data.currency === s.settings.currency ? data.amount : data.baseAmount;
    const rec = { ...data, amount: round2(data.amount), baseAmount: round2(base ?? data.amount) };
    const i = s.expenses.findIndex((e) => e.id === rec.id);
    if (i >= 0) s.expenses[i] = { ...s.expenses[i], ...rec };
    else s.expenses.push({ ...rec, id: rec.id || uid('e'), createdAt: new Date().toISOString() });
  });
}

export function deleteExpense(id) {
  update((s) => {
    const ex = s.expenses.find((e) => e.id === id);
    s.expenses = s.expenses.filter((e) => e.id !== id);
    if (ex?.billId) {
      const bill = s.bills.find((b) => b.id === ex.billId);
      if (bill) bill.history = bill.history.filter((h) => h.expenseId !== id);
    }
  });
}

// ---------- bills

export function billStatus(bill, t = today()) {
  if (!bill.active || !bill.nextDue) return 'inactive';
  const d = diffDays(t, bill.nextDue);
  if (d < 0) return 'overdue';
  if (d === 0) return 'today';
  if (d <= Math.max(bill.remindDays ?? 2, 3)) return 'soon';
  return 'upcoming';
}

export function saveBill(data) {
  update((s) => {
    const i = s.bills.findIndex((b) => b.id === data.id);
    const anchorDay = parseISO(data.nextDue).getDate();
    if (i >= 0) {
      const prev = s.bills[i];
      s.bills[i] = { ...prev, ...data, amount: round2(data.amount), anchorDay: data.nextDue !== prev.nextDue ? anchorDay : prev.anchorDay };
    } else {
      s.bills.push({
        id: uid('b'), history: [], active: true, autopay: false, notes: '', endDate: null,
        startDate: data.nextDue, createdAt: new Date().toISOString(),
        ...data, amount: round2(data.amount), anchorDay,
      });
    }
  });
}

export function deleteBill(id) {
  update((s) => {
    s.bills = s.bills.filter((b) => b.id !== id);
    s.expenses.forEach((e) => { if (e.billId === id) e.billId = null; });
  });
}

function advance(bill) {
  const n = nextOccurrence(bill.nextDue, bill.frequency, bill.anchorDay);
  if (!n || (bill.endDate && n > bill.endDate)) { bill.active = false; bill.nextDue = null; }
  else bill.nextDue = n;
}

// Log a payment for the bill's current due date and move it to the next one.
export function markBillPaid(id, { paidOn, amount, baseAmount } = {}, s0) {
  const run = (s) => {
    const bill = s.bills.find((b) => b.id === id);
    if (!bill || !bill.nextDue) return null;
    const amt = round2(amount ?? bill.amount);
    const exp = {
      id: uid('e'),
      amount: amt,
      currency: bill.currency,
      baseAmount: round2(bill.currency === s.settings.currency ? amt : (baseAmount ?? amt)),
      category: bill.category,
      note: bill.name,
      date: paidOn || today(),
      billId: bill.id,
      person: '',
      createdAt: new Date().toISOString(),
    };
    s.expenses.push(exp);
    bill.history.push({ due: bill.nextDue, paidOn: exp.date, expenseId: exp.id, amount: amt });
    advance(bill);
    return exp;
  };
  if (s0) return run(s0);
  let out;
  update((s) => { out = run(s); });
  return out;
}

export function skipBill(id) {
  update((s) => {
    const bill = s.bills.find((b) => b.id === id);
    if (!bill || !bill.nextDue) return;
    bill.history.push({ due: bill.nextDue, skipped: true });
    advance(bill);
  });
}

export function undoLastBillAction(id) {
  update((s) => {
    const bill = s.bills.find((b) => b.id === id);
    const last = bill?.history.pop();
    if (!last) return;
    if (last.expenseId) s.expenses = s.expenses.filter((e) => e.id !== last.expenseId);
    bill.nextDue = last.due;
    bill.active = true;
  });
}

// Bills set to autopay are logged automatically on their due date.
export function runAutopay(t = today()) {
  let count = 0;
  const hasDue = state.bills.some((b) => b.active && b.autopay && b.nextDue && b.nextDue <= t);
  if (!hasDue) return 0;
  update((s) => {
    for (const bill of s.bills) {
      let guard = 0;
      while (bill.active && bill.autopay && bill.nextDue && bill.nextDue <= t && guard++ < 60) {
        markBillPaid(bill.id, { paidOn: bill.nextDue }, s);
        count++;
      }
    }
  });
  return count;
}

export function upcomingBills(days = 30, t = today()) {
  const until = addDays(t, days);
  return state.bills
    .filter((b) => b.active && b.nextDue && b.nextDue <= until)
    .sort((a, b) => (a.nextDue < b.nextDue ? -1 : a.nextDue > b.nextDue ? 1 : a.name.localeCompare(b.name)));
}

export function attentionCount(t = today()) {
  return state.bills.filter((b) => ['overdue', 'today'].includes(billStatus(b, t))).length;
}

// Monthly cost of all active bills, normalised to one month.
export function monthlyCommitment() {
  const perMonth = { weekly: 52 / 12, biweekly: 26 / 12, monthly: 1, quarterly: 1 / 3, semiannual: 1 / 6, yearly: 1 / 12, once: 0 };
  return round2(state.bills.filter((b) => b.active).reduce((s, b) => s + baseOf(b.amount, b.currency) * (perMonth[b.frequency] ?? 1), 0));
}

function baseOf(amount, cur) {
  if (cur === state.settings.currency) return amount;
  try {
    const rates = JSON.parse(localStorage.getItem('ledger.rates')) || {};
    const r = rates[`${cur}>${state.settings.currency}`];
    return r ? amount * r.rate : amount;
  } catch { return amount; }
}

// ---------- monthly summary

export function monthSpending(key) {
  const { start, end } = monthBounds(key);
  const items = state.expenses.filter((e) => e.date >= start && e.date < end);
  const tripItems = state.tripExpenses.filter((e) => e.countInMonthly && e.date >= start && e.date < end);
  const total = round2(items.reduce((s, e) => s + (e.baseAmount ?? e.amount), 0) + tripItems.reduce((s, e) => s + (e.baseAmount ?? 0), 0));
  const byCat = {};
  for (const e of items) byCat[e.category] = (byCat[e.category] || 0) + (e.baseAmount ?? e.amount);
  const tripTotal = tripItems.reduce((s, e) => s + (e.baseAmount ?? 0), 0);
  if (tripTotal) byCat.travel = (byCat.travel || 0) + tripTotal;
  return { total, items, tripItems, byCat };
}

export function monthSummary(key = monthKey(today()), t = today()) {
  const { start, end, days } = monthBounds(key);
  const { total, byCat } = monthSpending(key);
  const budget = state.settings.monthlyBudget || 0;
  const isCurrent = t >= start && t < end;
  // Bills still to pay this month, including any that are overdue.
  const pending = [];
  if (isCurrent) {
    for (const b of state.bills) {
      if (!b.active || !b.nextDue) continue;
      for (const d of occurrencesBetween(b.nextDue, b.frequency, '0000-01-01', end, b.anchorDay, b.endDate)) {
        pending.push({ bill: b, due: d, amount: baseOf(b.amount, b.currency) });
      }
    }
  }
  const committed = round2(pending.reduce((s, p) => s + p.amount, 0));
  const daysLeft = isCurrent ? days - parseISO(t).getDate() + 1 : 0;
  const left = round2(budget - total - committed);
  return {
    key, start, end, days, budget, spent: total, committed, pending, left, daysLeft, byCat, isCurrent,
    perDay: daysLeft > 0 ? round2(Math.max(left, 0) / daysLeft) : 0,
  };
}

export function monthlyTotals(n = 6, t = today()) {
  const out = [];
  let key = monthKey(t);
  for (let i = 0; i < n; i++) {
    out.unshift({ key, total: monthSpending(key).total });
    const [y, m] = key.split('-').map(Number);
    key = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  }
  return out;
}

// ---------- trips

export function tripStatus(trip, t = today()) {
  if (trip.closed) return 'past';
  if (t < trip.startDate) return 'upcoming';
  if (t > trip.endDate) return 'past';
  return 'ongoing';
}

export function activeTrip(t = today()) {
  return state.trips.find((tr) => tripStatus(tr, t) === 'ongoing') || null;
}

export function saveTrip(data) {
  update((s) => {
    const i = s.trips.findIndex((t) => t.id === data.id);
    if (i >= 0) s.trips[i] = { ...s.trips[i], ...data };
    else s.trips.push({ id: uid('t'), people: ['Me'], closed: false, countInMonthly: false, createdAt: new Date().toISOString(), ...data });
  });
}

export function deleteTrip(id) {
  update((s) => {
    s.trips = s.trips.filter((t) => t.id !== id);
    s.tripExpenses = s.tripExpenses.filter((e) => e.tripId !== id);
  });
}

export function saveTripExpense(data) {
  update((s) => {
    const i = s.tripExpenses.findIndex((e) => e.id === data.id);
    const rec = { ...data, amount: round2(data.amount), tripAmount: round2(data.tripAmount), baseAmount: round2(data.baseAmount) };
    if (i >= 0) s.tripExpenses[i] = { ...s.tripExpenses[i], ...rec };
    else s.tripExpenses.push({ split: true, ...rec, id: uid('x'), createdAt: new Date().toISOString() });
    const trip = s.trips.find((t) => t.id === rec.tripId);
    if (trip && rec.payer && !trip.people.includes(rec.payer)) trip.people.push(rec.payer);
  });
}

export function deleteTripExpense(id) {
  update((s) => { s.tripExpenses = s.tripExpenses.filter((e) => e.id !== id); });
}

export function tripSummary(trip) {
  const items = state.tripExpenses.filter((e) => e.tripId === trip.id).sort((a, b) => (a.date < b.date ? 1 : -1));
  const total = round2(items.reduce((s, e) => s + e.tripAmount, 0));
  const byCat = {};
  for (const e of items) byCat[e.category] = (byCat[e.category] || 0) + e.tripAmount;
  const length = Math.max(1, diffDays(trip.startDate, trip.endDate) + 1);
  const t = today();
  const elapsed = Math.min(length, Math.max(1, diffDays(trip.startDate, t) + 1));
  // Equal split among trip people for expenses marked as shared.
  const people = trip.people?.length ? trip.people : ['Me'];
  const paid = Object.fromEntries(people.map((p) => [p, 0]));
  const share = Object.fromEntries(people.map((p) => [p, 0]));
  for (const e of items) {
    paid[e.payer] = (paid[e.payer] || 0) + e.tripAmount;
    if (e.split !== false && people.length > 1) people.forEach((p) => { share[p] += e.tripAmount / people.length; });
    else share[e.payer] = (share[e.payer] || 0) + e.tripAmount;
  }
  const balances = Object.keys(paid).map((p) => ({ person: p, paid: round2(paid[p]), share: round2(share[p] || 0), net: round2(paid[p] - (share[p] || 0)) }));
  return { items, total, byCat, length, elapsed, perDay: round2(total / (tripStatus(trip) === 'upcoming' ? length : elapsed)), balances, settle: settleUp(balances) };
}

// Fewest payments to even out who owes whom.
export function settleUp(balances) {
  const debtors = balances.filter((b) => b.net < -0.005).map((b) => ({ ...b, net: -b.net })).sort((a, b) => b.net - a.net);
  const creditors = balances.filter((b) => b.net > 0.005).map((b) => ({ ...b })).sort((a, b) => b.net - a.net);
  const out = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].net, creditors[j].net);
    out.push({ from: debtors[i].person, to: creditors[j].person, amount: round2(amt) });
    debtors[i].net -= amt; creditors[j].net -= amt;
    if (debtors[i].net < 0.005) i++;
    if (creditors[j].net < 0.005) j++;
  }
  return out;
}

export { daysInMonth };

// ---------- Apple Pay payments

export const reviewCount = () => state.expenses.filter((e) => e.needsReview).length;

// Set categories for payments being checked, remember each shop, and apply the
// choice to other unchecked payments from the same shop.
export function reviewPayments(choices) {
  let alsoApplied = 0;
  update((s) => {
    for (const { id, category } of choices) {
      const e = s.expenses.find((x) => x.id === id);
      if (!e || !category) continue;
      e.category = category;
      e.needsReview = false;
      learn(s.merchantRules, e.note, category);
      for (const other of s.expenses) {
        if (other.needsReview && other.id !== e.id && merchantKey(other.note) === merchantKey(e.note) && !choices.some((c) => c.id === other.id)) {
          other.category = category;
          other.needsReview = false;
          alsoApplied++;
        }
      }
    }
  });
  return alsoApplied;
}
