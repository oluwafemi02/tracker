// Bottom-sheet forms for expenses, bills, trips and trip expenses.

import { esc, openSheet, closeSheet, toast, parseAmount, confirmSheet, haptic } from './ui.js';
import { today, addDays, FREQUENCIES, shortDate, nthOccurrence, countOccurrences, describeSchedule, monthName } from './dates.js';
import { fmt, CURRENCY_CODES, fetchRate, lastRate, rememberRate, round2, rateText } from './money.js';
import { TRIP_CATEGORIES, slug } from './categories.js';
import * as store from './store.js';

const S = () => store.getState();

function currencySelect(name, value) {
  const codes = [...new Set([value, S().settings.currency, ...CURRENCY_CODES])];
  return `<select name="${name}" class="cur-select" aria-label="Currency">${codes.map((c) => `<option ${c === value ? 'selected' : ''}>${c}</option>`).join('')}</select>`;
}

function chip(name, value, label, checked, extra = '') {
  return `<label class="chip"${extra}><input type="radio" name="${name}" value="${esc(value)}" ${checked ? 'checked' : ''}><span>${label}</span></label>`;
}

function dateChips(name, value) {
  const t = today(), y = addDays(t, -1);
  const other = value !== t && value !== y;
  return `<div class="date-row">
    ${chip(`${name}-quick`, t, 'Today', value === t)}
    ${chip(`${name}-quick`, y, 'Yesterday', value === y)}
    <label class="chip chip-date ${other ? 'on' : ''}"><span>${other ? shortDate(value) : 'Other day'}</span><input type="date" name="${name}" value="${value}" aria-label="Date"></label>
  </div>`;
}

function wireDateChips(sheet, name) {
  const input = sheet.querySelector(`input[name="${name}"]`);
  const pill = input.closest('.chip-date');
  sheet.querySelectorAll(`input[name="${name}-quick"]`).forEach((r) => r.addEventListener('change', () => {
    input.value = r.value; pill.classList.remove('on'); pill.querySelector('span').textContent = 'Other day';
  }));
  input.addEventListener('change', () => {
    if (!input.value) return;
    sheet.querySelectorAll(`input[name="${name}-quick"]`).forEach((r) => { r.checked = r.value === input.value; });
    const quick = [...sheet.querySelectorAll(`input[name="${name}-quick"]`)].some((r) => r.checked);
    pill.classList.toggle('on', !quick);
    pill.querySelector('span').textContent = quick ? 'Other day' : shortDate(input.value);
  });
}

// Live conversion line under the amount when a foreign currency is picked.
function wireConversion(sheet, { amountName = 'amount', curName = 'currency', target }) {
  const amountEl = sheet.querySelector(`[name="${amountName}"]`);
  const curEl = sheet.querySelector(`[name="${curName}"]`);
  const box = sheet.querySelector('.convert');
  const rateEl = box.querySelector('input');
  const out = box.querySelector('.convert-out');
  const tgt = typeof target === 'function' ? target : () => target;
  const render = () => {
    const to = tgt();
    const from = curEl.value;
    box.hidden = from === to;
    box.querySelector('.convert-label').textContent = `1 ${from} =`;
    box.querySelector('.convert-to').textContent = to;
    const a = parseAmount(amountEl.value), r = parseFloat(rateEl.value);
    out.textContent = a > 0 && r > 0 ? `≈ ${fmt(a * r, to)}` : '';
  };
  const refreshRate = async () => {
    const from = curEl.value, to = tgt();
    if (from === to) { render(); return; }
    rateEl.value = rateText(lastRate(from, to));
    render();
    const live = await fetchRate(from, to);
    if (live && curEl.value === from) { rateEl.value = rateText(live); render(); }
  };
  amountEl.addEventListener('input', render);
  rateEl.addEventListener('input', render);
  curEl.addEventListener('change', refreshRate);
  refreshRate();
  return {
    rate: () => (curEl.value === tgt() ? 1 : parseFloat(rateEl.value)),
    refresh: refreshRate,
  };
}

const convertBox = () => `<div class="convert" hidden><span class="convert-label"></span><input type="number" step="any" inputmode="decimal" aria-label="Exchange rate"><span class="convert-to"></span><span class="convert-out"></span></div>`;

function categoryGrid(cats, selected, name = 'category') {
  return `<div class="cat-grid">${cats.map((c) => chip(name, c.id, `<i>${c.icon}</i>${esc(c.name)}`, c.id === selected, ' data-cat')).join('')}</div>`;
}

// ---------- expense (everyday or trip)

export function expenseSheet(existing = null, { tripId } = {}) {
  const s = S();
  const trip = tripId ? s.trips.find((t) => t.id === tripId) : (!existing ? store.activeTrip() : null);
  if (existing?.tripId || (tripId && trip)) return tripExpenseSheet(existing, trip || s.trips.find((t) => t.id === existing.tripId));
  const e = existing || { amount: '', currency: s.settings.currency, category: '', note: '', date: today() };
  const cats = store.categoriesByUse();
  const first = cats.slice(0, 8);
  const rest = cats.slice(8);
  if (e.category && rest.some((c) => c.id === e.category)) { first.push(...rest.splice(rest.findIndex((c) => c.id === e.category), 1)); }

  openSheet(`<form class="sheet-body" novalidate>
      <header class="sheet-head">
        <h2 class="sheet-title">${existing ? 'Edit expense' : 'New expense'}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Close">✕</button>
      </header>
      ${trip && !existing ? `<button type="button" class="trip-switch" data-to-trip>Spending on ${esc(trip.name)}? <b>Add to trip</b></button>` : ''}
      <div class="amount-field">
        <input name="amount" type="text" inputmode="decimal" placeholder="0" value="${e.amount || ''}" autocomplete="off" ${existing ? '' : 'autofocus'} aria-label="Amount">
        ${currencySelect('currency', e.currency)}
      </div>
      ${convertBox()}
      <div class="field-label">Category</div>
      ${categoryGrid(first, e.category)}
      ${rest.length ? `<details class="more-cats"><summary>More categories</summary>${categoryGrid(rest, e.category)}</details>` : ''}
      <button type="button" class="link-btn" data-new-cat>+ New category</button>
      <input name="note" class="input" placeholder="Note (optional)" value="${esc(e.note)}" maxlength="120">
      ${s.accounts.length ? `<div class="field-label">Paid with</div><div class="chip-row">${chip('accountId', '', 'Not set', !(existing ? e.accountId : s.settings.lastExpenseAccountId))}${s.accounts.map((a) => chip('accountId', a.id, esc(a.name), a.id === (existing ? e.accountId : s.settings.lastExpenseAccountId))).join('')}</div>` : ''}
      ${dateChips('date', e.date)}
      <p class="form-error" role="alert"></p>
      <div class="sheet-foot">
        ${existing ? '<button type="button" class="btn btn-quiet danger-text" data-delete>Delete</button>' : ''}
        <button class="btn btn-primary btn-wide">${existing ? 'Save changes' : 'Add expense'}</button>
      </div>
    </form>`, {
    onMount(sheet) {
      const form = sheet.querySelector('form');
      wireDateChips(sheet, 'date');
      const conv = wireConversion(sheet, { target: s.settings.currency });
      if (existing && existing.currency !== s.settings.currency && existing.baseAmount) {
        sheet.querySelector('.convert input').value = rateText(existing.baseAmount / existing.amount);
      }
      sheet.querySelector('[data-to-trip]')?.addEventListener('click', () => {
        const amount = form.amount.value;
        closeSheet();
        setTimeout(() => tripExpenseSheet(null, trip, { amount }), 280);
      });
      sheet.querySelector('[data-new-cat]').addEventListener('click', () => newCategorySheet((cat) => {
        const grid = sheet.querySelector('.cat-grid');
        grid.insertAdjacentHTML('afterbegin', chip('category', cat.id, `<i>${cat.icon}</i>${esc(cat.name)}`, true, ' data-cat'));
      }));
      sheet.querySelector('[data-delete]')?.addEventListener('click', async () => {
        if (await confirmSheet({ title: 'Delete this expense?', body: `${fmt(existing.amount, existing.currency)}, ${store.category(existing.category).name}` })) {
          const copy = { ...existing };
          store.deleteExpense(existing.id);
          closeSheet();
          toast('Expense deleted', { action: 'Undo', onAction: () => store.saveExpense(copy) });
        }
      });
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const err = sheet.querySelector('.form-error');
        const amount = parseAmount(form.amount.value);
        const category = form.querySelector('input[name="category"]:checked')?.value;
        if (!(amount > 0)) { err.textContent = 'Enter an amount above zero.'; form.amount.focus(); return; }
        if (!category) { err.textContent = 'Pick a category.'; return; }
        const currency = form.currency.value;
        const rate = conv.rate();
        if (currency !== s.settings.currency && !(rate > 0)) { err.textContent = `Enter the ${currency} to ${s.settings.currency} rate.`; return; }
        if (currency !== s.settings.currency) rememberRate(currency, s.settings.currency, rate);
        store.saveExpense({
          ...(existing || {}),
          amount, currency, baseAmount: round2(amount * rate), category,
          note: form.note.value.trim(), date: form.date.value || today(),
          ...(form.querySelector('[name="accountId"]') ? { accountId: form.querySelector('[name="accountId"]:checked')?.value || null } : {}),
        });
        if (!existing && form.querySelector('[name="accountId"]')) store.update((st) => { st.settings.lastExpenseAccountId = form.querySelector('[name="accountId"]:checked')?.value || null; }, { silent: true });
        haptic();
        closeSheet();
        toast(existing ? 'Changes saved' : `Added ${fmt(amount, currency)}`);
      });
    },
  });
}

export function newCategorySheet(onDone) {
  openSheet(`<form class="sheet-body">
    <header class="sheet-head"><h2 class="sheet-title">New category</h2><button type="button" class="icon-btn" data-close aria-label="Close">✕</button></header>
    <div class="split">
      <input name="icon" class="input icon-input" value="🏷️" maxlength="4" aria-label="Emoji">
      <input name="name" class="input" placeholder="Name, e.g. Gym" maxlength="30" autofocus required>
    </div>
    <div class="sheet-foot"><button class="btn btn-primary btn-wide">Add category</button></div>
  </form>`, {
    onMount(sheet) {
      sheet.querySelector('form').addEventListener('submit', (ev) => {
        ev.preventDefault();
        const name = ev.target.name.value.trim();
        if (!name) return;
        let id = slug(name);
        while (S().categories.some((c) => c.id === id)) id += '-x';
        const cat = { id, name, icon: ev.target.icon.value.trim() || '🏷️', kind: 'spend', custom: true };
        store.update((st) => { st.categories.push(cat); }, { silent: true });
        closeSheet();
        onDone?.(cat);
      });
    },
  });
}

// ---------- bill

const REMIND_OPTIONS = [[0, 'On the day'], [1, '1 day before'], [2, '2 days before'], [3, '3 days before'], [7, '1 week before']];

export function billSheet(existing = null) {
  const s = S();
  const b = existing || { name: '', amount: '', currency: s.settings.currency, category: 'subscriptions', frequency: 'monthly', nextDue: addDays(today(), 7), remindDays: s.settings.remindDays, autopay: false, endDate: '', notes: '' };
  const cats = store.categoriesByUse();
  const once = b.frequency === 'once';
  const endMode = b.endDate ? (b.endMode === 'count' ? 'count' : 'date') : 'never';
  const anchor = b.anchorDay || Number((b.nextDue || today()).slice(8));
  const leftNow = b.endDate && !once ? countOccurrences(b.nextDue, b.frequency, b.endDate, anchor) : 12;
  const repeatOptions = Object.entries(FREQUENCIES).filter(([k]) => k !== 'once');
  openSheet(`<form class="sheet-body" novalidate>
      <header class="sheet-head">
        <h2 class="sheet-title">${existing ? 'Edit bill' : 'New bill'}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Close">✕</button>
      </header>
      <input name="name" class="input input-lg" placeholder="What is it? e.g. Mortgage, Netflix" value="${esc(b.name)}" maxlength="60" ${existing ? '' : 'autofocus'}>
      <div class="amount-field amount-sm">
        <input name="amount" type="text" inputmode="decimal" placeholder="${b.variable ? 'Usual amount' : 'Amount'}" value="${b.amount || ''}" autocomplete="off" aria-label="Amount">
        ${currencySelect('currency', b.currency)}
      </div>
      <label class="toggle"><input type="checkbox" name="variable" ${b.variable ? 'checked' : ''}><span class="toggle-ui"></span><span class="toggle-text"><b>Amount changes each time</b><small>Like electricity or water. Enter the usual amount; you confirm the real one when you pay.</small></span></label>
      <div class="field-label">How is it paid?</div>
      <div class="segmented" role="radiogroup" aria-label="How is it paid">
        <label><input type="radio" name="kind" value="repeat" ${once ? '' : 'checked'}><span>Repeats</span></label>
        <label><input type="radio" name="kind" value="once" ${once ? 'checked' : ''}><span>One time</span></label>
      </div>
      <div class="grid-2 bill-when">
        <label class="field"><span data-due-label>${once ? 'Due on' : 'Next payment'}</span><input type="date" name="nextDue" class="input" value="${b.nextDue || today()}" required></label>
        <label class="field" data-repeat-only><span>How often</span><select name="frequency" class="input">${repeatOptions.map(([k, f]) => `<option value="${k}" ${k === (once ? 'monthly' : b.frequency) ? 'selected' : ''}>${f.label}</option>`).join('')}</select></label>
      </div>
      <div data-repeat-only>
        <div class="field-label">Ends</div>
        <div class="segmented" role="radiogroup" aria-label="Ends">
          <label><input type="radio" name="endMode" value="never" ${endMode === 'never' ? 'checked' : ''}><span>Never</span></label>
          <label><input type="radio" name="endMode" value="date" ${endMode === 'date' ? 'checked' : ''}><span>On a date</span></label>
          <label><input type="radio" name="endMode" value="count" ${endMode === 'count' ? 'checked' : ''}><span>After</span></label>
        </div>
        <label class="field" data-end="date"><span>Last payment on</span><input type="date" name="endDate" class="input" value="${b.endDate || ''}"></label>
        <label class="field" data-end="count"><span>Number of payments left, including the next one</span><input type="number" name="endCount" class="input" min="1" max="1200" inputmode="numeric" value="${leftNow === Infinity ? 12 : leftNow}"></label>
      </div>
      <p class="schedule-summary" aria-live="polite"></p>
      <div class="field-label">Remind me</div>
      <div class="chip-row">${REMIND_OPTIONS.map(([v, l]) => chip('remindDays', v, l, Number(b.remindDays) === v)).join('')}</div>
      <label class="toggle"><input type="checkbox" name="autopay" ${b.autopay ? 'checked' : ''}><span class="toggle-ui"></span><span class="toggle-text"><b>Paid automatically</b><small>Direct debit or card. It gets logged for you on the due date.</small></span></label>
      <div class="grid-2">
        <label class="field"><span>Category</span><select name="category" class="input">${cats.map((c) => `<option value="${c.id}" ${c.id === b.category ? 'selected' : ''}>${c.icon} ${esc(c.name)}</option>`).join('')}</select></label>
        ${accountSelect('accountId', existing ? b.accountId : (s.settings.lastBillAccountId || ''))}
      </div>
      <details class="more-cats" ${b.notes ? 'open' : ''}><summary>Notes</summary>
        <input name="notes" class="input" placeholder="Account number hint, reference, etc." value="${esc(b.notes || '')}" maxlength="200">
      </details>
      <p class="form-error" role="alert"></p>
      <div class="sheet-foot">
        ${existing ? '<button type="button" class="btn btn-quiet danger-text" data-delete>Delete</button>' : ''}
        <button class="btn btn-primary btn-wide">${existing ? 'Save changes' : 'Add bill'}</button>
      </div>
    </form>`, {
    tall: true,
    onMount(sheet) {
      const form = sheet.querySelector('form');
      const kind = () => form.querySelector('[name="kind"]:checked').value;
      const mode = () => form.querySelector('[name="endMode"]:checked').value;
      // Work out the schedule the form describes. Returns { frequency, endDate, endMode } or { error }.
      const schedule = () => {
        const nextDue = form.nextDue.value;
        if (kind() === 'once') return { frequency: 'once', endDate: null, endMode: 'never', nextDue };
        const frequency = form.frequency.value;
        const day = Number(nextDue.slice(8));
        if (mode() === 'never') return { frequency, endDate: null, endMode: 'never', nextDue };
        if (mode() === 'date') {
          const end = form.endDate.value;
          if (!end) return { error: 'Pick the date of the last payment.' };
          if (end < nextDue) return { error: 'The last payment is before the next one.' };
          return { frequency, endDate: end, endMode: 'date', nextDue };
        }
        const n = parseInt(form.endCount.value, 10);
        if (!(n >= 1)) return { error: 'Enter how many payments are left.' };
        return { frequency, endDate: nthOccurrence(nextDue, frequency, Math.min(n, 1200), day), endMode: 'count', nextDue };
      };
      const refresh = () => {
        const isOnce = kind() === 'once';
        sheet.querySelectorAll('[data-repeat-only]').forEach((el) => { el.hidden = isOnce; });
        sheet.querySelector('[data-due-label]').textContent = isOnce ? 'Due on' : 'Next payment';
        sheet.querySelectorAll('[data-end]').forEach((el) => { el.hidden = isOnce || el.dataset.end !== mode(); });
        const sc = form.nextDue.value ? schedule() : { error: '' };
        sheet.querySelector('.schedule-summary').textContent = sc.error ? '' : describeSchedule({ ...sc, anchorDay: Number(sc.nextDue.slice(8)) });
      };
      form.addEventListener('change', refresh);
      form.variable.addEventListener('change', () => { form.amount.placeholder = form.variable.checked ? 'Usual amount' : 'Amount'; });
      wireAccountSelect(sheet, 'accountId');
      form.addEventListener('input', (e) => { if (['endCount', 'nextDue', 'endDate'].includes(e.target.name)) refresh(); });
      refresh();
      sheet.querySelector('[data-delete]')?.addEventListener('click', async () => {
        if (await confirmSheet({ title: `Delete ${existing.name}?`, body: 'Past payments stay in your activity.' })) {
          store.deleteBill(existing.id);
          closeSheet(); closeSheet();
          toast('Bill deleted');
        }
      });
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const err = sheet.querySelector('.form-error');
        const amount = parseAmount(form.amount.value);
        const name = form.name.value.trim();
        if (!name) { err.textContent = 'Give the bill a name.'; form.name.focus(); return; }
        if (!(amount > 0)) { err.textContent = 'Enter an amount above zero.'; form.amount.focus(); return; }
        if (!form.nextDue.value) { err.textContent = kind() === 'once' ? 'Pick the date it is due.' : 'Pick the next payment date.'; return; }
        const sc = schedule();
        if (sc.error) { err.textContent = sc.error; return; }
        store.saveBill({
          ...(existing ? { id: existing.id } : {}),
          name, amount, currency: form.currency.value, category: form.category.value,
          frequency: sc.frequency, nextDue: form.nextDue.value, endDate: sc.endDate, endMode: sc.endMode,
          remindDays: Number(form.querySelector('[name="remindDays"]:checked')?.value ?? 2),
          autopay: form.autopay.checked, notes: form.notes.value.trim(), variable: form.variable.checked,
          accountId: form.accountId.value && form.accountId.value !== '__new' ? form.accountId.value : null,
          active: true,
        });
        if (form.accountId.value && form.accountId.value !== '__new') store.update((st) => { st.settings.lastBillAccountId = form.accountId.value; }, { silent: true });
        haptic();
        closeSheet();
        toast(existing ? 'Changes saved' : `${name} added`);
      });
    },
  });
}

// Pay with a different amount or date than the default one-tap action.
export function payBillSheet(bill) {
  const s = S();
  openSheet(`<form class="sheet-body">
      <header class="sheet-head"><h2 class="sheet-title">Pay ${esc(bill.name)}</h2><button type="button" class="icon-btn" data-close aria-label="Close">✕</button></header>
      <p class="muted">Due ${shortDate(bill.nextDue)}${bill.variable ? `. Last time ${fmt(store.suggestedAmount(bill), bill.currency)}, usually about ${fmt(store.billAmount(bill), bill.currency)}.` : ''}</p>
      <div class="amount-field">
        <input name="amount" type="text" inputmode="decimal" value="${Number(store.suggestedAmount(bill)).toFixed(2)}" aria-label="Amount paid" ${bill.variable ? 'autofocus' : ''}>
        <span class="cur-fixed">${bill.currency}</span>
      </div>
      <div class="field-label">Paid on</div>
      ${dateChips('date', today())}
      <div class="sheet-foot"><button class="btn btn-primary btn-wide">Mark as paid</button></div>
    </form>`, {
    onMount(sheet) {
      wireDateChips(sheet, 'date');
      sheet.querySelector('form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const amount = parseAmount(ev.target.amount.value);
        if (!(amount > 0)) return;
        let baseAmount = amount;
        if (bill.currency !== s.settings.currency) {
          const r = lastRate(bill.currency, s.settings.currency) || await fetchRate(bill.currency, s.settings.currency);
          baseAmount = r ? amount * r : amount;
        }
        store.markBillPaid(bill.id, { paidOn: ev.target.date.value || today(), amount, baseAmount });
        haptic();
        closeSheet();
        toast(`${bill.name} paid`, { action: 'Undo', onAction: () => store.undoLastBillAction(bill.id) });
      });
    },
  });
}

// ---------- trips

export function tripSheet(existing = null) {
  const s = S();
  const t = existing || { name: '', destination: '', startDate: today(), endDate: addDays(today(), 4), budget: '', currency: s.settings.currency, people: ['Me'], countInMonthly: false };
  openSheet(`<form class="sheet-body" novalidate>
      <header class="sheet-head"><h2 class="sheet-title">${existing ? 'Edit trip' : 'New trip'}</h2><button type="button" class="icon-btn" data-close aria-label="Close">✕</button></header>
      <input name="name" class="input input-lg" placeholder="Trip name, e.g. Lagos for Christmas" value="${esc(t.name)}" maxlength="60" ${existing ? '' : 'autofocus'}>
      <input name="destination" class="input" placeholder="Where to? (optional)" value="${esc(t.destination)}" maxlength="60">
      <div class="grid-2">
        <label class="field"><span>From</span><input type="date" name="startDate" class="input" value="${t.startDate}"></label>
        <label class="field"><span>To</span><input type="date" name="endDate" class="input" value="${t.endDate}"></label>
      </div>
      <div class="amount-field amount-sm">
        <input name="budget" type="text" inputmode="decimal" placeholder="Trip budget (optional)" value="${t.budget || ''}" aria-label="Budget">
        ${currencySelect('currency', t.currency)}
      </div>
      <label class="field"><span>Who is sharing costs? Separate with commas.</span><input name="people" class="input" value="${esc((t.people || ['Me']).join(', '))}" placeholder="Me, Ada, Tunde"></label>
      <label class="toggle"><input type="checkbox" name="countInMonthly" ${t.countInMonthly ? 'checked' : ''}><span class="toggle-ui"></span><span class="toggle-text"><b>Count in my monthly budget</b><small>New trip expenses also show in the monthly total. You can change it per expense.</small></span></label>
      <p class="form-error" role="alert"></p>
      <div class="sheet-foot">
        ${existing ? '<button type="button" class="btn btn-quiet danger-text" data-delete>Delete</button>' : ''}
        <button class="btn btn-primary btn-wide">${existing ? 'Save changes' : 'Create trip'}</button>
      </div>
    </form>`, {
    tall: true,
    onMount(sheet) {
      const form = sheet.querySelector('form');
      sheet.querySelector('[data-delete]')?.addEventListener('click', async () => {
        if (await confirmSheet({ title: `Delete ${existing.name}?`, body: 'This also deletes all expenses logged on this trip.' })) {
          store.deleteTrip(existing.id);
          closeSheet();
          location.hash = '#trips';
          toast('Trip deleted');
        }
      });
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const err = sheet.querySelector('.form-error');
        const name = form.name.value.trim();
        if (!name) { err.textContent = 'Give the trip a name.'; return; }
        if (form.endDate.value < form.startDate.value) { err.textContent = 'The end date is before the start date.'; return; }
        const people = form.people.value.split(',').map((p) => p.trim()).filter(Boolean);
        if (!people.length) people.push('Me');
        const data = {
          ...(existing ? { id: existing.id } : {}),
          name, destination: form.destination.value.trim(), startDate: form.startDate.value, endDate: form.endDate.value,
          budget: parseAmount(form.budget.value) || 0, currency: form.currency.value, people, countInMonthly: form.countInMonthly.checked,
        };
        store.saveTrip(data);
        closeSheet();
        toast(existing ? 'Changes saved' : `${name} created`);
      });
    },
  });
}

export function tripExpenseSheet(existing, trip, { amount: prefill } = {}) {
  const s = S();
  const e = existing || { amount: prefill || '', currency: trip.currency, category: '', note: '', date: today() < trip.startDate ? trip.startDate : (today() > trip.endDate ? trip.endDate : today()), payer: 'Me', split: true, countInMonthly: !!trip.countInMonthly };
  const people = trip.people?.length ? trip.people : ['Me'];
  const needsBase = () => true;
  openSheet(`<form class="sheet-body" novalidate>
      <header class="sheet-head">
        <h2 class="sheet-title">${existing ? 'Edit trip expense' : esc(trip.name)}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Close">✕</button>
      </header>
      <div class="amount-field">
        <input name="amount" type="text" inputmode="decimal" placeholder="0" value="${e.amount || ''}" autocomplete="off" ${existing ? '' : 'autofocus'} aria-label="Amount">
        ${currencySelect('currency', e.currency)}
      </div>
      ${convertBox()}
      <div class="field-label">Category</div>
      ${categoryGrid(TRIP_CATEGORIES, e.category)}
      ${people.length > 1 || existing ? `<div class="field-label">Paid by</div>
      <div class="chip-row">${people.map((p) => chip('payer', p, esc(p), p === e.payer)).join('')}</div>
      <label class="toggle"><input type="checkbox" name="split" ${e.split !== false ? 'checked' : ''}><span class="toggle-ui"></span><span class="toggle-text"><b>Split equally</b><small>Shared by ${people.length} people</small></span></label>` : '<input type="hidden" name="payer" value="Me">'}
      <input name="note" class="input" placeholder="Note or place (optional)" value="${esc(e.note)}" maxlength="120">
      ${dateChips('date', e.date)}
      <label class="toggle"><input type="checkbox" name="countInMonthly" ${e.countInMonthly ? 'checked' : ''}><span class="toggle-ui"></span><span class="toggle-text"><b>Also count in monthly budget</b><small>Shows as Travel in ${esc(s.settings.currency)} on your monthly total</small></span></label>
      <p class="form-error" role="alert"></p>
      <div class="sheet-foot">
        ${existing ? '<button type="button" class="btn btn-quiet danger-text" data-delete>Delete</button>' : ''}
        <button class="btn btn-primary btn-wide">${existing ? 'Save changes' : 'Add to trip'}</button>
      </div>
    </form>`, {
    tall: true,
    onMount(sheet) {
      const form = sheet.querySelector('form');
      wireDateChips(sheet, 'date');
      // Convert into the trip currency (for trip totals).
      const conv = wireConversion(sheet, { target: trip.currency });
      if (existing && existing.currency !== trip.currency && existing.tripAmount) {
        sheet.querySelector('.convert input').value = rateText(existing.tripAmount / existing.amount);
      }
      sheet.querySelector('[data-delete]')?.addEventListener('click', async () => {
        if (await confirmSheet({ title: 'Delete this trip expense?' })) {
          const copy = { ...existing };
          store.deleteTripExpense(existing.id);
          closeSheet();
          toast('Expense deleted', { action: 'Undo', onAction: () => store.update((st) => { st.tripExpenses.push(copy); }) });
        }
      });
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const err = sheet.querySelector('.form-error');
        const amount = parseAmount(form.amount.value);
        const category = form.querySelector('input[name="category"]:checked')?.value;
        if (!(amount > 0)) { err.textContent = 'Enter an amount above zero.'; return; }
        if (!category) { err.textContent = 'Pick a category.'; return; }
        const currency = form.currency.value;
        const rate = conv.rate();
        if (currency !== trip.currency && !(rate > 0)) { err.textContent = `Enter the ${currency} to ${trip.currency} rate.`; return; }
        if (currency !== trip.currency) rememberRate(currency, trip.currency, rate);
        const tripAmount = round2(amount * rate);
        // Amount in the main currency, for the monthly budget.
        let baseAmount = amount;
        const main = s.settings.currency;
        if (currency !== main) {
          if (trip.currency === main) baseAmount = tripAmount;
          else {
            const r = lastRate(currency, main) || (needsBase() ? await fetchRate(currency, main) : null);
            baseAmount = r ? amount * r : tripAmount;
          }
        }
        const payer = form.querySelector('[name="payer"]:checked')?.value || form.querySelector('[name="payer"]')?.value || 'Me';
        store.saveTripExpense({
          ...(existing || {}), tripId: trip.id, amount, currency, tripAmount, baseAmount: round2(baseAmount), category,
          note: form.note.value.trim(), date: form.date.value || today(), payer, split: form.split ? form.split.checked : true,
          countInMonthly: form.countInMonthly.checked,
        });
        haptic();
        closeSheet();
        toast(existing ? 'Changes saved' : `Added ${fmt(amount, currency)} to ${trip.name}`);
      });
    },
  });
}

// ---------- check Apple Pay payments

export function reviewSheet() {
  const s = S();
  const items = s.expenses.filter((e) => e.needsReview).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  if (!items.length) return;
  const cats = store.categoriesByUse();
  openSheet(`<form class="sheet-body">
      <header class="sheet-head"><h2 class="sheet-title">Check payments</h2><button type="button" class="icon-btn" data-close aria-label="Close">✕</button></header>
      <p class="muted small">Pick a category for each shop. Next time, payments there are filed for you.</p>
      <ul class="review-list">${items.map((e) => `<li>
          <span class="tx-main"><span class="tx-title">${esc(e.note)}</span><span class="tx-sub">${shortDate(e.date)}${e.card ? `, ${esc(e.card)}` : ''}</span></span>
          <span class="review-amt">${fmt(e.amount, e.currency)}</span>
          <select class="input" name="${e.id}" aria-label="Category for ${esc(e.note)}">
            <option value="">Choose a category</option>
            ${cats.map((c) => `<option value="${c.id}" ${c.id === e.category && e.category !== 'other' ? 'selected' : ''}>${c.icon} ${esc(c.name)}</option>`).join('')}
          </select>
          ${e.currency !== s.settings.currency && e.baseAmount === e.amount ? `<button type="button" class="link-btn" data-fix-rate="${e.id}">Add the ${e.currency} rate</button>` : ''}
        </li>`).join('')}</ul>
      <div class="sheet-foot"><button class="btn btn-primary btn-wide">Save</button></div>
    </form>`, {
    tall: true,
    onMount(sheet) {
      const form = sheet.querySelector('form');
      // Choosing a category for one payment fills in the same shop's other rows.
      form.addEventListener('change', (ev) => {
        const sel = ev.target.closest('select');
        if (!sel || !sel.value) return;
        const shop = items.find((x) => x.id === sel.name)?.note.toLowerCase();
        for (const other of items) if (other.note.toLowerCase() === shop && !form[other.id].value) form[other.id].value = sel.value;
      });
      sheet.querySelectorAll('[data-fix-rate]').forEach((b) => b.addEventListener('click', () => {
        const e = S().expenses.find((x) => x.id === b.dataset.fixRate);
        closeSheet();
        setTimeout(() => expenseSheet(e), 280);
      }));
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const choices = items.map((e) => ({ id: e.id, category: form[e.id].value })).filter((c) => c.category);
        if (!choices.length) { toast('Pick a category first'); return; }
        const also = store.reviewPayments(choices);
        closeSheet();
        const left = store.reviewCount();
        toast(`Saved${also ? `, plus ${also} more from the same shop${also === 1 ? '' : 's'}` : ''}${left ? `. ${left} left to check` : ''}`);
      });
    },
  });
}

// ---------- bank accounts

export function accountSheet(existing = null, onDone) {
  const s = S();
  const a = existing || { name: '', currency: s.settings.currency };
  openSheet(`<form class="sheet-body" novalidate>
      <header class="sheet-head"><h2 class="sheet-title">${existing ? 'Edit account' : 'New account'}</h2><button type="button" class="icon-btn" data-close aria-label="Close">✕</button></header>
      <div class="split">
        <input name="name" class="input" placeholder="Bank or card, e.g. Swedbank" value="${esc(a.name)}" maxlength="40" ${existing ? '' : 'autofocus'}>
        ${currencySelect('currency', a.currency)}
      </div>
      <p class="form-error" role="alert"></p>
      <div class="sheet-foot">
        ${existing ? '<button type="button" class="btn btn-quiet danger-text" data-delete>Delete</button>' : ''}
        <button class="btn btn-primary btn-wide">${existing ? 'Save changes' : 'Add account'}</button>
      </div>
    </form>`, {
    onMount(sheet) {
      const form = sheet.querySelector('form');
      sheet.querySelector('[data-delete]')?.addEventListener('click', async () => {
        const used = S().bills.filter((b) => b.accountId === existing.id).length;
        if (await confirmSheet({ title: `Delete ${existing.name}?`, body: used ? `${used} bill${used === 1 ? '' : 's'} will have no account until you pick another.` : 'No bills use it.' })) {
          store.deleteAccount(existing.id);
          closeSheet();
          toast('Account deleted');
        }
      });
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const name = form.name.value.trim();
        if (!name) { sheet.querySelector('.form-error').textContent = 'Give the account a name.'; return; }
        if (S().accounts.some((x) => x.name.toLowerCase() === name.toLowerCase() && x.id !== existing?.id)) { sheet.querySelector('.form-error').textContent = 'You already have an account with that name.'; return; }
        const id = store.saveAccount({ ...(existing ? { id: existing.id } : {}), name, currency: form.currency.value });
        closeSheet();
        toast(existing ? 'Changes saved' : `${name} added`);
        onDone?.(id);
      });
    },
  });
}

function accountSelect(name, value, { label = 'Paid from' } = {}) {
  const accs = S().accounts;
  return `<label class="field"><span>${label}</span><select name="${name}" class="input">
      <option value="">${accs.length ? 'Not set' : 'No accounts yet'}</option>
      ${accs.map((a) => `<option value="${a.id}" ${a.id === value ? 'selected' : ''}>${esc(a.name)}${a.currency !== S().settings.currency ? ` (${a.currency})` : ''}</option>`).join('')}
      <option value="__new">Add an account</option>
    </select></label>`;
}

function wireAccountSelect(sheet, name) {
  const sel = sheet.querySelector(`select[name="${name}"]`);
  let prev = sel.value;
  sel.addEventListener('change', () => {
    if (sel.value !== '__new') { prev = sel.value; return; }
    sel.value = prev;
    accountSheet(null, (id) => {
      const a = store.account(id);
      sel.insertAdjacentHTML('beforeend', '');
      const opt = document.createElement('option');
      opt.value = id; opt.textContent = a.name;
      sel.insertBefore(opt, sel.querySelector('option[value="__new"]'));
      sel.value = id; prev = id;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
}

// Pick the account for each bill that has none.
export function assignAccountsSheet() {
  const bills = S().bills.filter((b) => b.active && b.nextDue && !b.accountId).sort((a, b) => a.name.localeCompare(b.name));
  if (!bills.length) return;
  openSheet(`<form class="sheet-body">
      <header class="sheet-head"><h2 class="sheet-title">Which account pays?</h2><button type="button" class="icon-btn" data-close aria-label="Close">✕</button></header>
      ${S().accounts.length ? '' : '<p class="muted small">Add your accounts first.</p><button type="button" class="btn btn-quiet btn-wide" data-add-account>Add an account</button>'}
      <ul class="review-list">${bills.map((b) => `<li>
          <span class="tx-main"><span class="tx-title">${esc(b.name)}</span><span class="tx-sub">${esc(store.category(b.category).name)}</span></span>
          <span class="review-amt">${fmt(b.amount, b.currency)}</span>
          ${accountSelect(b.id, '', { label: '' })}
        </li>`).join('')}</ul>
      <div class="sheet-foot"><button class="btn btn-primary btn-wide">Save</button></div>
    </form>`, {
    tall: true,
    onMount(sheet) {
      bills.forEach((b) => wireAccountSelect(sheet, b.id));
      sheet.querySelector('[data-add-account]')?.addEventListener('click', () => accountSheet(null, () => { closeSheet(); setTimeout(assignAccountsSheet, 300); }));
      sheet.querySelector('form').addEventListener('submit', (ev) => {
        ev.preventDefault();
        const pairs = bills.map((b) => ({ billId: b.id, accountId: ev.target.querySelector(`select[name="${b.id}"]`).value })).filter((p) => p.accountId && p.accountId !== '__new');
        if (!pairs.length) { toast('Pick an account for at least one bill'); return; }
        store.assignAccounts(pairs);
        closeSheet();
        toast(`Saved ${pairs.length} bill${pairs.length === 1 ? '' : 's'}`);
      });
    },
  });
}

// Confirm the real amount of bill payments that were logged at an estimate.
export function confirmAmountsSheet() {
  const items = S().expenses.filter((e) => e.amountEstimated).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!items.length) return;
  openSheet(`<form class="sheet-body" novalidate>
      <header class="sheet-head"><h2 class="sheet-title">Confirm amounts</h2><button type="button" class="icon-btn" data-close aria-label="Close">✕</button></header>
      <p class="muted small">These were paid automatically and logged at the usual amount. Enter what was actually charged.</p>
      <ul class="review-list">${items.map((e) => `<li>
          <span class="tx-main"><span class="tx-title">${esc(e.note)}</span><span class="tx-sub">${shortDate(e.date)}, logged at ${fmt(e.amount, e.currency)}</span></span>
          <span class="review-amt">${e.currency}</span>
          <input class="input" name="${e.id}" type="text" inputmode="decimal" value="${Number(e.amount).toFixed(2)}" aria-label="Real amount for ${esc(e.note)}">
        </li>`).join('')}</ul>
      <p class="form-error" role="alert"></p>
      <div class="sheet-foot"><button class="btn btn-primary btn-wide">Save amounts</button></div>
    </form>`, {
    tall: true,
    onMount(sheet) {
      sheet.querySelector('form').addEventListener('submit', (ev) => {
        ev.preventDefault();
        const vals = items.map((e) => ({ id: e.id, amount: parseAmount(ev.target[e.id].value) }));
        if (vals.some((v) => !(v.amount > 0))) { sheet.querySelector('.form-error').textContent = 'Enter an amount above zero for each one.'; return; }
        vals.forEach((v) => store.confirmPaymentAmount(v.id, v.amount));
        closeSheet();
        toast(vals.length === 1 ? 'Amount saved' : `${vals.length} amounts saved`);
      });
    },
  });
}

// ---------- close the month

export function closeMonthSheet(key) {
  const s = S();
  const existing = store.unloggedEntry(key);
  const total = store.monthSpending(key).total;
  const logged = round2(total - (existing ? (existing.baseAmount ?? existing.amount) : 0));
  const budget = s.settings.monthlyBudget || 0;
  const c = s.settings.currency;
  const name = monthName(key);
  openSheet(`<form class="sheet-body" novalidate>
      <header class="sheet-head"><h2 class="sheet-title">Close ${esc(name)}</h2><button type="button" class="icon-btn" data-close aria-label="Close">✕</button></header>
      <p class="muted">You logged ${fmt(logged, c)} in ${esc(name)}${existing ? `, plus ${fmt(existing.amount, c)} of unlogged spending added before` : ''}. How much did you really spend? Check your bank balance or statement.</p>
      <div class="amount-field">
        <input name="real" type="text" inputmode="decimal" value="${total}" aria-label="What you really spent" autofocus>
        <span class="cur-fixed">${c}</span>
      </div>
      ${budget > logged ? `<div class="chip-row"><button type="button" class="chip-btn" data-fill="${budget}">The whole budget, ${fmt(budget, c, { compact: true })}</button></div>` : ''}
      <p class="schedule-summary" data-diff aria-live="polite"></p>
      <p class="form-error" role="alert"></p>
      <div class="sheet-foot">
        ${existing ? '<button type="button" class="btn btn-quiet danger-text" data-remove>Remove</button>' : ''}
        <button class="btn btn-primary btn-wide">Save</button>
      </div>
    </form>`, {
    onMount(sheet) {
      const form = sheet.querySelector('form');
      const out = sheet.querySelector('[data-diff]');
      const show = () => {
        const real = parseAmount(form.real.value);
        const diff = round2(real - logged);
        out.textContent = !(real >= 0) ? '' : diff > 0 ? `Adds ${fmt(diff, c)} as unlogged spending` : diff === 0 ? (existing ? 'Removes the unlogged spending' : 'Nothing to add, it already matches') : '';
      };
      form.real.addEventListener('input', show);
      sheet.querySelector('[data-fill]')?.addEventListener('click', (e) => { form.real.value = e.target.dataset.fill; show(); });
      show();
      sheet.querySelector('[data-remove]')?.addEventListener('click', () => {
        store.closeMonth(key, logged);
        closeSheet();
        toast('Unlogged spending removed');
      });
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const real = parseAmount(form.real.value);
        const err = sheet.querySelector('.form-error');
        if (!(real >= 0)) { err.textContent = 'Enter what you spent.'; return; }
        const res = store.closeMonth(key, real);
        if (res.error) { err.textContent = `That is less than you logged (${fmt(res.logged, c)}). Check the expenses for ${name} instead.`; return; }
        closeSheet();
        toast(res.added ? `Added ${fmt(res.added, c)} as unlogged spending` : 'No change needed');
      });
    },
  });
}
