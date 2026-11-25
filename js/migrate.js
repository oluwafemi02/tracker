// One-way import from the old app's localStorage keys into the new state.
// The old keys are never modified or deleted, so the import can be re-run.
// Pure function: pass a getter (key => string|null) so it can be unit tested.

import { normalizeISO, firstOnOrAfter, nextOccurrence, addDays, parseISO, today as todayISO, FREQUENCIES } from './dates.js';
import { SPEND_CATEGORIES, findSpendCategory, matchTripCategory, slug } from './categories.js';
import { round2 } from './money.js';

const parse = (raw, fallback) => {
  if (raw == null) return fallback;
  try { const v = JSON.parse(raw); return v ?? fallback; } catch { return fallback; }
};

export const LEGACY_KEYS = ['familyExpenses', 'recurringExpenses', 'trips', 'travelExpenses', 'monthlyBudget', 'mainCurrency', 'customCategories'];

export function hasLegacyData(get) {
  return ['familyExpenses', 'recurringExpenses', 'trips', 'travelExpenses', 'trip_history_backup']
    .some((k) => { const v = parse(get(k), null); return Array.isArray(v) && v.length > 0; });
}

function firstArray(get, keys) {
  for (const k of keys) {
    const v = parse(get(k), null);
    if (Array.isArray(v) && v.length) return v;
  }
  return [];
}

export function migrateLegacy(get, { today = todayISO(), defaultRemindDays = 2 } = {}) {
  const report = { expenses: 0, bills: 0, trips: 0, tripExpenses: 0, skippedDuplicates: 0, droppedBillDuplicates: 0, notes: [] };
  const currency = (get('mainCurrency') || 'EUR').replace(/"/g, '') || 'EUR';
  const monthlyBudget = round2(parseFloat(get('monthlyBudget')) || 0);
  const dark = get('darkMode');

  // ---- categories
  const categories = SPEND_CATEGORIES.map((c) => ({ ...c, kind: 'spend' }));
  const legacyCustom = parse(get('customCategories'), []);
  const ensureCategory = (name, icon) => {
    const existing = findSpendCategory(categories, name);
    if (existing) return existing.id;
    const clean = String(name || 'Other').trim();
    const custom = legacyCustom.find((c) => String(c.name).toLowerCase() === clean.toLowerCase());
    let id = slug(clean);
    while (categories.some((c) => c.id === id)) id += '-x';
    categories.push({ id, name: clean, icon: icon || custom?.icon || '🏷️', kind: 'spend', custom: true });
    return id;
  };
  for (const c of Array.isArray(legacyCustom) ? legacyCustom : []) {
    if (c && c.name) ensureCategory(c.name, c.icon);
  }

  // ---- bills (old "recurringExpenses")
  const legacyRecurring = parse(get('recurringExpenses'), []);
  const bills = [];
  const billIdMap = new Map(); // old recurring id -> new bill id
  const originalExpenseToBill = new Map();
  const seen = new Map();
  for (const r of Array.isArray(legacyRecurring) ? legacyRecurring : []) {
    if (!r || !(Number(r.amount) > 0)) continue;
    const start = normalizeISO(r.startDate || r.date || r.lastProcessedDate) || today;
    let frequency = r.frequency || r.recurringFrequency || 'monthly';
    if (frequency === 'daily') { frequency = 'weekly'; report.notes.push(`"${r.description || r.category}" was daily; set to weekly, please check it.`); }
    if (!FREQUENCIES[frequency]) frequency = 'monthly';
    const name = String(r.description || r.category || 'Bill').replace(/\s*\(Auto-recurring\)\s*$/i, '').trim();
    const dupKey = [name.toLowerCase(), Number(r.amount), frequency, r.category].join('|');
    if (seen.has(dupKey)) {
      billIdMap.set(String(r.id), seen.get(dupKey));
      if (r.originalExpenseId != null) originalExpenseToBill.set(String(r.originalExpenseId), seen.get(dupKey));
      report.droppedBillDuplicates++;
      continue;
    }
    const anchorDay = parseISO(start).getDate();
    // Only surface missed payments from the last 7 days; older gaps are from the time
    // the app was not in use and would just be noise.
    const fromSchedule = firstOnOrAfter(start, frequency, addDays(today, -7), anchorDay);
    const last = normalizeISO(r.lastProcessedDate);
    const afterLast = last ? nextOccurrence(last, frequency, anchorDay) : null;
    let nextDue = afterLast && afterLast > fromSchedule ? afterLast : fromSchedule;
    let active = r.isActive !== false;
    const endDate = normalizeISO(r.endDate);
    if (endDate && nextDue > endDate) active = false;

    const id = 'b' + String(r.id).replace(/\W/g, '');
    const bill = {
      id,
      name,
      amount: round2(r.amount),
      currency: r.currency || currency,
      category: ensureCategory(r.category || 'Other'),
      frequency,
      anchorDay,
      startDate: start,
      nextDue,
      endDate: endDate || null,
      remindDays: defaultRemindDays,
      autopay: false,
      active,
      notes: '',
      history: [],
      createdAt: r.created || new Date().toISOString(),
      legacyId: String(r.id),
    };
    bills.push(bill);
    seen.set(dupKey, id);
    billIdMap.set(String(r.id), id);
    if (r.originalExpenseId != null) originalExpenseToBill.set(String(r.originalExpenseId), id);
    report.bills++;
  }

  // ---- trips
  const legacyTrips = firstArray(get, ['trips', 'tripData', 'travelTrips', 'trip_history_backup']);
  const legacyTravel = firstArray(get, ['travelExpenses', 'tripExpenses', 'travel_expenses_backup']);
  const trips = [];
  const tripById = new Map();
  for (const t of legacyTrips) {
    if (!t || t.id == null) continue;
    const id = 't' + String(t.id).replace(/\W/g, '');
    if (tripById.has(String(t.id))) continue;
    const trip = {
      id,
      name: String(t.name || t.destination || 'Trip').trim(),
      destination: String(t.destination || '').trim(),
      startDate: normalizeISO(t.startDate) || today,
      endDate: normalizeISO(t.endDate) || normalizeISO(t.startDate) || today,
      budget: round2(t.budget || 0),
      currency: t.currency || currency,
      people: ['Me'],
      countInMonthly: false,
      closed: t.status === 'completed',
      createdAt: t.createdAt || new Date().toISOString(),
    };
    trips.push(trip);
    tripById.set(String(t.id), trip);
    report.trips++;
  }

  const tripExpenses = [];
  const linkedTravelIds = new Set();
  for (const e of legacyTravel) {
    if (!e || !(Number(e.amount) > 0)) continue;
    const trip = tripById.get(String(e.tripId));
    if (!trip) continue;
    const cur = e.currency || trip.currency;
    let tripAmount = Number(e.amount);
    if (cur !== trip.currency) {
      if (trip.currency === currency && e.convertedAmount) tripAmount = Number(e.convertedAmount);
      else report.notes.push(`A ${trip.name} expense in ${cur} could not be converted to ${trip.currency}; kept the original amount.`);
    }
    let baseAmount = Number(e.amount);
    if (cur !== currency) baseAmount = e.convertedAmount ? Number(e.convertedAmount) : (trip.currency === currency ? tripAmount : Number(e.amount));
    const payer = String(e.payer || 'Me').trim() || 'Me';
    const normalizedPayer = /^(me|you|family)$/i.test(payer) ? 'Me' : payer;
    if (!trip.people.includes(normalizedPayer)) trip.people.push(normalizedPayer);
    const note = [e.description, e.location].filter(Boolean).join(' · ');
    tripExpenses.push({
      id: 'x' + String(e.id).replace(/\W/g, ''),
      tripId: trip.id,
      amount: round2(e.amount),
      currency: cur,
      tripAmount: round2(tripAmount),
      baseAmount: round2(baseAmount),
      category: matchTripCategory(e.category),
      note,
      date: normalizeISO(e.date) || trip.startDate,
      payer: normalizedPayer,
      split: true,
      countInMonthly: !!e.deductFromMainBudget,
      createdAt: e.createdAt || new Date().toISOString(),
    });
    linkedTravelIds.add(String(e.id));
    report.tripExpenses++;
  }

  // ---- everyday expenses
  const legacyExpenses = parse(get('familyExpenses'), []);
  const expenses = [];
  const expSeen = new Set();
  for (const e of Array.isArray(legacyExpenses) ? legacyExpenses : []) {
    if (!e || !(Number(e.amount) > 0)) continue;
    // Trip expenses that were copied into the monthly list now live on the trip only.
    if (e.travelExpenseId != null && linkedTravelIds.has(String(e.travelExpenseId))) { report.skippedDuplicates++; continue; }
    const date = normalizeISO(e.date);
    if (!date) continue;
    const billId = e.parentRecurringId != null ? billIdMap.get(String(e.parentRecurringId))
      : originalExpenseToBill.get(String(e.id));
    const note = String(e.description || '').replace(/\s*\(Auto-recurring\)\s*$/i, '').trim();
    const dedupe = [date, Number(e.amount), e.category, note, billId || ''].join('|');
    if (billId && expSeen.has(dedupe)) { report.skippedDuplicates++; continue; }
    expSeen.add(dedupe);
    const cur = e.currency || currency;
    const baseAmount = cur === currency ? Number(e.amount) : Number(e.convertedAmount || e.amount);
    const person = e.person && !/^(you|me)$/i.test(e.person) ? String(e.person) : '';
    expenses.push({
      id: 'e' + String(e.id).replace(/\W/g, ''),
      amount: round2(e.amount),
      currency: cur,
      baseAmount: round2(baseAmount),
      category: ensureCategory(e.category || 'Other'),
      note,
      date,
      billId: billId || null,
      person,
      createdAt: e.timestamp || new Date().toISOString(),
    });
    report.expenses++;
  }

  // Record paid history on bills from the linked expenses.
  for (const ex of expenses) {
    if (!ex.billId) continue;
    const bill = bills.find((b) => b.id === ex.billId);
    if (bill) bill.history.push({ due: ex.date, paidOn: ex.date, expenseId: ex.id, amount: ex.amount });
  }
  for (const b of bills) b.history.sort((a, c) => (a.due < c.due ? -1 : 1));

  return {
    settings: {
      currency,
      monthlyBudget,
      theme: dark === 'true' ? 'dark' : 'system',
    },
    categories,
    expenses,
    bills,
    trips,
    tripExpenses,
    report,
  };
}
