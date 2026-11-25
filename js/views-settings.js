// Settings: reminders, budget, appearance, categories, data.

import { esc, toast, confirmSheet, parseAmount } from './ui.js';
import { CURRENCY_CODES, fmt } from './money.js';
import { today, shortDate } from './dates.js';
import * as store from './store.js';
import { hasLegacyData } from './migrate.js';
import * as rem from './reminders.js';
import * as push from './push.js';

const S = () => store.getState();
export const APP_VERSION = '1.0.0';

function remindersSection() {
  const s = S();
  const perm = rem.permission();
  const ios = rem.isIOS();
  const installed = rem.isStandalone();
  const p = s.settings.push;
  const feed = push.calendarFeedUrl();
  let notif;
  if (ios && !installed) {
    notif = `<div class="callout"><b>Install the app to get notifications.</b>
      <ol class="steps"><li>In Safari, tap the Share button.</li><li>Tap <b>Add to Home Screen</b>.</li><li>Open Tracker from your home screen and come back here.</li></ol></div>`;
  } else if (perm === 'unsupported') {
    notif = '<p class="muted">This browser does not support notifications. Use the calendar option below.</p>';
  } else if (perm === 'denied') {
    notif = '<div class="callout warn"><b>Notifications are blocked.</b> Turn them on in iPhone Settings, Notifications, Tracker. Then reopen the app.</div>';
  } else if (perm === 'default') {
    notif = '<button class="btn btn-primary btn-wide" data-action="enable-notifications">Turn on notifications</button><p class="muted small">Gives you an app badge with the number of bills to pay, and an alert when you open the app on a due day.</p>';
  } else {
    notif = '<p class="status-line ok">Notifications are on. <button class="link-btn" data-action="test-local">Send a test</button></p>';
  }
  return `<section class="set-block" id="set-reminders">
    <h2 class="set-title">Reminders</h2>
    ${notif}
    <div class="grid-2">
      <label class="field"><span>Remind me at</span><input type="time" class="input" value="${s.settings.remindTime}" data-setting="remindTime"></label>
      <label class="field"><span>New bills remind me</span><select class="input" data-setting="remindDays">${[[0, 'On the day'], [1, '1 day before'], [2, '2 days before'], [3, '3 days before'], [7, '1 week before']].map(([v, l]) => `<option value="${v}" ${Number(s.settings.remindDays) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    <button class="link-btn" data-action="apply-remind-all">Use this timing for all existing bills</button>

    <h3 class="set-sub">When the app is closed</h3>
    <p class="muted small">iPhone web apps cannot run in the background, so the app itself cannot alert you while it is closed. Use one or both of these.</p>

    <div class="option-card">
      <b>Option 1: iPhone Calendar</b>
      <p class="muted small">Adds each bill as a repeating calendar event with an alert ${s.settings.remindDays ? `${s.settings.remindDays} day${s.settings.remindDays > 1 ? 's' : ''} before and ` : ''}on the day at ${s.settings.remindTime}. Works with no setup. Export again after you change bills.</p>
      <button class="btn btn-quiet btn-wide" data-action="calendar-export">${s.settings.calendarExportedHash ? (rem.calendarOutOfDate() ? 'Update calendar (bills changed)' : 'Export calendar again') : 'Add bills to calendar'}</button>
      ${feed ? `<a class="btn btn-quiet btn-wide" href="${esc(feed)}">Subscribe instead (stays in sync)</a><p class="muted small">After subscribing, open iPhone Settings, Calendar, Accounts, Subscribed Calendars, Bills and turn off Remove Alerts.</p>` : ''}
    </div>

    <div class="option-card">
      <b>Option 2: Push notifications</b>
      <p class="muted small">Real lock-screen alerts, like a native app. Needs a free push server you deploy once (about 10 minutes, steps in the repo under <code>push-worker</code>).</p>
      ${p.enabled ? `<p class="status-line ${p.lastError ? 'warn' : 'ok'}">${p.lastError ? `Sync failed: ${esc(p.lastError)}` : `Connected. Last synced ${p.lastSync ? new Date(p.lastSync).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'never'}.`}</p>
        <div class="row-actions"><button class="btn btn-quiet" data-action="push-test">Send test push</button><button class="btn btn-quiet" data-action="push-sync">Sync now</button></div>
        <label class="toggle"><input type="checkbox" data-setting="hideAmountsInPush" ${s.settings.hideAmountsInPush ? 'checked' : ''}><span class="toggle-ui"></span><span class="toggle-text"><b>Hide amounts in alerts</b><small>Lock-screen alerts show the bill name only</small></span></label>
        <button class="link-btn danger-text" data-action="push-disconnect">Disconnect push server</button>`
      : `<div class="split"><input class="input" type="url" inputmode="url" placeholder="https://tracker-push.you.workers.dev" value="${esc(p.url)}" data-push-url autocomplete="off"><button class="btn btn-primary" data-action="push-connect" ${perm === 'granted' ? '' : 'disabled'}>Connect</button></div>
        ${perm !== 'granted' ? '<p class="muted small">Turn on notifications first.</p>' : ''}`}
    </div>
  </section>`;
}

export function renderSettings(section) {
  const s = S();
  const custom = s.categories.filter((c) => c.custom);
  const legacy = hasLegacyData((k) => localStorage.getItem(k));
  return `<header class="top top-detail"><button class="back" data-action="tab" data-tab="home">Home</button><h1 class="top-title small">Settings</h1><span></span></header>
    ${remindersSection()}
    <section class="set-block" id="set-budget">
      <h2 class="set-title">Budget</h2>
      <div class="grid-2">
        <label class="field"><span>Monthly budget</span><input class="input" inputmode="decimal" value="${s.settings.monthlyBudget || ''}" placeholder="e.g. 2000" data-setting="monthlyBudget"></label>
        <label class="field"><span>Main currency</span><select class="input" data-setting="currency">${CURRENCY_CODES.map((c) => `<option ${c === s.settings.currency ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      </div>
      <p class="muted small">The budget covers everything: bills and day-to-day spending. Home shows what is left after the bills still to come.</p>
    </section>
    <section class="set-block">
      <h2 class="set-title">Appearance</h2>
      <div class="segmented" role="radiogroup">${['system', 'light', 'dark'].map((t) => `<label><input type="radio" name="theme" value="${t}" data-setting="theme" ${s.settings.theme === t ? 'checked' : ''}><span>${t[0].toUpperCase() + t.slice(1)}</span></label>`).join('')}</div>
    </section>
    ${custom.length ? `<section class="set-block"><h2 class="set-title">Your categories</h2><ul class="plain-list">${custom.map((c) => `<li><span>${c.icon} ${esc(c.name)}</span><button class="link-btn danger-text" data-action="delete-category" data-id="${c.id}">Remove</button></li>`).join('')}</ul></section>` : ''}
    <section class="set-block" id="set-data">
      <h2 class="set-title">Your data</h2>
      <p class="muted small">Everything is stored on this phone only. Download a backup now and then${s.settings.lastBackupAt ? ` (last one ${shortDate(s.settings.lastBackupAt.slice(0, 10))})` : ''}.</p>
      <div class="stack">
        <button class="btn btn-quiet btn-wide" data-action="backup">Download backup</button>
        <label class="btn btn-quiet btn-wide file-btn">Restore from backup<input type="file" accept="application/json,.json" data-restore hidden></label>
        <button class="btn btn-quiet btn-wide" data-action="csv">Export expenses as CSV</button>
        ${legacy ? '<button class="btn btn-quiet btn-wide" data-action="reimport">Import again from the old version</button>' : ''}
        <button class="link-btn danger-text" data-action="erase">Erase all data</button>
      </div>
    </section>
    <p class="about muted small">Tracker ${APP_VERSION}${s.settings.migratedAt ? `. Imported from the old version on ${shortDate(s.settings.migratedAt.slice(0, 10))}.` : ''}</p>`;
}

export function mountSettings(root, section) {
  if (section) setTimeout(() => root.querySelector(`#set-${section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  root.querySelectorAll('[data-setting]').forEach((el) => el.addEventListener('change', () => {
    const key = el.dataset.setting;
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (key === 'monthlyBudget') v = parseAmount(v) || 0;
    if (key === 'remindDays') v = Number(v);
    store.update((st) => { st.settings[key] = v; });
    if (key === 'theme') document.documentElement.dataset.theme = v;
    toast('Saved');
  }));
  root.querySelector('[data-restore]')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || !Array.isArray(data.expenses) || !data.settings) throw new Error('bad');
      if (await confirmSheet({ title: 'Replace all data with this backup?', body: `${data.expenses.length} expenses, ${data.bills?.length || 0} bills, ${data.trips?.length || 0} trips. Your current data will be replaced.`, confirm: 'Restore' })) {
        store.replaceAll(data);
        toast('Backup restored');
      }
    } catch { toast('That file is not a Tracker backup.', { tone: 'warn' }); }
    e.target.value = '';
  });
}

// ---------- data actions

function download(name, content, type) {
  const file = new File([content], name, { type });
  if (rem.isIOS() && navigator.canShare?.({ files: [file] })) {
    return navigator.share({ files: [file] }).catch(() => {});
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export async function backup() {
  const s = S();
  await download(`tracker-backup-${today()}.json`, JSON.stringify(s, null, 1), 'application/json');
  store.update((st) => { st.settings.lastBackupAt = new Date().toISOString(); }, { silent: true });
}

export function csv() {
  const s = S();
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Date', 'Amount', 'Currency', `Amount (${s.settings.currency})`, 'Category', 'Note', 'Type', 'Trip', 'Paid by']];
  for (const e of [...s.expenses].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    rows.push([e.date, e.amount, e.currency, e.baseAmount ?? e.amount, store.category(e.category).name, e.note, e.billId ? 'Bill' : 'Expense', '', '']);
  }
  for (const e of s.tripExpenses) {
    const trip = s.trips.find((t) => t.id === e.tripId);
    rows.push([e.date, e.amount, e.currency, e.baseAmount, store.category(e.category).name, e.note, 'Trip', trip?.name, e.payer]);
  }
  download(`tracker-expenses-${today()}.csv`, rows.map((r) => r.map(q).join(',')).join('\n'), 'text/csv');
}

export async function reimport() {
  if (!(await confirmSheet({ title: 'Import again from the old version?', body: 'This replaces everything in the new app with the data from the old app on this phone.', confirm: 'Import' }))) return;
  const report = store.importLegacy();
  store.update(() => {});
  toast(`Imported ${report.expenses} expenses, ${report.bills} bills, ${report.trips} trips`);
}

export async function erase() {
  if (!(await confirmSheet({ title: 'Erase all data?', body: 'Expenses, bills and trips will be deleted from this phone. Download a backup first if you might need them.', confirm: 'Erase everything' }))) return;
  if (S().settings.push.enabled) await push.disconnect().catch(() => {});
  localStorage.removeItem(store.STORAGE_KEY);
  localStorage.setItem(store.STORAGE_KEY, JSON.stringify({ settings: { currency: S().settings.currency, migratedAt: new Date().toISOString() } }));
  location.reload();
}

export function deleteCategory(id) {
  const used = S().expenses.filter((e) => e.category === id).length + S().bills.filter((b) => b.category === id).length;
  store.update((st) => {
    st.categories = st.categories.filter((c) => c.id !== id);
    st.expenses.forEach((e) => { if (e.category === id) e.category = 'other'; });
    st.bills.forEach((b) => { if (b.category === id) b.category = 'other'; });
  });
  toast(used ? `Removed. ${used} item${used > 1 ? 's' : ''} moved to Other.` : 'Removed');
}

export { fmt };
