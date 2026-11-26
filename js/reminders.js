// Reminders: app badge, local notifications while the app is open, calendar (.ics)
// export, and the schedule that the optional push server sends while the app is closed.
//
// Why three layers: iOS home-screen web apps cannot run timers in the background,
// so the old setInterval + `new Notification()` approach never fired (and
// `new Notification()` is not supported on iOS at all). Only a server-sent Web Push
// or the iPhone Calendar can alert you when the app is closed.

import { addDays, occurrencesBetween, parseISO, today, shortDate, FREQUENCIES, pad } from './dates.js';
import { fmt } from './money.js';
import { buildICS } from './ics.js';
import { getState, attentionCount, billStatus, update, accountPlan, category, billAmount, monthRecap, tripStatus, tripSavings } from './store.js';
import { monthKey, shiftMonth, monthName, dayInMonth } from './dates.js';

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const notificationsSupported = () => 'Notification' in window && 'serviceWorker' in navigator;

export function permission() {
  return 'Notification' in window ? Notification.permission : 'unsupported';
}

export async function requestPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.requestPermission();
}

// ---------- schedule

function localDateTime(iso, hhmm) {
  const d = parseISO(iso);
  const [h, m] = (hhmm || '09:00').split(':').map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

function billLine(bill, hide) {
  return hide ? bill.name : `${bill.name} ${bill.variable ? 'about ' : ''}${fmt(billAmount(bill), bill.currency)}`;
}

// Everything the push server needs: when to fire and what to say. Nothing else leaves the phone.
export function reminderSchedule(horizonDays = 100) {
  const s = getState();
  const { remindTime, hideAmountsInPush } = s.settings;
  const t = today();
  const until = addDays(t, horizonDays);
  const items = [];
  for (const bill of s.bills) {
    if (!bill.active || !bill.nextDue) continue;
    const lead = Number(bill.remindDays ?? s.settings.remindDays ?? 2);
    const dues = occurrencesBetween(bill.nextDue, bill.frequency, '0000-01-01', until, bill.anchorDay, bill.endDate);
    for (const due of dues) {
      const amount = hideAmountsInPush ? '' : ` ${bill.variable ? 'about ' : ''}${fmt(billAmount(bill), bill.currency)}`;
      const url = `./?bill=${encodeURIComponent(bill.id)}`;
      const push = (kind, date, title, body) => items.push({
        id: `${bill.id}:${due}:${kind}`, fireAt: localDateTime(date, remindTime).toISOString(), title, body, url, tag: `${bill.id}:${due}`,
      });
      const amt = amount.trim();
      if (lead > 0) push('before', addDays(due, -lead), `${bill.name} is due ${lead === 1 ? 'tomorrow' : `in ${lead} days`}`, `${amt ? amt + ' due' : 'Due'} ${shortDate(due)}.${bill.autopay ? ' Autopay is on.' : ''}`);
      push('due', due, `${bill.name} is due today`, `${amt ? amt + '. ' : ''}${bill.autopay ? 'Autopay will log it.' : 'Tap to mark it paid.'}`);
      if (!bill.autopay) push('late', addDays(due, 1), `${bill.name} is still unpaid`, `${amt ? amt + ' ' : ''}was due yesterday. Tap to mark it paid or skip it.`);
    }
  }
  items.push(...transferSchedule());
  items.push(...summarySchedule());
  items.push(...savingsSchedule());
  return items.filter((i) => new Date(i.fireAt) > new Date(Date.now() - 6 * 3600e3)).sort((a, b) => (a.fireAt < b.fireAt ? -1 : 1));
}

// "Move €1,524 to Swedbank by 7 Dec": N days before each account's first payment of the month.
export function transferSchedule(months = 4) {
  const s = getState();
  const tr = s.settings.transferReminder || {};
  if (!tr.enabled || !s.accounts.length) return [];
  const lead = Number(tr.daysBefore ?? 2);
  const t = today();
  const items = [];
  let key = monthKey(t);
  for (let i = 0; i < months; i++, key = shiftMonth(key, 1)) {
    for (const g of accountPlan(key, t).accounts) {
      if (!g.firstDue || g.firstDue < t || g.total <= 0) continue;
      const done = s.settings.transfersDone?.[`${g.account.id}:${key}`];
      if (done) continue;
      const names = g.byCat.slice(0, 3).map((c) => category(c.category).name);
      const count = g.byCat.reduce((n, c) => n + c.payments.length, 0);
      const amount = s.settings.hideAmountsInPush ? 'money' : fmt(g.total, g.currency);
      items.push({
        id: `transfer:${g.account.id}:${key}`,
        fireAt: localDateTime(addDays(g.firstDue, -lead), s.settings.remindTime).toISOString(),
        title: `Move ${amount} to ${g.account.name} by ${shortDate(g.firstDue)}`,
        body: `${count} payment${count === 1 ? '' : 's'} this month: ${names.join(', ')}${g.byCat.length > 3 ? ' and more' : ''}.`,
        url: './?tab=bills&view=accounts',
        tag: `transfer:${g.account.id}:${key}`,
      });
    }
  }
  return items;
}

// The monthly summary, worked out from what is logged now and sent on the 1st.
// It is refreshed on every sync, so later expenses are included.
export function recapText(key) {
  const s = getState();
  const r = monthRecap(key);
  const c = s.settings.currency;
  const name = monthName(key);
  if (!r.count) return null;
  if (s.settings.hideAmountsInPush) return { title: `Your ${name} summary is ready`, body: 'Tap to see where your money went.' };
  const parts = [];
  if (r.underBy !== null) parts.push(r.underBy > 0 ? `${fmt(r.underBy, c)} under budget` : r.underBy < 0 ? `${fmt(-r.underBy, c)} over budget` : 'right on budget');
  if (r.change) parts.push(`${category(r.change.category).name} ${r.change.pct > 0 ? 'up' : 'down'} ${Math.abs(r.change.pct)}% on ${monthName(shiftMonth(key, -1))}`);
  if (r.overLimits.length) parts.push(`${r.overLimits.length === 1 ? category(r.overLimits[0]).name + ' went' : `${r.overLimits.length} categories went`} over the limit`);
  return { title: `${name}: ${fmt(r.total, c)} spent`, body: parts.length ? parts.join(', ') + '.' : 'Tap to see where it went.' };
}

export function summarySchedule(t = today()) {
  const s = getState();
  if (s.settings.monthlySummary === false) return [];
  const key = monthKey(t);
  const text = recapText(key);
  if (!text) return [];
  const next = shiftMonth(key, 1);
  return [{
    id: `summary:${key}`,
    fireAt: localDateTime(`${next}-01`, s.settings.remindTime).toISOString(),
    ...text,
    url: `./?tab=activity&month=${key}`,
    tag: `summary:${key}`,
    solo: true,
  }];
}

// "Put aside €260 for Japan" on the chosen day each month until the trip starts.
export function savingsSchedule(t = today(), months = 4) {
  const s = getState();
  const c = s.settings.currency;
  const items = [];
  for (const trip of s.trips) {
    if (tripStatus(trip, t) !== 'upcoming') continue;
    const sv = tripSavings(trip, t);
    if (!sv || !sv.remind || sv.done) continue;
    let key = monthKey(t);
    for (let i = 0; i < months; i++, key = shiftMonth(key, 1)) {
      const date = dayInMonth(key, sv.day);
      if (date >= trip.startDate) break;
      if (date < t || (i === 0 && sv.thisMonth)) continue;
      const hide = s.settings.hideAmountsInPush;
      items.push({
        id: `save:${trip.id}:${key}`,
        fireAt: localDateTime(date, s.settings.remindTime).toISOString(),
        title: hide ? `Time to put money aside for ${trip.name}` : `Put aside ${fmt(sv.monthly, c)} for ${trip.name}`,
        body: hide ? `${trip.name} starts ${shortDate(trip.startDate)}.` : `${fmt(sv.saved, c)} of ${fmt(sv.target, c)} saved. ${trip.name} starts ${shortDate(trip.startDate)}.`,
        url: `./?trip=${encodeURIComponent(trip.id)}`,
        tag: `save:${trip.id}`,
      });
    }
  }
  return items;
}

// ---------- badge + local notifications

export async function refreshBadge() {
  const n = attentionCount();
  try {
    if ('setAppBadge' in navigator) {
      if (n > 0) await navigator.setAppBadge(n);
      else await navigator.clearAppBadge();
    }
  } catch { /* needs notification permission on iOS */ }
  // Keep a copy where the service worker can read it.
  try {
    const cache = await caches.open('ledger-state');
    await cache.put('state/reminders.json', new Response(JSON.stringify({ badge: n, at: Date.now(), due: dueNowList() }), { headers: { 'Content-Type': 'application/json' } }));
  } catch { /* private mode */ }
  return n;
}

function dueNowList() {
  const s = getState();
  return s.bills.filter((b) => ['overdue', 'today'].includes(billStatus(b))).map((b) => ({ id: b.id, line: billLine(b, s.settings.hideAmountsInPush), due: b.nextDue }));
}

// Shown when you open the app and something is due. One summary per day, so it never nags.
export async function localCheck() {
  const s = getState();
  if (permission() !== 'granted' || s.settings.push.enabled) return;
  const due = dueNowList();
  const key = `local:${today()}`;
  if (!due.length || s.notified[key]) return;
  const reg = await navigator.serviceWorker?.ready;
  if (!reg) return;
  const title = due.length === 1 ? `${due[0].line} needs paying` : `${due.length} bills need paying`;
  await reg.showNotification(title, {
    body: due.map((d) => d.line).join('\n'),
    tag: 'ledger-due',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { url: './?tab=bills' },
  });
  update((st) => {
    st.notified[key] = Date.now();
    for (const k of Object.keys(st.notified)) if (k < `local:${addDays(today(), -14)}`) delete st.notified[k];
  }, { silent: true });
}

export async function testLocalNotification() {
  const reg = await navigator.serviceWorker?.ready;
  if (!reg) throw new Error('Service worker is not ready yet. Reload the app and try again.');
  await reg.showNotification('Reminders are on', {
    body: 'This is what a bill reminder will look like.',
    tag: 'ledger-test', icon: 'icons/icon-192.png', data: { url: './?tab=bills' },
  });
}

// ---------- calendar (.ics)

export function calendarHash() {
  const s = getState();
  const sig = s.bills.filter((b) => b.active).map((b) => [b.id, b.name, b.amount, b.currency, b.frequency, b.anchorDay, b.startDate, b.endDate, b.remindDays].join('|')).sort().join(';');
  let h = 0;
  for (let i = 0; i < sig.length; i++) h = (h * 31 + sig.charCodeAt(i)) | 0;
  return `${h}:${s.settings.remindTime}`;
}

export function calendarOutOfDate() {
  const s = getState();
  return !!s.settings.calendarExportedHash && s.settings.calendarExportedHash !== calendarHash();
}

export async function exportCalendar() {
  const s = getState();
  // Each event starts at the bill's current due date and repeats from there.
  const ics = buildICS(s.bills.map((b) => ({ ...b, amount: billAmount(b) })), s.settings, location.origin + location.pathname);
  const file = new File([ics], 'bills.ics', { type: 'text/calendar' });
  let shared = false;
  if (isIOS() && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Bills calendar' }); shared = true; } catch (e) { if (e.name === 'AbortError') return false; }
  }
  if (!shared) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = 'bills.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  update((st) => { st.settings.calendarExportedHash = calendarHash(); }, { silent: true });
  return true;
}

export { pad, buildICS };
