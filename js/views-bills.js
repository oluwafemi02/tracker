// Bills screen and the bill detail sheet.

import { esc, openSheet, closeSheet, toast, emptyState, haptic } from './ui.js';
import { today, addDays, monthBounds, monthKey, shortDate, relativeDue, describeSchedule, shiftMonth, monthName } from './dates.js';
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

// "By date" (default) or "By account". Remembered on this phone.
let billsView = (() => { try { return localStorage.getItem('ledger.ui.billsView') || 'date'; } catch { return 'date'; } })();
let accountMonth = null;
export function setBillsView(v) { billsView = v === 'accounts' ? 'accounts' : 'date'; try { localStorage.setItem('ledger.ui.billsView', billsView); } catch { /* private mode */ } }
export function setAccountMonth(k) { accountMonth = k; }

function viewSwitch() {
  return `<div class="segmented bills-view" role="radiogroup" aria-label="Group bills">
    <label><input type="radio" name="billsView" value="date" data-bills-view ${billsView === 'date' ? 'checked' : ''}><span>By date</span></label>
    <label><input type="radio" name="billsView" value="accounts" data-bills-view ${billsView === 'accounts' ? 'checked' : ''}><span>By account</span></label>
  </div>`;
}

function renderByAccount() {
  const s = S();
  const t = today();
  const key = accountMonth || monthKey(t);
  const plan = store.accountPlan(key, t);
  const current = key === monthKey(t);
  const card = (g) => {
    const name = g.account ? esc(g.account.name) : 'No account set';
    const empty = !g.payments.length;
    return `<section class="acct-card ${g.account ? '' : 'acct-none'}">
      <div class="acct-head"><b>${name}</b><span class="acct-total">${g.approx ? '≈ ' : ''}${fmt(g.total, g.currency)}</span></div>
      <p class="acct-sub">${empty ? (current && g.paid ? 'All paid for this month' : 'Nothing due this month') : `${current ? 'Still to pay' : 'Needed'}, first payment ${shortDate(g.haveBy[0].date)}`}${current && g.paid ? `. Paid so far ${fmt(g.paid, g.currency)}` : ''}</p>
      ${g.byCat.length ? `<ul class="acct-cats">${g.byCat.map((c) => {
        const cat = store.category(c.category);
        const names = c.payments.map((p) => p.bill.name);
        return `<li><details><summary><span class="acct-cat"><i>${cat.icon}</i>${esc(cat.name)}${(() => { const shown = [...new Set(names)].filter((n) => n.toLowerCase() !== cat.name.toLowerCase()); return shown.length ? ` <small>${esc(shown.join(', '))}</small>` : ''; })()}</span><span class="acct-amt">${fmt(c.total, g.currency)}</span></summary>
          <ul class="acct-bills">${c.payments.map((p) => `<li data-action="bill" data-id="${p.bill.id}"><span>${esc(p.bill.name)}</span><span class="muted">${shortDate(p.due)}${p.due < t ? ', late' : ''}</span><span>${fmt(p.inAccount, g.currency)}</span></li>`).join('')}</ul>
        </details></li>`;
      }).join('')}</ul>` : ''}
      ${g.haveBy.length > 1 ? `<div class="acct-haveby">${g.haveBy.map((h) => `<span>Have by ${shortDate(h.date)}</span><span>${fmt(h.amount, g.currency)}</span>`).join('')}</div>` : ''}
      ${g.everyday ? `<p class="acct-everyday">Everyday spending from here is usually about ${fmt(g.everyday, g.currency, { compact: true })} a month, on top of this.</p>` : ''}
      ${g.approx ? `<p class="acct-everyday">Some bills are in another currency without a saved rate, so this is approximate.</p>` : ''}
    </section>`;
  };
  return `<div class="month-nav acct-month">
      <button class="icon-btn" data-action="account-month" data-key="${shiftMonth(key, -1)}" aria-label="Previous month" ${current ? 'disabled' : ''}>‹</button>
      <h2 class="acct-month-title">${monthName(key)}</h2>
      <button class="icon-btn" data-action="account-month" data-key="${shiftMonth(key, 1)}" aria-label="Next month">›</button>
    </div>
    <p class="muted small acct-total-line">${fmt(plan.total, s.settings.currency)} in bills ${current ? 'still to pay this month' : `in ${monthName(key)}`}${s.accounts.length ? ` across ${plan.accounts.filter((g) => g.total > 0).length} account${plan.accounts.filter((g) => g.total > 0).length === 1 ? '' : 's'}` : ''}</p>
    ${!s.accounts.length ? `<div class="callout"><b>Add the accounts your bills are paid from.</b><p class="small">Then each bill gets a "Paid from" account, and this page shows how much each one needs every month.</p><button class="btn btn-primary btn-wide" data-action="new-account">Add an account</button></div>` : ''}
    ${plan.unassignedBills.length && s.accounts.length ? `<button class="nudge" data-action="assign-accounts"><b>${plan.unassignedBills.length} bill${plan.unassignedBills.length === 1 ? ' has' : 's have'} no account yet.</b> Pick which account pays ${plan.unassignedBills.length === 1 ? 'it' : 'each one'}.</button>` : ''}
    ${plan.accounts.map(card).join('')}
    ${plan.unassigned.payments.length ? card(plan.unassigned) : ''}`;
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
    ${s.bills.length ? viewSwitch() : ''}
    ${billsView === 'accounts' && s.bills.length ? renderByAccount() : groups.length ? groups.map(([title, list]) => `<section class="block"><h2 class="block-title ${title === 'Overdue' ? 'attention' : ''}">${title}</h2><ul class="list">${list.map((b) => billRow(b)).join('')}</ul></section>`).join('')
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
        ${bill.accountId && store.account(bill.accountId) ? `<p class="muted small">Paid from ${esc(store.account(bill.accountId).name)}</p>` : ''}
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
