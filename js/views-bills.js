// Bills screen and the bill detail sheet.

import { esc, openSheet, closeSheet, toast, emptyState, haptic } from './ui.js';
import { today, addDays, monthBounds, monthKey, shortDate, relativeDue, describeSchedule } from './dates.js';
import { fmt, lastRate } from './money.js';
import * as store from './store.js';
import { billRow } from './views-home.js';
import { billSheet, payBillSheet } from './forms.js';
import { calendarOutOfDate, permission } from './reminders.js';

const S = () => store.getState();

function reminderStatus() {
  const s = S();
  if (s.settings.push.enabled) {
    return s.settings.push.lastError
      ? { tone: 'warn', text: 'Push reminders could not sync. Tap to check.' }
      : { tone: 'ok', text: 'Push reminders are on' };
  }
  if (s.settings.calendarExportedHash) {
    return calendarOutOfDate() ? { tone: 'warn', text: 'Calendar is out of date. Tap to update.' } : { tone: 'ok', text: 'Reminders are in your calendar' };
  }
  if (permission() === 'granted') return { tone: 'mid', text: 'Reminders only show when the app is open. Tap to fix.' };
  return { tone: 'warn', text: 'Reminders are off. Tap to set them up.' };
}

export function renderBills() {
  const s = S();
  const t = today();
  const active = s.bills.filter((b) => b.active && b.nextDue).sort((a, b) => (a.nextDue < b.nextDue ? -1 : a.nextDue > b.nextDue ? 1 : 0));
  const inactive = s.bills.filter((b) => !b.active || !b.nextDue);
  const weekEnd = addDays(t, 7);
  const { end: monthEnd } = monthBounds(monthKey(t));
  const groups = [
    ['Overdue', active.filter((b) => b.nextDue < t)],
    ['Due in the next 7 days', active.filter((b) => b.nextDue >= t && b.nextDue <= weekEnd)],
    ['Later this month', active.filter((b) => b.nextDue > weekEnd && b.nextDue < monthEnd)],
    ['Later', active.filter((b) => b.nextDue > weekEnd && b.nextDue >= monthEnd)],
    ['Paused or finished', inactive],
  ].filter(([, list]) => list.length);
  const rs = reminderStatus();
  const monthly = store.monthlyCommitment();
  return `<header class="top">
      <div><h1 class="top-title">Bills</h1>
      ${active.length ? `<p class="top-sub">${fmt(monthly, s.settings.currency)} a month across ${active.length} bill${active.length === 1 ? '' : 's'}</p>` : ''}</div>
      <button class="btn btn-primary btn-sm" data-action="new-bill">Add bill</button>
    </header>
    ${s.bills.length ? `<button class="status-pill tone-${rs.tone}" data-action="settings" data-section="reminders"><i></i>${rs.text}</button>` : ''}
    ${groups.length ? groups.map(([title, list]) => `<section class="block"><h2 class="block-title ${title === 'Overdue' ? 'attention' : ''}">${title}</h2><ul class="list">${list.map((b) => billRow(b)).join('')}</ul></section>`).join('')
      : emptyState('No bills yet', 'Add rent, subscriptions, phone, insurance, loans. Each one gets a reminder before it is due, and one tap logs the payment.', '<button class="btn btn-primary" data-action="new-bill">Add your first bill</button>')}`;
}

export function billDetail(id) {
  const bill = S().bills.find((b) => b.id === id);
  if (!bill) return;
  const status = store.billStatus(bill);
  const cat = store.category(bill.category);
  const history = [...bill.history].reverse().slice(0, 12);
  const paidTotal = bill.history.filter((h) => !h.skipped).reduce((s, h) => s + (h.amount || 0), 0);
  openSheet(`<div class="sheet-body">
      <header class="sheet-head">
        <h2 class="sheet-title"><span aria-hidden="true">${cat.icon}</span> ${esc(bill.name)}</h2>
        <span class="head-actions"><button type="button" class="link-btn" data-edit>Edit</button><button type="button" class="icon-btn" data-close aria-label="Close">✕</button></span>
      </header>
      <div class="bill-hero st-${status}">
        <p class="hero-amount">${fmt(bill.amount, bill.currency)}</p>
        <p class="hero-caption">${status === 'inactive' ? (bill.nextDue ? 'Paused' : 'Finished, all payments made') : `Next due ${shortDate(bill.nextDue)} (${relativeDue(bill.nextDue)})`}</p>
        ${bill.nextDue ? `<p class="schedule-summary">${describeSchedule(bill)}</p>` : ''}
        <p class="muted small">Reminder ${bill.remindDays ? `${bill.remindDays} day${bill.remindDays > 1 ? 's' : ''} before and ` : ''}on the day${bill.autopay ? '. Logged automatically on the due date.' : '.'}</p>
      </div>
      ${status !== 'inactive' ? `<div class="action-grid">
        <button class="btn btn-primary" data-pay>Paid ${fmt(bill.amount, bill.currency)}</button>
        <button class="btn btn-quiet" data-pay-other>Change amount or date</button>
        <button class="btn btn-quiet" data-skip>Skip this time</button>
      </div>` : `<div class="action-grid"><button class="btn btn-primary" data-resume>Resume</button></div>`}
      ${bill.notes ? `<p class="note-box">${esc(bill.notes)}</p>` : ''}
      <h3 class="block-title">History${paidTotal ? ` <span class="muted">${fmt(paidTotal, bill.currency)} paid</span>` : ''}</h3>
      ${history.length ? `<ul class="history">${history.map((h, i) => `<li><span>${shortDate(h.due)}</span><span>${h.skipped ? 'Skipped' : `Paid ${fmt(h.amount, bill.currency)}${h.paidOn !== h.due ? ` on ${shortDate(h.paidOn)}` : ''}`}</span>${i === 0 ? '<button class="link-btn" data-undo>Undo</button>' : '<span></span>'}</li>`).join('')}</ul>` : '<p class="muted">No payments logged yet.</p>'}
      ${status !== 'inactive' ? '<button class="link-btn danger-text" data-pause>Pause this bill</button>' : ''}
    </div>`, {
    tall: true,
    onMount(sheet) {
      const q = (sel, fn) => sheet.querySelector(sel)?.addEventListener('click', fn);
      q('[data-pay]', () => { payNow(bill.id); closeSheet(); });
      q('[data-pay-other]', () => { closeSheet(); setTimeout(() => payBillSheet(bill), 280); });
      q('[data-skip]', () => {
        store.skipBill(bill.id); closeSheet();
        toast(`Skipped. Next due ${shortDate(S().bills.find((b) => b.id === bill.id)?.nextDue || today())}`, { action: 'Undo', onAction: () => store.undoLastBillAction(bill.id) });
      });
      q('[data-edit]', () => billSheet(bill));
      q('[data-undo]', () => { store.undoLastBillAction(bill.id); closeSheet(); toast('Undone'); });
      q('[data-pause]', () => { store.update((st) => { st.bills.find((b) => b.id === bill.id).active = false; }); closeSheet(); toast(`${bill.name} paused`); });
      q('[data-resume]', () => {
        store.update((st) => {
          const b = st.bills.find((x) => x.id === bill.id);
          b.active = true;
          if (!b.nextDue || b.nextDue < today()) b.nextDue = today();
        });
        closeSheet(); toast(`${bill.name} resumed`);
      });
    },
  });
}

export function payNow(id) {
  const bill = S().bills.find((b) => b.id === id);
  if (!bill) return;
  const r = bill.currency === S().settings.currency ? 1 : lastRate(bill.currency, S().settings.currency);
  store.markBillPaid(id, { paidOn: today(), baseAmount: r ? bill.amount * r : bill.amount });
  haptic();
  const next = S().bills.find((b) => b.id === id);
  toast(`${bill.name} paid${next?.nextDue ? `. Next ${shortDate(next.nextDue)}` : ''}`, { action: 'Undo', onAction: () => store.undoLastBillAction(id) });
}
