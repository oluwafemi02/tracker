// Settings: reminders, budget, appearance, categories, data.

import { esc, toast, confirmSheet, parseAmount } from './ui.js';
import { CURRENCY_CODES, fmt } from './money.js';
import { today, shortDate } from './dates.js';
import * as store from './store.js';
import { hasLegacyData, migrateLegacy } from './migrate.js';
import { localBundles, planRecovery, applyRecovery, parseRecoveryFile } from './recover.js';
import { openSheet, closeSheet } from './ui.js';
import * as rem from './reminders.js';
import * as push from './push.js';

const S = () => store.getState();
export const APP_VERSION = '1.0.0';
// Femi's push server (deployed by .github/workflows/push-server.yml).
const DEFAULT_PUSH_URL = 'https://tracker-push.femisteve02.workers.dev';

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
      : `<div class="split"><input class="input" type="url" inputmode="url" placeholder="https://tracker-push.you.workers.dev" value="${esc(p.url || DEFAULT_PUSH_URL)}" data-push-url autocomplete="off"><button class="btn btn-primary" data-action="push-connect" ${perm === 'granted' ? '' : 'disabled'}>Connect</button></div>
        ${perm !== 'granted' ? '<p class="muted small">Turn on notifications first.</p>' : ''}`}
    </div>
  </section>`;
}

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never');

function applePaySection() {
  const s = S();
  const ap = s.settings.applePay || {};
  const connected = !!(s.settings.push.deviceId && s.settings.push.secret);
  let body;
  if (!connected) {
    body = '<p class="muted small">Connect push notifications above first. Payments are passed through the same server.</p>';
  } else if (!ap.enabled) {
    body = `<p class="muted small">Each Apple Pay payment is added for you, even if you do not open the app for days. Shops you have used before get their category automatically.</p>
      <button class="btn btn-primary btn-wide" data-action="applepay-setup">Set up Apple Pay logging</button>`;
  } else {
    const url = push.inboxUrl();
    body = `<p class="status-line ${ap.lastError ? 'warn' : 'ok'}">${ap.lastError ? `Could not check for payments: ${esc(ap.lastError)}` : `On. Last checked ${when(ap.lastFetch)}.`}</p>
      <details class="shortcut-steps" ${ap.lastFetch ? '' : 'open'}><summary>Shortcut setup steps</summary>
        <ol class="steps">
          <li>Copy your payment address: <button class="btn btn-quiet btn-sm" data-action="applepay-copy">Copy address</button></li>
          <li>Open the <b>Shortcuts</b> app, tap <b>Automation</b>, then <b>+</b>.</li>
          <li>Choose <b>Transaction</b>. Leave all cards selected, pick <b>Run Immediately</b>, turn off <b>Notify When Run</b>, tap <b>Next</b>.</li>
          <li>Tap <b>New Blank Automation</b>, then <b>Add Action</b>, and search for <b>Get Contents of URL</b>.</li>
          <li>Tap <b>URL</b> and paste the address.</li>
          <li>Tap the arrow to show more. Set <b>Method</b> to <b>POST</b> and <b>Request Body</b> to <b>JSON</b>.</li>
          <li>Add three <b>Text</b> fields: <code>amount</code> = Shortcut Input, then tap it and choose <b>Amount</b>; <code>merchant</code> = Shortcut Input, <b>Merchant</b>; <code>card</code> = Shortcut Input, <b>Card or Pass</b>.</li>
          <li>Tap <b>Done</b>. Pay with Apple Pay, then open Tracker.</li>
        </ol>
        <p class="muted small">Only Apple Pay payments from this iPhone or your Apple Watch are sent, not a plastic card. Refunds are left out.</p>
      </details>
      <div class="row-actions"><button class="btn btn-quiet" data-action="applepay-check">Check for payments now</button></div>
      <p class="muted small address" data-applepay-url>${esc(url || '')}</p>
      <button class="link-btn danger-text" data-action="applepay-stop">Turn off Apple Pay logging</button>`;
  }
  return `<section class="set-block" id="set-applepay"><h2 class="set-title">Apple Pay logging</h2>${body}</section>`;
}

function cloudBackupBlock() {
  const s = S();
  const cb = s.settings.cloudBackup || {};
  const connected = !!(s.settings.push.deviceId && s.settings.push.secret);
  if (cb.enabled) {
    return `<h3 class="set-sub">Cloud backup</h3>
      <p class="status-line ${cb.lastError ? 'warn' : 'ok'}">${cb.lastError ? `Last backup failed: ${esc(cb.lastError)}` : `On. Last backup ${when(cb.lastAt)}.`}</p>
      <p class="muted small">Encrypted on this phone with your passphrase before it is sent. Runs by itself once a day when something changed. To restore on a new phone, you only need the passphrase.</p>
      <div class="row-actions"><button class="btn btn-quiet" data-action="cloud-backup-now">Back up now</button></div>
      <button class="link-btn danger-text" data-action="cloud-backup-off">Turn off cloud backup</button>`;
  }
  return `<h3 class="set-sub">Cloud backup</h3>
    <p class="muted small">Keeps an encrypted copy on your push server, so a lost or new phone does not mean lost data. Only someone with your passphrase can open it.</p>
    ${connected ? `<form class="stack" data-cloud-start novalidate>
        <input class="input" type="password" name="pass" autocomplete="new-password" placeholder="Passphrase, at least 10 characters" minlength="10" required>
        <input class="input" type="password" name="pass2" autocomplete="new-password" placeholder="Same passphrase again" required>
        <p class="muted small">Write it down somewhere safe. If you forget it, nobody can open the backup.</p>
        <button class="btn btn-primary btn-wide">Turn on cloud backup</button>
      </form>` : '<p class="muted small">Connect push notifications in Reminders first.</p>'}
    <details class="more-cats"><summary>Restore from cloud (new phone)</summary>
      <form class="stack" data-cloud-restore novalidate>
        <input class="input" type="url" name="url" value="${esc(s.settings.push.url || DEFAULT_PUSH_URL)}" aria-label="Push server address">
        <input class="input" type="password" name="pass" autocomplete="current-password" placeholder="Your backup passphrase" required>
        <button class="btn btn-quiet btn-wide">Find my backup</button>
      </form>
    </details>`;
}

export function renderSettings(section) {
  const s = S();
  const custom = s.categories.filter((c) => c.custom);
  const legacy = hasLegacyData((k) => localStorage.getItem(k));
  return `<header class="top top-detail"><button class="back" data-action="tab" data-tab="home">Home</button><h1 class="top-title small">Settings</h1><span></span></header>
    ${remindersSection()}
    ${applePaySection()}
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
      ${cloudBackupBlock()}
      <h3 class="set-sub">Files</h3>
      <div class="stack">
        <button class="btn btn-quiet btn-wide" data-action="backup">Download backup</button>
        <label class="btn btn-quiet btn-wide file-btn">Restore from backup<input type="file" accept="application/json,.json" data-restore hidden></label>
        <button class="btn btn-quiet btn-wide" data-action="csv">Export expenses as CSV</button>
        <button class="btn btn-quiet btn-wide" data-action="recover-trips">Find lost trips</button>
        ${legacy ? '<button class="btn btn-quiet btn-wide" data-action="reimport">Import again from the old version</button>' : ''}
        <button class="link-btn danger-text" data-action="erase">Erase all data</button>
      </div>
    </section>
    <p class="about muted small">Tracker ${APP_VERSION}${s.settings.migratedAt ? `. Imported from the old version on ${shortDate(s.settings.migratedAt.slice(0, 10))}.` : ''}</p>`;
}

export function mountSettings(root, section) {
  root.querySelector('[data-cloud-start]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const pass = f.pass.value;
    if (pass.length < 10) return toast('Use at least 10 characters.', { tone: 'warn' });
    if (pass !== f.pass2.value) return toast('The two passphrases do not match.', { tone: 'warn' });
    const btn = f.querySelector('button');
    btn.disabled = true; btn.textContent = 'Encrypting';
    try { await push.startBackup(pass); toast('Cloud backup is on'); }
    catch (err) { toast(err.message, { tone: 'warn' }); btn.disabled = false; btn.textContent = 'Turn on cloud backup'; }
  });
  root.querySelector('[data-cloud-restore]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    if (!f.pass.value) return toast('Enter your backup passphrase.', { tone: 'warn' });
    const btn = f.querySelector('button');
    btn.disabled = true; btn.textContent = 'Looking';
    try {
      const { state, at } = await push.fetchBackup(f.url.value, f.pass.value);
      btn.disabled = false; btn.textContent = 'Find my backup';
      if (await confirmSheet({ title: 'Restore this backup?', body: `From ${when(at)}: ${state.expenses?.length || 0} expenses, ${state.bills?.length || 0} bills, ${state.trips?.length || 0} trips. Everything on this phone will be replaced.`, confirm: 'Restore', danger: true })) {
        store.replaceAll(state);
        toast('Backup restored. Turn on notifications again in Reminders.');
      }
    } catch (err) { toast(err.message, { tone: 'warn' }); btn.disabled = false; btn.textContent = 'Find my backup'; }
  });
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
      let data = JSON.parse(await file.text());
      if (data && !data.settings && !Array.isArray(data.expenses) && (Array.isArray(data.trips) || Array.isArray(data.travelExpenses))) {
        toast('This file only has trips. Use Find lost trips to add them.', { tone: 'warn' });
        e.target.value = '';
        return;
      }
      if (data && !data.settings && Array.isArray(data.expenses)) data = fromOldBackup(data);
      if (!data || !Array.isArray(data.expenses) || !data.settings) throw new Error('bad');
      if (await confirmSheet({ title: 'Replace all data with this backup?', body: `${data.expenses.length} expenses, ${data.bills?.length || 0} bills, ${data.trips?.length || 0} trips. Your current data will be replaced.`, confirm: 'Restore' })) {
        store.replaceAll(data);
        toast('Backup restored');
      }
    } catch { toast('That file is not a Tracker backup.', { tone: 'warn' }); }
    e.target.value = '';
  });
}

// A backup file from the old app (expense-tracker-backup-*.json) in this app's format.
function fromOldBackup(old) {
  const cur = S().settings;
  const keys = {
    familyExpenses: JSON.stringify(old.expenses || []), recurringExpenses: JSON.stringify(old.recurringExpenses || []),
    trips: JSON.stringify(old.trips || []), travelExpenses: JSON.stringify(old.travelExpenses || []),
    customCategories: JSON.stringify(old.customCategories || []), monthlyBudget: String(old.monthlyBudget ?? cur.monthlyBudget), mainCurrency: cur.currency,
  };
  const res = migrateLegacy((k) => keys[k] ?? null, { defaultRemindDays: cur.remindDays });
  return { ...S(), settings: { ...cur, monthlyBudget: res.settings.monthlyBudget }, categories: res.categories, expenses: res.expenses, bills: res.bills, trips: res.trips, tripExpenses: res.tripExpenses };
}

// ---------- find lost trips

export function recoverTrips() {
  const entries = Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]);
  const bundles = localBundles(S(), entries);
  let groups = [];
  const listHtml = () => {
    groups = planRecovery(S(), bundles);
    if (!groups.length) {
      return `<div class="callout"><b>No lost trips found on this phone.</b>
        <p class="small">Your iPhone keeps separate data for the Home Screen app and for Safari. If you ever used the tracker in the other one, open it there and tap Find lost trips again. You can also pick a backup or trip file below.</p></div>`;
    }
    return `<ul class="recover-list">${groups.map((g, i) => `<li><label class="toggle">
        <input type="checkbox" data-pick="${i}" checked><span class="toggle-ui"></span>
        <span class="toggle-text"><b>${esc(g.trip.name)}</b>
          <small>${shortDate(g.trip.startDate)} to ${shortDate(g.trip.endDate)}. ${g.tripExpenses.length} expense${g.tripExpenses.length === 1 ? '' : 's'}${g.total ? `, ${fmt(g.total, g.trip.currency)}` : ''}.</small>
          <small>${g.isNew ? 'Missing trip' : 'Trip you have, missing expenses'}. Found in ${esc(g.sources.join(', '))}.${g.removeExpenseIds.length ? ` Moves ${g.removeExpenseIds.length} copied item${g.removeExpenseIds.length === 1 ? '' : 's'} out of monthly spending onto the trip.` : ''}</small>
        </span></label></li>`).join('')}</ul>`;
  };
  openSheet(`<div class="sheet-body">
      <header class="sheet-head"><h2 class="sheet-title">Find lost trips</h2><button type="button" class="icon-btn" data-close aria-label="Close">✕</button></header>
      <p class="muted small">Looks through everything the old app saved on this phone, and trip expenses that were copied into your monthly spending. Nothing is deleted.</p>
      <div class="recover-results"></div>
      <label class="btn btn-quiet btn-wide file-btn">Look in a file (backup or trip CSV)<input type="file" accept=".json,.csv,application/json,text/csv" data-recover-file hidden></label>
      <div class="sheet-foot"><button class="btn btn-primary btn-wide" data-recover-add>Add selected trips</button></div>
    </div>`, {
    tall: true,
    onMount(sheet) {
      const results = sheet.querySelector('.recover-results');
      const addBtn = sheet.querySelector('[data-recover-add]');
      const refresh = () => { results.innerHTML = listHtml(); addBtn.hidden = !groups.length; };
      refresh();
      sheet.querySelector('[data-recover-file]').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          bundles.push(parseRecoveryFile(file.name, await file.text(), S().settings.currency));
          refresh();
          toast(groups.length ? 'File checked' : 'No new trips in that file');
        } catch (err) { toast(err.message, { tone: 'warn' }); }
        e.target.value = '';
      });
      addBtn.addEventListener('click', () => {
        const chosen = groups.filter((_, i) => sheet.querySelector(`[data-pick="${i}"]`)?.checked);
        if (!chosen.length) { toast('Pick at least one trip'); return; }
        store.update((st) => applyRecovery(st, chosen));
        closeSheet();
        const added = chosen.filter((g) => g.isNew).length;
        const extra = chosen.filter((g) => !g.isNew).reduce((n, g) => n + g.tripExpenses.length, 0);
        toast([added ? `Added ${added} trip${added === 1 ? '' : 's'}` : '', extra ? `${extra} missing expense${extra === 1 ? '' : 's'} restored` : ''].filter(Boolean).join('. ') || 'Done');
      });
    },
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
  history.replaceState(null, '', location.pathname + '#home');
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
