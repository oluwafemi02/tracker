// Entry point: routing, actions, and lifecycle (open, resume, reminders).

import * as store from './store.js';
import { bindActions, on, toast, closeAllSheets, $, haptic } from './ui.js';
import { today } from './dates.js';
import { renderHome, renderActivity, setActivityMonth, setActivityFilter } from './views-home.js';
import { renderBills, billDetail, payNow, setBillsView, setAccountMonth } from './views-bills.js';
import { renderTrips, renderTrip } from './views-trips.js';
import { renderSettings, mountSettings, backup, csv, reimport, erase, deleteCategory, recoverTrips } from './views-settings.js';
import { expenseSheet, billSheet, tripSheet, tripExpenseSheet, reviewSheet, accountSheet, assignAccountsSheet, confirmAmountsSheet, closeMonthSheet } from './forms.js';
import * as rem from './reminders.js';
import * as push from './push.js';
import { VERSION } from './version.js';

const view = $('#view');
let route = { name: 'home' };

function parseRoute() {
  const h = location.hash.replace(/^#/, '');
  const [name, arg] = h.split('/');
  if (name === 'trip' && arg) return { name: 'trip', id: decodeURIComponent(arg) };
  if (name === 'settings') return { name: 'settings', section: arg };
  return { name: ['home', 'activity', 'bills', 'trips'].includes(name) ? name : 'home' };
}

function render({ keepScroll } = {}) {
  const y = window.scrollY;
  const r = route;
  let html;
  switch (r.name) {
    case 'activity': html = renderActivity(); break;
    case 'bills': html = renderBills(); break;
    case 'trips': html = renderTrips(); break;
    case 'trip': html = renderTrip(r.id); break;
    case 'settings': html = renderSettings(r.section); break;
    default: html = renderHome();
  }
  view.innerHTML = html;
  view.dataset.route = r.name;
  if (r.name === 'settings') mountSettings(view, r.section);
  const tab = r.name === 'trip' ? 'trips' : r.name === 'settings' ? 'home' : r.name;
  document.querySelectorAll('.tabbar [data-tab]').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
  const badge = document.querySelector('.tabbar [data-tab="bills"] .dot');
  const n = store.attentionCount();
  if (badge) { badge.textContent = n || ''; badge.hidden = !n; }
  window.scrollTo(0, keepScroll ? y : 0);
}

function go(hash) {
  if (location.hash === hash) { route = parseRoute(); render(); }
  else location.hash = hash;
}

window.addEventListener('hashchange', () => { route = parseRoute(); closeAllSheets(); render(); });

// Re-render on data change, keep the scroll position, and push the new schedule.
store.subscribe(() => {
  render({ keepScroll: true });
  rem.refreshBadge();
  push.scheduleSync();
});

// ---------- actions

on('tab', ({ tab }) => go(`#${tab}`));
on('settings', ({ section }) => go(`#settings${section ? '/' + section : ''}`));
on('add', () => {
  haptic();
  if (route.name === 'bills') return billSheet();
  if (route.name === 'trip') {
    const trip = store.getState().trips.find((t) => t.id === route.id);
    if (trip) return tripExpenseSheet(null, trip);
  }
  if (route.name === 'trips' && !store.activeTrip()) return tripSheet();
  expenseSheet();
});
on('expense', ({ id }) => { const e = store.getState().expenses.find((x) => x.id === id); if (e) expenseSheet(e); });
on('trip-expense', ({ id }) => {
  const s = store.getState();
  const e = s.tripExpenses.find((x) => x.id === id);
  const trip = e && s.trips.find((t) => t.id === e.tripId);
  if (e && trip) tripExpenseSheet(e, trip);
});
on('new-bill', () => billSheet());
on('bill', ({ id }) => billDetail(id));
on('pay', ({ id }, el, ev) => { ev.stopPropagation(); payNow(id); });
on('new-trip', () => tripSheet());
on('open-trip', ({ id }) => go(`#trip/${encodeURIComponent(id)}`));
on('edit-trip', ({ id }) => tripSheet(store.getState().trips.find((t) => t.id === id)));
on('add-trip-expense', ({ id }) => tripExpenseSheet(null, store.getState().trips.find((t) => t.id === id)));
on('close-trip', ({ id }) => { store.update((s) => { s.trips.find((t) => t.id === id).closed = true; }); toast('Trip marked as finished'); });
on('reopen-trip', ({ id }) => { store.update((s) => { s.trips.find((t) => t.id === id).closed = false; }); toast('Trip reopened'); });
on('activity-month', ({ key }) => { setActivityMonth(key); render(); });
on('filter-cat', ({ cat }) => { setActivityFilter({ cat }); render({ keepScroll: true }); });

on('enable-notifications', async () => {
  const p = await rem.requestPermission();
  if (p === 'granted') {
    await rem.refreshBadge();
    await rem.testLocalNotification().catch(() => {});
    toast('Notifications are on');
  } else toast('Notifications were not allowed', { tone: 'warn' });
  render({ keepScroll: true });
});
on('test-local', () => rem.testLocalNotification().catch((e) => toast(e.message, { tone: 'warn' })));
on('apply-remind-all', () => {
  const d = store.getState().settings.remindDays;
  store.update((s) => s.bills.forEach((b) => { b.remindDays = d; }));
  toast('Updated all bills');
});
on('calendar-export', async () => {
  if (!store.getState().bills.some((b) => b.active)) return toast('Add a bill first');
  const ok = await rem.exportCalendar();
  if (ok) { toast('Calendar file ready. Tap Add All in the next screen.'); render({ keepScroll: true }); }
});
on('push-connect', async (_, el) => {
  const url = view.querySelector('[data-push-url]')?.value;
  el.disabled = true; el.textContent = 'Connecting';
  try { await push.connect(url); toast('Push reminders connected'); render({ keepScroll: true }); }
  catch (e) { toast(e.message, { tone: 'warn' }); el.disabled = false; el.textContent = 'Connect'; }
});
on('push-test', async () => {
  try { await push.sendTestPush(); toast('Test sent. It should arrive in a few seconds.'); }
  catch (e) { toast(e.message, { tone: 'warn' }); render({ keepScroll: true }); }
});
on('push-sync', async () => {
  try { await push.sync(); toast('Synced'); } catch (e) { toast(e.message, { tone: 'warn' }); }
  render({ keepScroll: true });
});
on('push-disconnect', async () => { await push.disconnect(); toast('Push server disconnected'); });
on('review-payments', () => reviewSheet());
on('confirm-amounts', () => confirmAmountsSheet());
on('close-month', ({ key }) => closeMonthSheet(key));
on('new-account', () => accountSheet());
on('edit-account', ({ id }) => accountSheet(store.account(id)));
on('assign-accounts', () => assignAccountsSheet());
on('account-month', ({ key }) => { setAccountMonth(key); render({ keepScroll: true }); });
on('transfer-done', ({ id, month }) => {
  store.update((s) => { s.settings.transfersDone = { ...(s.settings.transfersDone || {}), [`${id}:${month}`]: Date.now() }; });
  toast('Marked as moved');
});
on('applepay-setup', async (_, el) => {
  el.disabled = true;
  try { await push.setupInbox(); toast('Apple Pay logging is ready. Follow the steps to add the Shortcut.'); }
  catch (e) { toast(e.message, { tone: 'warn' }); el.disabled = false; }
});
on('applepay-copy', async () => {
  const url = push.inboxUrl();
  try { await navigator.clipboard.writeText(url); toast('Address copied'); }
  catch {
    // Clipboard blocked: select the address so it can be copied by hand.
    const el = document.querySelector('[data-applepay-url]');
    if (el) { const r = document.createRange(); r.selectNodeContents(el); getSelection().removeAllRanges(); getSelection().addRange(r); }
    toast('Copy the address shown under the button');
  }
});
on('applepay-check', async () => {
  try {
    const r = await push.fetchInbox();
    toast(r?.added ? `Added ${r.added} payment${r.added === 1 ? '' : 's'}` : 'No new payments');
  } catch (e) { toast(e.message, { tone: 'warn' }); }
  render({ keepScroll: true });
});
on('applepay-stop', () => { push.stopInbox(); toast('Apple Pay logging is off. Delete the Shortcut automation too.'); });
on('cloud-backup-now', async (_, el) => {
  el.disabled = true;
  try { await push.backupNow(); toast('Backed up'); } catch (e) { toast(e.message, { tone: 'warn' }); }
  render({ keepScroll: true });
});
on('cloud-backup-off', () => {
  store.update((s) => { s.settings.cloudBackup = { enabled: false, keyRaw: '', backupId: '', lastAt: null, lastHash: null, lastError: null }; });
  toast('Cloud backup is off. The last copy stays on the server.');
});
on('backup', () => backup());
on('csv', () => csv());
on('recover-trips', () => recoverTrips());
on('reimport', () => reimport());
on('erase', () => erase());
on('delete-category', ({ id }) => deleteCategory(id));

view.addEventListener('change', (e) => {
  if (e.target.matches('[data-bills-view]')) { setBillsView(e.target.value); render({ keepScroll: true }); }
});

view.addEventListener('input', (e) => {
  if (e.target.dataset.input === 'activity-search') {
    setActivityFilter({ search: e.target.value });
    clearTimeout(view._t);
    view._t = setTimeout(() => {
      const pos = e.target.selectionStart;
      render({ keepScroll: true });
      const inp = view.querySelector('[data-input="activity-search"]');
      inp?.focus(); inp?.setSelectionRange(pos, pos);
    }, 250);
  }
});

// ---------- lifecycle

function applyTheme() {
  document.documentElement.dataset.theme = store.getState().settings.theme || 'system';
}

let lastDay = today();
async function onResume() {
  // A new day may have started since the app was last in front.
  const t = today();
  const paid = store.runAutopay(t);
  if (paid) toast(`Logged ${paid} automatic payment${paid > 1 ? 's' : ''}`);
  if (t !== lastDay) { lastDay = t; render({ keepScroll: true }); }
  await rem.refreshBadge();
  await rem.localCheck().catch(() => {});
  push.sync().catch(() => {});
  push.fetchInbox().then((r) => {
    if (r?.added) toast(r.review ? `Added ${r.added} Apple Pay payment${r.added === 1 ? '' : 's'}. ${r.review} to check.` : `Added ${r.added} Apple Pay payment${r.added === 1 ? '' : 's'}`);
  }).catch(() => {});
  push.autoBackup().catch(() => {});
}

function handleDeepLink() {
  const params = new URLSearchParams(location.search);
  const bill = params.get('bill');
  const tab = params.get('tab');
  const add = params.get('add');
  if (params.get('view') === 'accounts') setBillsView('accounts');
  if (bill || tab || add) history.replaceState(null, '', location.pathname + (bill ? '#bills' : tab ? `#${tab}` : location.hash));
  route = parseRoute();
  render();
  if (bill) setTimeout(() => billDetail(bill), 150);
  if (add) setTimeout(() => expenseSheet(), 150);
}

function init() {
  const { migration } = store.load();
  applyTheme();
  bindActions(document);
  handleDeepLink();
  const seen = store.getState().settings.lastSeenVersion;
  if (seen !== VERSION) {
    const hasData = store.getState().expenses.length || store.getState().bills.length;
    if (!migration && hasData) setTimeout(() => toast(`Updated to version ${VERSION}`), 600);
    store.update((s) => { s.settings.lastSeenVersion = VERSION; }, { silent: true });
  }
  if (migration) {
    const parts = [`${migration.expenses} expenses`, `${migration.bills} bills`, `${migration.trips} trips`].join(', ');
    setTimeout(() => toast(`Welcome back. Imported ${parts} from the old version.`), 400);
    if (migration.notes.length) console.info('Import notes:', migration.notes);
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW registration failed', e));
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'open-bill') { go('#bills'); setTimeout(() => billDetail(e.data.id), 150); }
      if (e.data?.type === 'navigate') { history.replaceState(null, '', e.data.url); handleDeepLink(); }
    });
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') onResume(); });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
  onResume();
}

init();
