// Currency formatting and exchange rates.

export const CURRENCIES = {
  EUR: '€', USD: '$', GBP: '£', NGN: '₦', JPY: '¥', CNY: '¥', CHF: 'CHF', SEK: 'kr', NOK: 'kr', DKK: 'kr',
  PLN: 'zł', CZK: 'Kč', HUF: 'Ft', RON: 'lei', BGN: 'лв', TRY: '₺', AED: 'AED', CAD: 'C$', AUD: 'A$',
  NZD: 'NZ$', INR: '₹', MYR: 'RM', SGD: 'S$', THB: '฿', ZAR: 'R', GHS: 'GH₵', KES: 'KSh', MXN: 'MX$',
  BRL: 'R$', KRW: '₩', HKD: 'HK$', IDR: 'Rp', PHP: '₱', EGP: 'E£', MAD: 'MAD', ISK: 'kr', GEL: '₾',
};

export const CURRENCY_CODES = Object.keys(CURRENCIES);

const fmtCache = new Map();
function formatter(cur, decimals) {
  const k = cur + decimals;
  if (!fmtCache.has(k)) {
    try {
      fmtCache.set(k, new Intl.NumberFormat('en-IE', {
        style: 'currency', currency: cur, currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: decimals, maximumFractionDigits: decimals,
      }));
    } catch {
      fmtCache.set(k, { format: (v) => `${CURRENCIES[cur] || cur}${v.toFixed(decimals)}` });
    }
  }
  return fmtCache.get(k);
}

export function fmt(amount, cur = 'EUR', opts = {}) {
  const v = Number(amount) || 0;
  const whole = opts.compact && Math.abs(v) >= 100;
  return formatter(cur, whole ? 0 : 2).format(v);
}

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Rates are "1 unit of `from` = rate units of `to`".
const RATE_KEY = 'ledger.rates';

function readRates() {
  try { return JSON.parse(localStorage.getItem(RATE_KEY)) || {}; } catch { return {}; }
}

export function lastRate(from, to) {
  if (from === to) return 1;
  const r = readRates()[`${from}>${to}`];
  return r ? r.rate : null;
}

export function rememberRate(from, to, rate) {
  if (from === to || !rate) return;
  const all = readRates();
  all[`${from}>${to}`] = { rate: Number(rate), at: Date.now() };
  all[`${to}>${from}`] = { rate: 1 / Number(rate), at: Date.now() };
  localStorage.setItem(RATE_KEY, JSON.stringify(all));
}

// Fetch a live ECB rate. Falls back to the last rate used, then null.
export async function fetchRate(from, to) {
  if (from === to) return 1;
  const cached = readRates()[`${from}>${to}`];
  if (cached && Date.now() - cached.at < 6 * 3600e3) return cached.rate;
  const urls = [
    `https://api.frankfurter.dev/v1/latest?base=${from}&symbols=${to}`,
    `https://api.frankfurter.app/latest?from=${from}&to=${to}`,
  ];
  for (const url of urls) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) continue;
      const data = await res.json();
      const rate = data?.rates?.[to];
      if (rate) { rememberRate(from, to, rate); return rate; }
    } catch { /* offline or blocked */ }
  }
  return cached ? cached.rate : null;
}
