// Find trips that went missing and add them back. Only ever adds; never replaces or deletes
// anything except the "(Trip: name)" copies in monthly spending that become real trip expenses.
//
// Sources:
//  1. Any localStorage key on this phone holding old-format trips or trip expenses
//     (trips, tripData, travelTrips, trip_history_backup, currentTrip, travelExpenses, ...).
//  2. Monthly expenses whose note ends with "(Trip: name)": the old app copied trip
//     expenses there when "deduct from main budget" was on.
//  3. Files: a backup from this app, a backup from the old app
//     (expense-tracker-backup-*.json), or an old trip export (<Trip>_expenses.csv).

import { migrateLegacy } from './migrate.js';
import { matchTripCategory, slug } from './categories.js';
import { normalizeISO } from './dates.js';
import { round2 } from './money.js';

const COPY_RE = /\s*\(Trip:\s*(.+?)\)\s*$/;
const SKIP_KEYS = new Set(['ledger.v1', 'ledger.rates', '__e2e']);

const parse = (raw) => { try { return JSON.parse(raw); } catch { return null; } };
const isTrip = (t) => t && typeof t === 'object' && t.id != null && !('tripId' in t) && (t.name || t.destination) && (t.startDate || t.endDate);
const isTripTx = (e) => e && typeof e === 'object' && e.id != null && e.tripId != null && Number(e.amount) > 0;
const tripKey = (t) => `${String(t.name || '').trim().toLowerCase()}|${t.startDate || ''}`;

// Gather old-format trips and trip expenses from every stored value, wherever they are.
export function collectLegacy(entries) {
  const trips = new Map();
  const txs = new Map();
  const visit = (v) => {
    if (Array.isArray(v)) { v.forEach(visit); return; }
    if (!v || typeof v !== 'object') return;
    if (isTrip(v)) { const k = String(v.id); trips.set(k, { ...v, ...(trips.get(k) || {}) }); return; }
    if (isTripTx(v)) { txs.set(String(v.id), txs.get(String(v.id)) || v); return; }
    // Old backup files and snapshots nest the arrays one level down.
    for (const key of ['trips', 'travelExpenses', 'tripExpenses', 'currentTrip', 'activeTrip']) if (v[key]) visit(v[key]);
  };
  for (const [key, raw] of entries) {
    if (SKIP_KEYS.has(key)) continue;
    const v = parse(raw);
    if (v && typeof v === 'object') visit(v);
  }
  return { trips: [...trips.values()], travelExpenses: [...txs.values()] };
}

// Turn old-format records into this app's format (same rules as the first-time import).
export function convertLegacy({ trips, travelExpenses, expenses = [] }, currency) {
  const store = {
    trips: JSON.stringify(trips || []),
    travelExpenses: JSON.stringify(travelExpenses || []),
    familyExpenses: JSON.stringify(expenses || []),
    mainCurrency: currency,
  };
  const res = migrateLegacy((k) => (k in store ? store[k] : null));
  return { trips: res.trips, tripExpenses: res.tripExpenses, copies: res.expenses.filter((e) => COPY_RE.test(e.note || '')) };
}

// Parse a file the person picked. Returns a bundle, or throws with a message to show.
export function parseRecoveryFile(name, text, currency) {
  const trimmed = text.replace(/^﻿/, '').trim();
  if (/\.csv$/i.test(name) || /^"?Date"?\s*,/i.test(trimmed)) return parseTripCsv(name, trimmed, currency);
  const data = parse(trimmed);
  if (!data || typeof data !== 'object') throw new Error('That file is not a backup or a trip export.');
  if (data.settings && Array.isArray(data.tripExpenses)) {
    // A backup from this app.
    return { label: name, trips: data.trips || [], tripExpenses: data.tripExpenses || [], copies: (data.expenses || []).filter((e) => COPY_RE.test(e.note || '')), removable: false };
  }
  const legacy = collectLegacy([['file', trimmed]]);
  const copiesSource = Array.isArray(data.expenses) ? data.expenses : [];
  if (!legacy.trips.length && !legacy.travelExpenses.length && !copiesSource.some((e) => COPY_RE.test(e.description || ''))) {
    throw new Error('No trips found in that file.');
  }
  return { label: name, ...convertLegacy({ ...legacy, expenses: copiesSource }, currency), removable: false };
}

// "Date","Category","Amount (€)","Location","Description" from the old trip export.
function parseTripCsv(name, text, currency) {
  const rows = text.split(/\r?\n/).filter(Boolean).map(parseCsvLine);
  const head = rows.shift().map((h) => h.toLowerCase());
  const col = (re) => head.findIndex((h) => re.test(h));
  const iDate = col(/^date/), iCat = col(/categ/), iAmt = col(/amount/), iLoc = col(/locat/), iDesc = col(/descr|note/);
  if (iDate < 0 || iAmt < 0) throw new Error('That CSV does not look like a trip export.');
  const cur = /€/.test(head[iAmt]) ? 'EUR' : currency;
  const tripName = name.replace(/\.csv$/i, '').replace(/_expenses$/i, '').replace(/_+/g, ' ').trim() || 'Recovered trip';
  const items = rows.map((r) => ({ date: normalizeISO(r[iDate]), amount: parseFloat(String(r[iAmt]).replace(',', '.')), category: r[iCat], location: iLoc >= 0 ? r[iLoc] : '', description: iDesc >= 0 ? r[iDesc] : '' }))
    .filter((r) => r.date && r.amount > 0);
  if (!items.length) throw new Error('That CSV has no expenses in it.');
  const dates = items.map((i) => i.date).sort();
  const id = `t${slug(tripName)}${dates[0].replace(/-/g, '')}`;
  const trip = { id, name: tripName, destination: '', startDate: dates[0], endDate: dates.at(-1), budget: 0, currency: cur, people: ['Me'], countInMonthly: false, closed: true, createdAt: new Date().toISOString() };
  const tripExpenses = items.map((i, n) => ({
    id: `x${id}${n}`, tripId: id, amount: round2(i.amount), currency: cur, tripAmount: round2(i.amount), baseAmount: round2(i.amount),
    category: matchTripCategory(i.category), note: [i.description, i.location].filter(Boolean).join(' · '), date: i.date, payer: 'Me', split: true, countInMonthly: false, createdAt: new Date().toISOString(),
  }));
  return { label: name, trips: [trip], tripExpenses, copies: [], removable: false };
}

function parseCsvLine(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// Compare what was found with what the app already has, and build a list to offer.
export function planRecovery(state, bundles) {
  const groups = new Map(); // by trip id
  const haveTripIds = new Set(state.trips.map((t) => t.id));
  const haveTripKeys = new Map(state.trips.map((t) => [tripKey(t), t.id]));
  const haveTxIds = new Set(state.tripExpenses.map((e) => e.id));
  const txSig = (e) => `${e.date}|${round2(e.tripAmount ?? e.amount)}`;
  const haveTxSigs = new Map();
  for (const e of state.tripExpenses) {
    if (!haveTxSigs.has(e.tripId)) haveTxSigs.set(e.tripId, new Set());
    haveTxSigs.get(e.tripId).add(txSig(e));
  }

  const groupFor = (trip, source) => {
    const existingId = haveTripIds.has(trip.id) ? trip.id : haveTripKeys.get(tripKey(trip));
    const id = existingId || trip.id;
    if (!groups.has(id)) {
      groups.set(id, { id, trip: existingId ? state.trips.find((t) => t.id === existingId) : { ...trip }, isNew: !existingId, sources: new Set(), tripExpenses: [], removeExpenseIds: [] });
    }
    const g = groups.get(id);
    g.sources.add(source);
    return g;
  };
  const sigsFor = (id) => { if (!haveTxSigs.has(id)) haveTxSigs.set(id, new Set()); return haveTxSigs.get(id); };

  for (const b of bundles) {
    const byId = new Map(b.trips.map((t) => [t.id, t]));
    for (const t of b.trips) groupFor(t, b.label);
    for (const e of b.tripExpenses) {
      const t = byId.get(e.tripId);
      if (!t) continue;
      const g = groupFor(t, b.label);
      const sigs = sigsFor(g.id);
      if (haveTxIds.has(e.id) || sigs.has(txSig(e))) continue;
      g.tripExpenses.push({ ...e, tripId: g.id });
      haveTxIds.add(e.id);
      sigs.add(txSig(e));
    }
  }

  // Monthly copies "(Trip: name)": attach to a trip with that name, or rebuild the trip.
  const copyBundles = bundles.filter((b) => b.copies?.length);
  for (const b of copyBundles) {
    const byName = new Map();
    for (const e of b.copies) {
      const name = (e.note || '').match(COPY_RE)?.[1]?.trim() || 'Trip';
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(e);
    }
    for (const [name, list] of byName) {
      const known = [...groups.values()].map((g) => g.trip).concat(state.trips).find((t) => t.name.trim().toLowerCase() === name.toLowerCase());
      const dates = list.map((e) => e.date).sort();
      const trip = known || { id: `t${slug(name)}${dates[0].replace(/-/g, '')}`, name: name === 'Unknown' ? 'Recovered trip' : name, destination: '', startDate: dates[0], endDate: dates.at(-1), budget: 0, currency: state.settings.currency, people: ['Me'], countInMonthly: true, closed: true, createdAt: new Date().toISOString() };
      const g = groupFor(trip, b.removable ? 'monthly spending' : b.label);
      const sigs = sigsFor(g.id);
      for (const e of list) {
        const amount = e.baseAmount ?? e.amount;
        const tx = {
          id: `x${e.id}`, tripId: g.id, amount: round2(amount), currency: state.settings.currency, tripAmount: round2(amount), baseAmount: round2(amount),
          category: matchTripCategory(categoryName(state, e.category)), note: (e.note || '').replace(COPY_RE, '').trim(), date: e.date,
          payer: 'Me', split: true, countInMonthly: true, createdAt: e.createdAt || new Date().toISOString(),
        };
        // Already on the trip: just drop the duplicate monthly copy.
        if (!sigs.has(txSig(tx)) && !haveTxIds.has(tx.id)) { g.tripExpenses.push(tx); sigs.add(txSig(tx)); haveTxIds.add(tx.id); }
        if (b.removable) g.removeExpenseIds.push(e.id);
      }
    }
  }

  return [...groups.values()]
    .filter((g) => g.isNew || g.tripExpenses.length || g.removeExpenseIds.length)
    .map((g) => ({ ...g, sources: [...g.sources], total: round2(g.tripExpenses.reduce((s, e) => s + e.tripAmount, 0)) }))
    .sort((a, b) => (a.trip.startDate < b.trip.startDate ? 1 : -1));
}

function categoryName(state, id) {
  return state.categories?.find((c) => c.id === id)?.name || id || '';
}

// Everything to scan on this phone, as a bundle list.
export function localBundles(state, entries) {
  const legacy = collectLegacy(entries);
  const converted = convertLegacy(legacy, state.settings.currency);
  const bundles = [{ label: 'this phone', trips: converted.trips, tripExpenses: converted.tripExpenses, copies: [], removable: false }];
  const copies = state.expenses.filter((e) => COPY_RE.test(e.note || ''));
  if (copies.length) bundles.push({ label: 'monthly spending', trips: [], tripExpenses: [], copies, removable: true });
  return bundles;
}

export function applyRecovery(state, groups) {
  for (const g of groups) {
    if (g.isNew && !state.trips.some((t) => t.id === g.id)) state.trips.push({ ...g.trip, id: g.id });
    const trip = state.trips.find((t) => t.id === g.id);
    for (const e of g.tripExpenses) {
      if (state.tripExpenses.some((x) => x.id === e.id)) continue;
      state.tripExpenses.push(e);
      if (trip && e.payer && !trip.people.includes(e.payer)) trip.people.push(e.payer);
    }
    if (trip && g.tripExpenses.length) {
      const dates = state.tripExpenses.filter((e) => e.tripId === trip.id).map((e) => e.date).sort();
      if (dates[0] < trip.startDate) trip.startDate = dates[0];
      if (dates.at(-1) > trip.endDate) trip.endDate = dates.at(-1);
    }
    if (g.removeExpenseIds.length) {
      const drop = new Set(g.removeExpenseIds);
      state.expenses = state.expenses.filter((e) => !drop.has(e.id));
    }
  }
}

export { COPY_RE };
