// Home and Activity screens.

import { esc, emptyState } from './ui.js';
import { today, monthKey, monthName, parseISO, dayHeading, relativeDue, shortDate, shiftMonth, monthBounds } from './dates.js';
import { fmt } from './money.js';
import * as store from './store.js';
import { permission, calendarOutOfDate } from './reminders.js';

const S = () => store.getState();
const cur = () => S().settings.currency;

export function billRow(bill, { compact } = {}) {
  const status = store.billStatus(bill);
  const cat = store.category(bill.category);
  const showPay = ['overdue', 'today', 'soon'].includes(status) && !bill.autopay;
  return `<li class="bill-row st-${status}" data-action="bill" data-id="${bill.id}">
    <span class="bill-icon" aria-hidden="true">${cat.icon}</span>
    <span class="bill-main">
      <span class="bill-name">${esc(bill.name)}</span>
      <span class="bill-when">${status === 'inactive' ? 'Paused' : `Due ${relativeDue(bill.nextDue)}`}${bill.autopay ? ' <span class="tag">Autopay</span>' : ''}</span>
    </span>
    <span class="bill-amt">${fmt(bill.amount, bill.currency)}</span>
    ${showPay && !compact ? `<button class="pay-btn" data-action="pay" data-id="${bill.id}" aria-label="Mark ${esc(bill.name)} paid">Paid</button>` : ''}
  </li>`;
}

function runway(sum) {
  const t = today();
  const todayDay = parseISO(t).getDate();
  const dueByDay = {};
  for (const p of sum.pending) {
    if (p.due < sum.start) { (dueByDay[todayDay] ||= []).push({ ...p, late: true }); continue; }
    (dueByDay[parseISO(p.due).getDate()] ||= []).push({ ...p, late: p.due < t });
  }
  // Bills already paid this month stay on the strip, faded.
  const paidByDay = {};
  for (const e of S().expenses) {
    if (e.billId && e.date >= sum.start && e.date < sum.end) (paidByDay[parseISO(e.date).getDate()] ||= []).push(e);
  }
  const cells = [];
  for (let d = 1; d <= sum.days; d++) {
    const cls = d < todayDay ? 'past' : d === todayDay ? 'now' : 'future';
    const dues = dueByDay[d] || [];
    const paid = paidByDay[d] || [];
    const label = dues.map((p) => `${p.bill.name} ${fmt(p.amount, cur())}`).join(', ');
    cells.push(`<span class="rw-day ${cls}" ${label ? `title="${esc(label)}"` : ''}>
      ${dues.length ? `<i class="rw-pin${dues.some((p) => p.late) ? ' late' : ''}">${dues.length > 1 ? dues.length : ''}</i>` : paid.length ? '<i class="rw-pin paid"></i>' : ''}
    </span>`);
  }
  return `<div class="runway" role="img" aria-label="Day ${todayDay} of ${sum.days}. ${sum.pending.length} bill payments still to come this month.">
    <div class="rw-track" style="--days:${sum.days}">${cells.join('')}</div>
    <div class="rw-scale"><span>1</span><span>${sum.days}</span></div>
  </div>`;
}

function heroBlock(sum) {
  const c = cur();
  if (!sum.budget) {
    return `<div class="hero-figure">
        <p class="hero-amount">${fmt(sum.spent, c)}</p>
        <p class="hero-caption">spent so far${sum.committed ? `, with ${fmt(sum.committed, c)} in bills still to come` : ''}</p>
      </div>
      <button class="link-btn" data-action="settings" data-section="budget">Set a monthly budget to see what is safe to spend</button>`;
  }
  const over = sum.left < 0;
  return `<div class="hero-figure ${over ? 'over' : ''}">
      <p class="hero-amount">${fmt(Math.abs(sum.left), c)}</p>
      <p class="hero-caption">${over ? 'over budget after the bills still to come' : `left to spend, about ${fmt(sum.perDay, c)} a day for ${sum.daysLeft} day${sum.daysLeft === 1 ? '' : 's'}`}</p>
    </div>
    <dl class="hero-stats">
      <div><dt>Spent</dt><dd>${fmt(sum.spent, c, { compact: true })}</dd></div>
      <div><dt>Bills to come</dt><dd>${fmt(sum.committed, c, { compact: true })}</dd></div>
      <div><dt>Budget</dt><dd>${fmt(sum.budget, c, { compact: true })}</dd></div>
    </dl>`;
}

function expenseRow(e) {
  const cat = store.category(e.category);
  const isTrip = !!e.tripId;
  const trip = isTrip ? S().trips.find((t) => t.id === e.tripId) : null;
  const sub = [isTrip ? `${trip?.name || 'Trip'}` : cat.name, e.note && e.note !== cat.name ? e.note : ''].filter(Boolean).join(', ');
  const main = isTrip ? e.baseAmount : (e.baseAmount ?? e.amount);
  return `<li class="tx-row" data-action="${isTrip ? 'trip-expense' : 'expense'}" data-id="${e.id}">
    <span class="tx-icon" aria-hidden="true">${isTrip ? '✈️' : cat.icon}</span>
    <span class="tx-main"><span class="tx-title">${esc(e.note && !isTrip ? e.note : cat.name)}</span><span class="tx-sub">${esc(e.note && !isTrip ? cat.name : sub)}${e.billId ? ' <span class="tag">Bill</span>' : ''}</span></span>
    <span class="tx-amt">${fmt(main, cur())}${e.currency !== cur() ? `<small>${fmt(e.amount, e.currency)}</small>` : ''}</span>
  </li>`;
}

function reminderNudge() {
  const s = S();
  if (!s.bills.some((b) => b.active)) return '';
  if (calendarOutOfDate() && !s.settings.push.enabled) {
    return `<button class="nudge" data-action="calendar-export"><b>Your bills changed.</b> Update the calendar so reminders match.</button>`;
  }
  if (!s.settings.push.enabled && !s.settings.calendarExportedHash) {
    return `<button class="nudge" data-action="settings" data-section="reminders"><b>Get reminded when the app is closed.</b> Set up calendar or push reminders.</button>`;
  }
  if (permission() === 'default') {
    return `<button class="nudge" data-action="settings" data-section="reminders"><b>Turn on notifications</b> for a badge and alerts when bills are due.</button>`;
  }
  return '';
}

export function renderHome() {
  const s = S();
  const t = today();
  const sum = store.monthSummary(monthKey(t));
  const attention = s.bills.filter((b) => ['overdue', 'today'].includes(store.billStatus(b))).sort((a, b) => (a.nextDue < b.nextDue ? -1 : 1));
  const soon = store.upcomingBills(14).filter((b) => !attention.includes(b)).slice(0, 5);
  const trip = store.activeTrip();
  const recentList = [...s.expenses].sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1)).slice(0, 6);
  const d = parseISO(t);

  let tripCard = '';
  if (trip) {
    const ts = store.tripSummary(trip);
    const pct = trip.budget ? Math.min(100, (ts.total / trip.budget) * 100) : 0;
    tripCard = `<section class="block">
      <button class="trip-mini" data-action="open-trip" data-id="${trip.id}">
        <span class="trip-mini-top"><b>${esc(trip.name)}</b><span>Day ${ts.elapsed} of ${ts.length}</span></span>
        <span class="trip-mini-amt">${fmt(ts.total, trip.currency)}${trip.budget ? ` <small>of ${fmt(trip.budget, trip.currency, { compact: true })}</small>` : ''}</span>
        ${trip.budget ? `<span class="bar"><span style="width:${pct}%"></span></span>` : ''}
      </button></section>`;
  }

  return `<header class="top">
      <div>
        <p class="top-date">${d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h1 class="top-title">${monthName(monthKey(t))}</h1>
      </div>
      <button class="icon-btn gear" data-action="settings" aria-label="Settings"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Zm7.43-2.53c.04-.32.07-.64.07-.97s-.03-.66-.07-1l2.11-1.63a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.61-.22l-2.49 1a7.3 7.3 0 0 0-1.69-.98l-.38-2.65A.49.49 0 0 0 14 2h-4a.49.49 0 0 0-.49.42l-.38 2.65c-.61.25-1.17.58-1.69.98l-2.49-1a.5.5 0 0 0-.61.22l-2 3.46a.49.49 0 0 0 .12.64L4.57 11c-.04.34-.07.67-.07 1s.03.65.07.97l-2.11 1.66a.49.49 0 0 0-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.08.73 1.69.98l.38 2.65c.04.24.25.43.49.43h4c.24 0 .45-.19.49-.43l.38-2.65c.61-.25 1.17-.58 1.69-.98l2.49 1.01c.22.08.49 0 .61-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.11-1.66Z"/></svg></button>
    </header>
    <section class="hero">
      ${heroBlock(sum)}
      ${runway(sum)}
    </section>
    ${reminderNudge()}
    ${attention.length ? `<section class="block"><h2 class="block-title attention">Needs paying</h2><ul class="list">${attention.map((b) => billRow(b)).join('')}</ul></section>` : ''}
    <section class="block">
      <div class="block-head"><h2 class="block-title">Coming up</h2><button class="link-btn" data-action="tab" data-tab="bills">All bills</button></div>
      ${soon.length ? `<ul class="list">${soon.map((b) => billRow(b)).join('')}</ul>`
        : s.bills.length ? '<p class="muted pad">Nothing due in the next two weeks.</p>'
          : emptyState('Add your regular bills', 'Rent, subscriptions, phone, loans. You get a reminder before each one is due.', '<button class="btn btn-primary" data-action="new-bill">Add a bill</button>')}
    </section>
    ${tripCard}
    <section class="block">
      <div class="block-head"><h2 class="block-title">Recent</h2>${recentList.length ? '<button class="link-btn" data-action="tab" data-tab="activity">See all</button>' : ''}</div>
      ${recentList.length ? `<ul class="list">${recentList.map(expenseRow).join('')}</ul>` : emptyState('No expenses yet', 'Tap + to log what you spend. It takes a few seconds.')}
    </section>`;
}

// ---------- Activity

let activityMonth = null;
let activitySearch = '';
let activityCat = '';

export function setActivityMonth(k) { activityMonth = k; }
export function setActivityFilter({ search, cat } = {}) {
  if (search !== undefined) activitySearch = search;
  if (cat !== undefined) activityCat = cat === activityCat ? '' : cat;
}
export const getActivityState = () => ({ activityMonth, activitySearch, activityCat });

function bars(sum) {
  const c = cur();
  const entries = Object.entries(sum.byCat).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return '';
  const max = entries[0][1];
  return `<ul class="cat-bars">${entries.map(([id, v]) => {
    const cat = store.category(id);
    return `<li><button class="cat-bar ${activityCat === id ? 'on' : ''}" data-action="filter-cat" data-cat="${id}">
      <span class="cb-label"><i>${cat.icon}</i>${esc(cat.name)}</span><span class="cb-val">${fmt(v, c)}</span>
      <span class="cb-track"><span style="width:${Math.max(3, (v / max) * 100)}%"></span></span>
    </button></li>`;
  }).join('')}</ul>`;
}

function trend(key) {
  const months = store.monthlyTotals(6, monthBounds(key).start);
  const max = Math.max(...months.map((m) => m.total), S().settings.monthlyBudget || 0, 1);
  const budget = S().settings.monthlyBudget;
  return `<div class="trend" aria-label="Spending over the last six months">
    ${budget ? `<span class="trend-budget" style="--b:${budget / max}"><em>Budget ${fmt(budget, cur(), { compact: true })}</em></span>` : ''}
    ${months.map((m) => `<button class="trend-col ${m.key === key ? 'on' : ''}" data-action="activity-month" data-key="${m.key}" aria-label="${monthName(m.key, true)} ${fmt(m.total, cur())}">
      <span class="trend-bar-wrap"><span class="trend-bar" style="height:${Math.max(2, (m.total / max) * 100)}%"></span></span>
      <span class="trend-lbl">${monthName(m.key).slice(0, 3)}</span>
    </button>`).join('')}
  </div>`;
}

export function renderActivity() {
  const t = today();
  const key = activityMonth || monthKey(t);
  const sum = store.monthSpending(key);
  const c = cur();
  const q = activitySearch.trim().toLowerCase();
  let items = [...sum.items, ...sum.tripItems];
  if (activityCat) items = items.filter((e) => (activityCat === 'travel' ? (e.tripId || e.category === 'travel') : e.category === activityCat));
  if (q) {
    items = items.filter((e) => {
      const cat = store.category(e.category).name.toLowerCase();
      return (e.note || '').toLowerCase().includes(q) || cat.includes(q) || String(e.amount).includes(q);
    });
  }
  items.sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1));
  const groups = [];
  for (const e of items) {
    const last = groups[groups.length - 1];
    if (last && last.date === e.date) last.items.push(e); else groups.push({ date: e.date, items: [e] });
  }
  const budget = S().settings.monthlyBudget;
  const isFuture = key > monthKey(t);
  return `<header class="top">
      <div class="month-nav">
        <button class="icon-btn" data-action="activity-month" data-key="${shiftMonth(key, -1)}" aria-label="Previous month">‹</button>
        <h1 class="top-title">${monthName(key)}</h1>
        <button class="icon-btn" data-action="activity-month" data-key="${shiftMonth(key, 1)}" aria-label="Next month" ${isFuture ? 'disabled' : ''}>›</button>
      </div>
    </header>
    <section class="hero hero-flat">
      <div class="hero-figure"><p class="hero-amount">${fmt(sum.total, c)}</p>
      <p class="hero-caption">${budget ? `${sum.total > budget ? 'over' : 'of'} your ${fmt(budget, c, { compact: true })} budget` : 'spent this month'}</p></div>
      ${trend(key)}
    </section>
    ${bars(sum)}
    <div class="search"><input type="search" placeholder="Search notes, categories, amounts" value="${esc(activitySearch)}" data-input="activity-search" aria-label="Search"></div>
    ${activityCat ? `<p class="filter-pill">Showing ${esc(store.category(activityCat).name)} <button class="link-btn" data-action="filter-cat" data-cat="${activityCat}">Show all</button></p>` : ''}
    ${groups.length ? groups.map((g) => `<section class="day-group"><h3 class="day-head"><span>${dayHeading(g.date)}</span><span>${fmt(g.items.reduce((s, e) => s + (e.baseAmount ?? e.amount), 0), c)}</span></h3><ul class="list">${g.items.map(expenseRow).join('')}</ul></section>`).join('')
      : emptyState(q || activityCat ? 'Nothing matches' : 'Nothing logged this month', q || activityCat ? 'Try a different search or clear the filter.' : 'Tap + to add an expense.')}`;
}

export { expenseRow, shortDate };
