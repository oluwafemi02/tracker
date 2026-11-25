// Date helpers. Every calendar date in the app is a local 'YYYY-MM-DD' string.
// Never use toISOString() for calendar dates: in Vilnius (UTC+2/+3) it shifts
// local midnight back to the previous day, which was a bug in the old app.

export const pad = (n) => String(n).padStart(2, '0');

export function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISO(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) {
    const d = new Date(s);
    return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

export function normalizeISO(s) {
  const d = parseISO(s);
  return d ? toISO(d) : null;
}

export const today = () => toISO(new Date());

export function daysInMonth(y, m0) {
  return new Date(y, m0 + 1, 0).getDate();
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

// Add months keeping the anchor day, clamped to the month's length.
// Jan 31 + 1 month = Feb 28/29, then Mar 31 again (old app drifted to Mar 3).
export function addMonths(iso, n, anchorDay) {
  const d = parseISO(iso);
  const day = anchorDay || d.getDate();
  const total = d.getMonth() + n;
  const y = d.getFullYear() + Math.floor(total / 12);
  const m0 = ((total % 12) + 12) % 12;
  return toISO(new Date(y, m0, Math.min(day, daysInMonth(y, m0))));
}

export function diffDays(aISO, bISO) {
  // b - a in whole days
  const a = parseISO(aISO), b = parseISO(bISO);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
    Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
}

export const FREQUENCIES = {
  weekly: { label: 'Every week', short: 'weekly', days: 7 },
  biweekly: { label: 'Every 2 weeks', short: '2-weekly', days: 14 },
  monthly: { label: 'Every month', short: 'monthly', months: 1 },
  quarterly: { label: 'Every 3 months', short: 'quarterly', months: 3 },
  semiannual: { label: 'Every 6 months', short: '6-monthly', months: 6 },
  yearly: { label: 'Every year', short: 'yearly', months: 12 },
  once: { label: 'One time', short: 'once' },
};

export function nextOccurrence(iso, frequency, anchorDay) {
  const f = FREQUENCIES[frequency];
  if (!f || frequency === 'once') return null;
  if (f.days) return addDays(iso, f.days);
  return addMonths(iso, f.months, anchorDay);
}

// First occurrence on or after `fromISO`, walking the schedule from `startISO`.
export function firstOnOrAfter(startISO, frequency, fromISO, anchorDay) {
  let d = startISO;
  if (frequency === 'once') return d;
  let guard = 0;
  while (d < fromISO && guard++ < 5000) {
    const n = nextOccurrence(d, frequency, anchorDay);
    if (!n) break;
    d = n;
  }
  return d;
}

// All occurrences between two dates (inclusive), starting from nextDue.
export function occurrencesBetween(nextDue, frequency, fromISO, toISOExcl, anchorDay, endDate) {
  const out = [];
  let d = nextDue;
  let guard = 0;
  while (d && d < toISOExcl && guard++ < 1000) {
    if (endDate && d > endDate) break;
    if (d >= fromISO) out.push(d);
    if (frequency === 'once') break;
    d = nextOccurrence(d, frequency, anchorDay);
  }
  return out;
}

export function monthKey(iso) { return iso.slice(0, 7); }

export function monthBounds(key) {
  const [y, m] = key.split('-').map(Number);
  const start = `${y}-${pad(m)}-01`;
  const end = toISO(new Date(y, m, 1)); // exclusive
  return { start, end, days: daysInMonth(y, m - 1) };
}

export function shiftMonth(key, n) {
  return addMonths(`${key}-01`, n, 1).slice(0, 7);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function monthName(key, withYear) {
  const [y, m] = key.split('-').map(Number);
  const name = MONTHS[m - 1];
  return withYear || y !== new Date().getFullYear() ? `${name} ${y}` : name;
}

export function shortDate(iso) {
  const d = parseISO(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}${sameYear ? '' : ' ' + d.getFullYear()}`;
}

export function dayHeading(iso) {
  const t = today();
  const diff = diffDays(t, iso);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  const d = parseISO(iso);
  return `${WD[d.getDay()]}, ${shortDate(iso)}`;
}

// "in 3 days", "tomorrow", "2 days late"
export function relativeDue(iso, ref = today()) {
  const n = diffDays(ref, iso);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return '1 day late';
  if (n < 0) return `${-n} days late`;
  if (n < 14) return `in ${n} days`;
  return shortDate(iso);
}
