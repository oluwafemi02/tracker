// Small UI toolkit: escaping, bottom sheets, toasts, and delegated actions.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const actions = new Map();
export function on(name, fn) { actions.set(name, fn); }

export function bindActions(root = document) {
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = actions.get(el.dataset.action);
    if (fn) { e.preventDefault(); fn(el.dataset, el, e); }
  });
}

export function haptic() {
  try { navigator.vibrate?.(8); } catch { /* not on iOS */ }
}

// ---------- sheets

let sheetStack = [];

export function openSheet(html, { onMount, onClose, tall } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-scrim" data-close></div>
    <section class="sheet${tall ? ' sheet-tall' : ''}" role="dialog" aria-modal="true">
      <div class="sheet-grip" data-close aria-hidden="true"></div>
      ${html}
    </section>`;
  document.body.appendChild(wrap);
  document.body.classList.add('has-sheet');
  const sheet = wrap.querySelector('.sheet');
  const entry = { wrap, onClose };
  sheetStack.push(entry);
  requestAnimationFrame(() => wrap.classList.add('open'));
  wrap.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheet(); });

  // Drag the grip down to dismiss.
  let startY = null, dy = 0;
  const grip = wrap.querySelector('.sheet-grip');
  const header = sheet.querySelector('.sheet-head');
  [grip, header].filter(Boolean).forEach((el) => {
    el.addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; sheet.style.transition = 'none'; }, { passive: true });
    el.addEventListener('touchmove', (e) => { if (startY == null) return; dy = Math.max(0, e.touches[0].clientY - startY); sheet.style.transform = `translateY(${dy}px)`; }, { passive: true });
    el.addEventListener('touchend', () => {
      sheet.style.transition = ''; sheet.style.transform = '';
      if (dy > 90) closeSheet();
      startY = null; dy = 0;
    });
  });
  onMount?.(sheet);
  const focusable = sheet.querySelector('[autofocus]');
  if (focusable) setTimeout(() => focusable.focus({ preventScroll: true }), 260);
  return sheet;
}

export function closeSheet() {
  const entry = sheetStack.pop();
  if (!entry) return;
  entry.wrap.classList.remove('open');
  entry.onClose?.();
  setTimeout(() => {
    entry.wrap.remove();
    if (!sheetStack.length) document.body.classList.remove('has-sheet');
  }, 260);
}

export function closeAllSheets() { while (sheetStack.length) closeSheet(); }

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

export function confirmSheet({ title, body, confirm = 'Delete', danger = true }) {
  return new Promise((resolve) => {
    let done = false;
    openSheet(`<div class="sheet-body confirm">
        <h2 class="sheet-title">${esc(title)}</h2>
        ${body ? `<p class="muted">${esc(body)}</p>` : ''}
        <div class="row-actions">
          <button class="btn btn-quiet" data-close>Cancel</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(confirm)}</button>
        </div></div>`, {
      onMount: (s) => s.querySelector('[data-yes]').addEventListener('click', () => { done = true; resolve(true); closeSheet(); }),
      onClose: () => { if (!done) resolve(false); },
    });
  });
}

// ---------- toast

let toastTimer = null;
export function toast(message, { action, onAction, tone } = {}) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.className = `toast${tone ? ' toast-' + tone : ''}`;
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
  if (action) el.querySelector('button').onclick = () => { onAction?.(); el.classList.remove('show'); };
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 5000 : 2600);
}

// Amount input: accept "12,50" as well as "12.50".
export function parseAmount(v) {
  const n = parseFloat(String(v || '').replace(/\s/g, '').replace(',', '.'));
  return isFinite(n) ? n : NaN;
}

export function emptyState(title, body, actionHtml = '') {
  return `<div class="empty"><p class="empty-title">${esc(title)}</p><p class="muted">${esc(body)}</p>${actionHtml}</div>`;
}
