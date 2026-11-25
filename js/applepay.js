// Apple Pay logging. An iPhone Shortcut (Wallet "Transaction" automation) posts each
// payment to the push server's inbox; the app picks them up when opened and adds them
// as expenses. Shops are remembered: once you give "Rimi" a category, later Rimi
// payments get it automatically.

import { toISO } from './dates.js';
import { CURRENCY_CODES, round2 } from './money.js';

const SYMBOLS = [
  ['zł', 'PLN'], ['Kč', 'CZK'], ['kr', 'SEK'], ['Ft', 'HUF'], ['lei', 'RON'], ['C$', 'CAD'], ['A$', 'AUD'], ['NZ$', 'NZD'],
  ['HK$', 'HKD'], ['S$', 'SGD'], ['R$', 'BRL'], ['MX$', 'MXN'], ['GH₵', 'GHS'], ['KSh', 'KES'], ['RM', 'MYR'],
  ['€', 'EUR'], ['£', 'GBP'], ['₦', 'NGN'], ['₹', 'INR'], ['₺', 'TRY'], ['₩', 'KRW'], ['฿', 'THB'], ['₱', 'PHP'], ['₾', 'GEL'], ['¥', 'JPY'], ['$', 'USD'],
];

// "€12.50", "12,50 €", "£3.20", "EUR 7", "1 234,56 €", "-€5.00", "₦20,000.00" -> { amount, currency }
export function parseWalletAmount(input, fallbackCurrency = 'EUR') {
  const s = String(input ?? '').replace(/[  ]/g, ' ').trim();
  if (!s) return null;
  let currency = null;
  const code = s.toUpperCase().match(/\b([A-Z]{3})\b/);
  if (code && CURRENCY_CODES.includes(code[1])) currency = code[1];
  if (!currency) currency = SYMBOLS.find(([sym]) => s.includes(sym))?.[1] || fallbackCurrency;
  const negative = /^\s*[-−(]|[-−]\s*[\d.,]|\)\s*$/.test(s);
  let n = s.replace(/[^\d.,]/g, '');
  if (!/\d/.test(n)) return null;
  const lastComma = n.lastIndexOf(','), lastDot = n.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // Both used: the last one is the decimal mark.
    n = lastComma > lastDot ? n.replace(/\./g, '').replace(',', '.') : n.replace(/,/g, '');
  } else if (lastComma > -1) {
    const decimals = n.length - lastComma - 1;
    n = (n.split(',').length === 2 && decimals <= 2) ? n.replace(',', '.') : n.replace(/,/g, '');
  } else if (lastDot > -1) {
    const decimals = n.length - lastDot - 1;
    if (n.split('.').length > 2 || (decimals === 3 && currency === 'NGN')) n = n.replace(/\./g, '');
  }
  const amount = round2(parseFloat(n));
  if (!isFinite(amount)) return null;
  return { amount: negative ? -amount : amount, currency };
}

// "RIMI VILNIUS 0123" -> "rimi vilnius"; used to remember categories per shop.
export function merchantKey(name) {
  return String(name || '').toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^\s*[a-z]{1,8}\s*\*\s*/, '') // processor prefixes like "SQ *", "PAYPAL *"
    .replace(/[*#].*$/, '') // branch or terminal suffixes like "#1234"
    .replace(/[^\p{L}\s&']/gu, ' ')
    .replace(/\b(uab|ab|ltd|llc|inc|gmbh|sia|oy|as|plc)\b/g, ' ')
    .replace(/\s+/g, ' ').trim()
    .split(' ').slice(0, 3).join(' ');
}

export function categoryFor(rules, merchant) {
  const key = merchantKey(merchant);
  if (!key) return null;
  if (rules[key]) return rules[key];
  const first = key.split(' ')[0];
  return first.length >= 3 ? rules[`*${first}`] || null : null;
}

export function learn(rules, merchant, categoryId) {
  const key = merchantKey(merchant);
  if (!key) return;
  rules[key] = categoryId;
  const first = key.split(' ')[0];
  if (first.length >= 3) rules[`*${first}`] = categoryId;
}

export function tidyMerchant(name) {
  const s = String(name || '').replace(/\s+/g, ' ').trim();
  if (!s) return 'Apple Pay';
  // Shout-case from card networks ("RIMI VILNIUS") reads better as "Rimi Vilnius".
  return s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : s;
}

/**
 * Turn inbox items into expenses. Pure, so it can be tested.
 * rate(from) returns the rate to the main currency, or null.
 * Returns { expenses, done (inbox ids to remove), refunds, duplicates }.
 */
export function inboxToExpenses(items, { main, rules, existing = [], rate = () => null, uid }) {
  const out = [];
  const done = [];
  let refunds = 0, duplicates = 0;
  const recent = existing.filter((e) => e.source === 'applepay');
  const sorted = [...items].sort((a, b) => (a.receivedAt < b.receivedAt ? -1 : 1));
  for (const item of sorted) {
    done.push(item.id);
    if (recent.some((e) => e.inboxId === item.id) || out.some((e) => e.inboxId === item.id)) { duplicates++; continue; }
    const parsed = parseWalletAmount(item.amount, main);
    if (!parsed || parsed.amount === 0) continue;
    if (parsed.amount < 0) { refunds++; continue; }
    const at = new Date(item.receivedAt || Date.now());
    const merchant = tidyMerchant(item.merchant);
    // The Shortcut can fire twice for one payment; treat the same amount and shop within 2 minutes as one.
    const twin = [...recent, ...out].find((e) => e.amount === parsed.amount && merchantKey(e.note) === merchantKey(merchant) && Math.abs(new Date(e.createdAt) - at) < 120e3);
    if (twin) { duplicates++; continue; }
    const category = categoryFor(rules, merchant);
    const r = parsed.currency === main ? 1 : rate(parsed.currency);
    out.push({
      id: uid('e'),
      amount: parsed.amount,
      currency: parsed.currency,
      baseAmount: round2(parsed.amount * (r || 1)),
      category: category || 'other',
      note: merchant,
      date: toISO(at),
      billId: null,
      person: '',
      source: 'applepay',
      inboxId: item.id,
      card: item.card || '',
      needsReview: !category || !r,
      createdAt: at.toISOString(),
    });
  }
  return { expenses: out, done, refunds, duplicates };
}
