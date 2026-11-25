// Trips list and trip detail screens.

import { esc, emptyState } from './ui.js';
import { shortDate, dayHeading, diffDays, today } from './dates.js';
import { fmt } from './money.js';
import * as store from './store.js';

const S = () => store.getState();

function dateRange(t) {
  const sameMonth = t.startDate.slice(0, 7) === t.endDate.slice(0, 7);
  return sameMonth ? `${Number(t.startDate.slice(8))} to ${shortDate(t.endDate)}` : `${shortDate(t.startDate)} to ${shortDate(t.endDate)}`;
}

function tripCard(trip) {
  const st = store.tripStatus(trip);
  const ts = store.tripSummary(trip);
  const pct = trip.budget ? Math.min(100, (ts.total / trip.budget) * 100) : 0;
  const when = st === 'ongoing' ? `Day ${ts.elapsed} of ${ts.length}` : st === 'upcoming' ? `Starts in ${diffDays(today(), trip.startDate)} days` : dateRange(trip);
  return `<li><button class="trip-card st-${st}" data-action="open-trip" data-id="${trip.id}">
    <span class="trip-card-top"><b>${esc(trip.name)}</b><span>${when}</span></span>
    ${trip.destination ? `<span class="muted small">${esc(trip.destination)}</span>` : ''}
    <span class="trip-card-amt">${fmt(ts.total, trip.currency)}${trip.budget ? ` <small>of ${fmt(trip.budget, trip.currency, { compact: true })}</small>` : ''}</span>
    ${trip.budget ? `<span class="bar ${ts.total > trip.budget ? 'over' : ''}"><span style="width:${pct}%"></span></span>` : ''}
  </button></li>`;
}

export function renderTrips() {
  const trips = [...S().trips];
  const by = (st) => trips.filter((t) => store.tripStatus(t) === st);
  const ongoing = by('ongoing'), upcoming = by('upcoming').sort((a, b) => (a.startDate < b.startDate ? -1 : 1)), past = by('past').sort((a, b) => (a.endDate < b.endDate ? 1 : -1));
  return `<header class="top"><div><h1 class="top-title">Trips</h1></div><button class="btn btn-primary btn-sm" data-action="new-trip">New trip</button></header>
    ${!trips.length ? emptyState('Plan or track a trip', 'Set a budget, log spending in any currency, and see who owes whom when you travel with others.', '<button class="btn btn-primary" data-action="new-trip">Create a trip</button>') : ''}
    ${ongoing.length ? `<section class="block"><h2 class="block-title">On now</h2><ul class="trip-list">${ongoing.map(tripCard).join('')}</ul></section>` : ''}
    ${upcoming.length ? `<section class="block"><h2 class="block-title">Coming up</h2><ul class="trip-list">${upcoming.map(tripCard).join('')}</ul></section>` : ''}
    ${past.length ? `<section class="block"><h2 class="block-title">Past trips</h2><ul class="trip-list">${past.map(tripCard).join('')}</ul></section>` : ''}`;
}

export function renderTrip(id) {
  const trip = S().trips.find((t) => t.id === id);
  if (!trip) return `<header class="top"><button class="back" data-action="tab" data-tab="trips">Trips</button></header>${emptyState('Trip not found', 'It may have been deleted.')}`;
  const ts = store.tripSummary(trip);
  const st = store.tripStatus(trip);
  const c = trip.currency;
  const left = trip.budget ? trip.budget - ts.total : 0;
  const remainingDays = st === 'ongoing' ? ts.length - ts.elapsed + 1 : st === 'upcoming' ? ts.length : 0;
  const cats = Object.entries(ts.byCat).sort((a, b) => b[1] - a[1]);
  const max = cats[0]?.[1] || 1;
  const groups = [];
  for (const e of ts.items) {
    const g = groups[groups.length - 1];
    if (g && g.date === e.date) g.items.push(e); else groups.push({ date: e.date, items: [e] });
  }
  const multi = (trip.people || []).length > 1;
  return `<header class="top top-detail">
      <button class="back" data-action="tab" data-tab="trips" aria-label="Back to trips">Trips</button>
      <button class="link-btn" data-action="edit-trip" data-id="${trip.id}">Edit</button>
    </header>
    <section class="hero">
      <h1 class="top-title">${esc(trip.name)}</h1>
      <p class="top-sub">${trip.destination ? esc(trip.destination) + ', ' : ''}${dateRange(trip)}</p>
      <div class="hero-figure ${left < 0 ? 'over' : ''}">
        <p class="hero-amount">${fmt(ts.total, c)}</p>
        <p class="hero-caption">${trip.budget ? (left >= 0 ? `spent, ${fmt(left, c)} left${remainingDays ? `, about ${fmt(left / remainingDays, c)} a day` : ''}` : `spent, ${fmt(-left, c)} over budget`) : 'spent so far'}</p>
      </div>
      ${trip.budget ? `<span class="bar bar-lg ${left < 0 ? 'over' : ''}"><span style="width:${Math.min(100, (ts.total / trip.budget) * 100)}%"></span></span>` : ''}
      <dl class="hero-stats">
        <div><dt>Per day</dt><dd>${fmt(ts.perDay, c, { compact: true })}</dd></div>
        <div><dt>Days</dt><dd>${st === 'ongoing' ? `${ts.elapsed}/${ts.length}` : ts.length}</dd></div>
        <div><dt>Expenses</dt><dd>${ts.items.length}</dd></div>
      </dl>
    </section>
    ${cats.length ? `<section class="block"><h2 class="block-title">Where it went</h2><ul class="cat-bars">${cats.map(([id, v]) => {
      const cat = store.category(id);
      return `<li><div class="cat-bar"><span class="cb-label"><i>${cat.icon}</i>${esc(cat.name)}</span><span class="cb-val">${fmt(v, c)}</span><span class="cb-track"><span style="width:${(v / max) * 100}%"></span></span></div></li>`;
    }).join('')}</ul></section>` : ''}
    ${multi && ts.items.length ? `<section class="block"><h2 class="block-title">Who owes whom</h2>
      ${ts.settle.length ? `<ul class="settle">${ts.settle.map((x) => `<li><b>${esc(x.from)}</b> pays <b>${esc(x.to)}</b><span>${fmt(x.amount, c)}</span></li>`).join('')}</ul>` : '<p class="muted pad">All even.</p>'}
      <ul class="balances">${ts.balances.map((b) => `<li><span>${esc(b.person)}</span><span class="muted">paid ${fmt(b.paid, c)}</span><span class="${b.net >= 0 ? 'pos' : 'neg'}">${b.net >= 0 ? '+' : ''}${fmt(b.net, c)}</span></li>`).join('')}</ul>
    </section>` : ''}
    <section class="block">
      <div class="block-head"><h2 class="block-title">Expenses</h2><button class="btn btn-primary btn-sm" data-action="add-trip-expense" data-id="${trip.id}">Add</button></div>
      ${groups.length ? groups.map((g) => `<div class="day-group"><h3 class="day-head"><span>${dayHeading(g.date)}</span><span>${fmt(g.items.reduce((s, e) => s + e.tripAmount, 0), c)}</span></h3><ul class="list">${g.items.map((e) => {
        const cat = store.category(e.category);
        return `<li class="tx-row" data-action="trip-expense" data-id="${e.id}"><span class="tx-icon">${cat.icon}</span>
          <span class="tx-main"><span class="tx-title">${esc(e.note || cat.name)}</span><span class="tx-sub">${esc(e.note ? cat.name : '')}${multi ? `${e.note ? ', ' : ''}${esc(e.payer)} paid${e.split === false ? ', not split' : ''}` : ''}${e.countInMonthly ? ' <span class="tag">Monthly</span>' : ''}</span></span>
          <span class="tx-amt">${fmt(e.tripAmount, c)}${e.currency !== c ? `<small>${fmt(e.amount, e.currency)}</small>` : ''}</span></li>`;
      }).join('')}</ul></div>`).join('') : emptyState('Nothing logged yet', 'Tap Add or + to log trip spending in any currency.')}
    </section>
    ${st !== 'past' ? '' : `<p class="center"><button class="link-btn" data-action="reopen-trip" data-id="${trip.id}">${trip.closed ? 'Reopen trip' : ''}</button></p>`}
    ${st === 'ongoing' ? `<p class="center"><button class="link-btn" data-action="close-trip" data-id="${trip.id}">Mark trip as finished</button></p>` : ''}`;
}
