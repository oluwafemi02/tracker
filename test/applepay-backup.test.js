import './setup.js';
import { resetStorage } from './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWalletAmount, merchantKey, categoryFor, learn, inboxToExpenses, tidyMerchant } from '../js/applepay.js';
import { deriveKeys, encryptJSON, decryptJSON, restoredState, dataHash, backupPayload } from '../js/backup.js';

test('reads the amounts the Wallet shortcut sends, in any format', () => {
  const cases = [
    ['€12.50', 12.5, 'EUR'], ['12,50 €', 12.5, 'EUR'], ['£3.20', 3.2, 'GBP'], ['EUR 7', 7, 'EUR'],
    ['1 234,56 €', 1234.56, 'EUR'], ['1,234.56', 1234.56, 'EUR'], ['$1,234', 1234, 'USD'], ['₦20,000.00', 20000, 'NGN'],
    ['12.5', 12.5, 'EUR'], ['PLN 45,99', 45.99, 'PLN'], ['45,99 zł', 45.99, 'PLN'], ['-€5.00', -5, 'EUR'], ['€ 0.99', 0.99, 'EUR'],
    ['12 345,00 €', 12345, 'EUR'],
  ];
  for (const [input, amount, currency] of cases) assert.deepEqual(parseWalletAmount(input, 'EUR'), { amount, currency }, input);
  assert.equal(parseWalletAmount('', 'EUR'), null);
  assert.equal(parseWalletAmount('free', 'EUR'), null);
  assert.deepEqual(parseWalletAmount('9.99', 'GBP'), { amount: 9.99, currency: 'GBP' });
});

test('remembers shops by a stable key', () => {
  assert.equal(merchantKey('RIMI VILNIUS 0123'), 'rimi vilnius');
  assert.equal(merchantKey('UAB Maxima LT, X'), 'maxima lt x');
  assert.equal(merchantKey('SQ *COFFEE ISLAND #44'), 'coffee island');
  assert.equal(merchantKey('PAYPAL *NETFLIX'), 'netflix');
  assert.equal(tidyMerchant('RIMI VILNIUS'), 'Rimi Vilnius');
  assert.equal(tidyMerchant('Bolt Food'), 'Bolt Food');
  const rules = {};
  learn(rules, 'Rimi Vilnius', 'groceries');
  assert.equal(categoryFor(rules, 'RIMI VILNIUS 0123'), 'groceries');
  assert.equal(categoryFor(rules, 'Rimi Hyper Ozas'), 'groceries', 'other branches match on the first word');
  assert.equal(categoryFor(rules, 'Lidl'), null);
});

test('turns inbox items into expenses: known shops filed, new ones flagged, refunds and doubles skipped', () => {
  let n = 0;
  const uid = (p) => `${p}${++n}`;
  const rules = {};
  learn(rules, 'Rimi', 'groceries');
  const items = [
    { id: 'a1', amount: '€23.40', merchant: 'RIMI VILNIUS', card: 'Revolut', receivedAt: '2026-11-25T08:10:00Z' },
    { id: 'a2', amount: '€23.40', merchant: 'RIMI VILNIUS', card: 'Revolut', receivedAt: '2026-11-25T08:10:40Z' }, // fired twice
    { id: 'a3', amount: '3,20 €', merchant: 'Caffeine', receivedAt: '2026-11-25T21:59:00Z' }, // 23:59 in Vilnius
    { id: 'a4', amount: '-€10.00', merchant: 'Zara', receivedAt: '2026-11-25T12:00:00Z' },
    { id: 'a5', amount: '$15.00', merchant: 'Apple', receivedAt: '2026-11-25T12:00:00Z' },
  ];
  const res = inboxToExpenses(items, { main: 'EUR', rules, uid, rate: (c) => (c === 'USD' ? 0.92 : null) });
  assert.deepEqual(res.done, ['a1', 'a2', 'a4', 'a5', 'a3']);
  assert.equal(res.duplicates, 1);
  assert.equal(res.refunds, 1);
  assert.deepEqual(res.expenses.map((e) => [e.note, e.amount, e.currency, e.baseAmount, e.category, e.needsReview, e.date]), [
    ['Rimi Vilnius', 23.4, 'EUR', 23.4, 'groceries', false, '2026-11-25'],
    ['Apple', 15, 'USD', 13.8, 'other', true, '2026-11-25'],
    ['Caffeine', 3.2, 'EUR', 3.2, 'other', true, '2026-11-25'],
  ]);
  // Items already added (same inbox id) are not added again.
  const again = inboxToExpenses(items.slice(0, 1), { main: 'EUR', rules, uid, existing: res.expenses });
  assert.equal(again.expenses.length, 0);
});

test('store: editing or checking a payment teaches the shop', async () => {
  resetStorage();
  const store = await import('../js/store.js');
  store.load();
  store.update((s) => {
    s.expenses.push(
      { id: 'p1', amount: 4, currency: 'EUR', baseAmount: 4, category: 'other', note: 'Caffeine', date: '2026-11-24', source: 'applepay', needsReview: true, createdAt: 'x' },
      { id: 'p2', amount: 3, currency: 'EUR', baseAmount: 3, category: 'other', note: 'CAFFEINE', date: '2026-11-25', source: 'applepay', needsReview: true, createdAt: 'y' },
      { id: 'p3', amount: 50, currency: 'EUR', baseAmount: 50, category: 'other', note: 'Lidl', date: '2026-11-25', source: 'applepay', needsReview: true, createdAt: 'z' },
    );
  });
  assert.equal(store.reviewCount(), 3);
  const also = store.reviewPayments([{ id: 'p1', category: 'dining' }]);
  assert.equal(also, 1, 'the other Caffeine payment is filed too');
  assert.equal(store.reviewCount(), 1);
  assert.equal(store.getState().merchantRules.caffeine, 'dining');
  store.saveExpense({ ...store.getState().expenses.find((e) => e.id === 'p3'), category: 'groceries' });
  assert.equal(store.reviewCount(), 0);
  assert.equal(store.getState().merchantRules.lidl, 'groceries');
});

test('saved state from before this version still loads with the new fields', async () => {
  resetStorage();
  localStorage.setItem('ledger.v1', JSON.stringify({ version: 1, settings: { currency: 'EUR', push: { url: 'https://x', deviceId: 'abc', secret: 's', enabled: true } }, expenses: [], bills: [], trips: [], tripExpenses: [] }));
  const store = await import('../js/store.js?v=old');
  const { state } = store.load();
  assert.deepEqual(state.merchantRules, {});
  assert.equal(state.settings.applePay.enabled, false);
  assert.equal(state.settings.cloudBackup.enabled, false);
  assert.equal(state.settings.push.deviceId, 'abc', 'existing settings are kept');
});

test('backup: passphrase gives the same key and place every time; wrong passphrase cannot open it', async () => {
  const a = await deriveKeys('correct horse battery', 1000);
  const b = await deriveKeys('correct horse battery', 1000);
  const c = await deriveKeys('correct horse batterz', 1000);
  assert.deepEqual(a, b);
  assert.notEqual(a.backupId, c.backupId);
  assert.match(a.backupId, /^[a-f0-9]{64}$/);
  const state = { settings: { currency: 'EUR', push: { deviceId: 'd1', secret: 's', enabled: true, url: 'https://p' } }, expenses: [{ id: 'e1', amount: 9.5, note: 'Secret shop' }], notified: { x: 1 } };
  const blob = await encryptJSON(backupPayload(state), a.keyRaw);
  assert.ok(!blob.data.includes('Secret'), 'ciphertext only');
  assert.notEqual((await encryptJSON(state, a.keyRaw)).iv, blob.iv, 'fresh IV each time');
  const back = await decryptJSON(blob, a.keyRaw);
  assert.equal(back.expenses[0].note, 'Secret shop');
  assert.equal(back.notified, undefined);
  await assert.rejects(decryptJSON(blob, c.keyRaw), /does not open/);
  const restored = restoredState(back, { enabled: true, keyRaw: a.keyRaw });
  assert.equal(restored.settings.push.enabled, false, 'the new phone reconnects notifications itself');
  assert.equal(restored.settings.push.deviceId, 'd1');
  assert.deepEqual(restored.notified, {});
});

test('backup: large data encrypts without hitting stack limits', async () => {
  const k = await deriveKeys('a long enough passphrase', 1000);
  const big = { expenses: Array.from({ length: 20000 }, (_, i) => ({ id: `e${i}`, amount: i, note: 'Groceries at the shop' })) };
  const blob = await encryptJSON(big, k.keyRaw);
  assert.equal((await decryptJSON(blob, k.keyRaw)).expenses.length, 20000);
});

test('backup fingerprint ignores phone-only settings', () => {
  const s = { expenses: [{ id: 1 }], bills: [], trips: [], tripExpenses: [], categories: [], merchantRules: {}, settings: { currency: 'EUR', push: { lastSync: 'a' } } };
  const h = dataHash(s);
  assert.equal(dataHash({ ...s, settings: { currency: 'EUR', push: { lastSync: 'b' } } }), h);
  assert.notEqual(dataHash({ ...s, expenses: [{ id: 2 }] }), h);
});
