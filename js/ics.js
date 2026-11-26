// Calendar file builder, shared by the app and the push server.

import { addDays, parseISO, FREQUENCIES } from './dates.js';
import { fmt } from './money.js';

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

function fold(line) {
  // RFC 5545: lines longer than 75 octets are folded with CRLF + space.
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out = [];
  let cur = '';
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ''; }
    cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const icsDate = (iso) => iso.replace(/-/g, '');

export function rrule(bill) {
  const f = FREQUENCIES[bill.frequency];
  if (!f || bill.frequency === 'once') return null;
  let r;
  if (f.days) r = `FREQ=WEEKLY;INTERVAL=${f.days / 7}`;
  else if (f.months === 12) r = 'FREQ=YEARLY';
  else {
    r = `FREQ=MONTHLY;INTERVAL=${f.months}`;
    const day = bill.anchorDay || parseISO(bill.nextDue).getDate();
    // Days 29-31 do not exist in every month; fall back to the month's last day.
    if (day >= 29) r += `;BYMONTHDAY=${Array.from({ length: day - 27 }, (_, i) => 28 + i).join(',')};BYSETPOS=-1`;
    else r += `;BYMONTHDAY=${day}`;
  }
  if (bill.endDate) r += `;UNTIL=${icsDate(bill.endDate)}`;
  return r;
}

function trigger(daysBefore, hhmm) {
  const [h, m] = (hhmm || '09:00').split(':').map(Number);
  const mins = daysBefore * 1440 - (h * 60 + (m || 0));
  return mins >= 0 ? `-PT${mins}M` : `PT${-mins}M`;
}

export function buildICS(bills, settings = {}, appUrl = '') {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tracker//Bills//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Bills'];
  for (const b of bills) {
    if (b.active === false || !b.nextDue) continue;
    const lead = Number(b.remindDays ?? settings.remindDays ?? 2);
    lines.push('BEGIN:VEVENT',
      `UID:${b.id}@tracker.bills`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(b.nextDue)}`,
      `DTEND;VALUE=DATE:${icsDate(addDays(b.nextDue, 1))}`,
      `SUMMARY:${esc(b.amount != null ? `${b.name} ${b.variable ? '~' : ''}${fmt(b.amount, b.currency)}` : b.name)}`,
      `DESCRIPTION:${esc(`${FREQUENCIES[b.frequency]?.label || ''} bill${b.autopay ? ' (autopay)' : ''}. ${appUrl ? `Mark it paid: ${appUrl}?bill=${b.id}` : 'Open Tracker to mark it paid.'}`)}`,
      'TRANSP:TRANSPARENT');
    const r = rrule(b);
    if (r) lines.push(`RRULE:${r}`);
    if (lead > 0) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`${b.name} due in ${lead} day${lead > 1 ? 's' : ''}`)}`, `TRIGGER:${trigger(lead, settings.remindTime)}`, 'END:VALARM');
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`${b.name} due today`)}`, `TRIGGER:${trigger(0, settings.remindTime)}`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

