# Tracker: notes for Claude

Personal expense tracker for one person (Femi), used mostly on an iPhone as a
home-screen web app (PWA). Hosted on GitHub Pages at `/tracker/`. Rebuilt from
scratch in v1.0.0 (Nov 2026); the old 21,000-line `index.html` is in git history.

## Priorities

1. Logging an expense or marking a bill paid must take seconds, one hand, on a phone.
2. Bill reminders must actually reach the user on iOS (see Reminders below).
3. Never lose data. All data lives in the phone's localStorage.

## Code map

No build step, no framework, no runtime dependencies (Playwright is a dev dependency for tests only). ES modules loaded by `index.html`.

| File | Role |
| --- | --- |
| `js/app.js` | Entry: hash routing (`#home`, `#activity`, `#bills`, `#trips`, `#trip/<id>`, `#settings/<section>`), action handlers, resume/lifecycle, deep links (`?bill=<id>`, `?tab=`, `?add=1`) |
| `js/store.js` | State in localStorage key `ledger.v1`, subscribers, all domain logic (bills, autopay, month summary, trips, settle-up) |
| `js/migrate.js` | Pure import from the old app's keys (`familyExpenses`, `recurringExpenses`, `trips`, `travelExpenses`, ...) |
| `js/recover.js` | Settings, Find lost trips: scans every stored key, "(Trip: name)" copies in monthly spending, and old backup / trip CSV files; adds only |
| `js/dates.js` | Local `YYYY-MM-DD` date helpers and recurrence |
| `js/money.js` | Currency formatting, exchange rates (frankfurter ECB API, cached in `ledger.rates`) |
| `js/categories.js` | Default spend and trip categories, matching |
| `js/reminders.js` | Badge, local notification on open, reminder schedule for push, calendar export |
| `js/ics.js` | `.ics` builder shared with the push worker |
| `js/push.js` | Client for the push worker: reminders sync, Apple Pay inbox fetch, encrypted backup upload/restore |
| `js/applepay.js` | Parses Wallet Shortcut amounts, remembers shop categories (`merchantRules`), turns inbox items into expenses |
| `js/backup.js` | Passphrase key derivation (PBKDF2 600k), AES-GCM encrypt/decrypt, restore helpers |
| `js/ui.js` | Escaping, bottom sheets, toasts, delegated `data-action` clicks |
| `js/forms.js` | Sheets: expense, bill, pay bill, trip, trip expense, new category |
| `js/views-*.js` | Screens. Each returns an HTML string; `app.js` re-renders on any state change |
| `sw.js` | Offline cache (network first), push display, notification taps |
| `push-worker/` | Cloudflare Worker + KV + cron that sends Web Push (RFC 8291/8292 with WebCrypto) |
| `test/` | `node:test` unit tests incl. a legacy data fixture |
| `e2e/` | Playwright end-to-end tests (WebKit and Chromium at iPhone size, fixed clock, seeded storage). `helpers.js` has `boot()`, `state()`, `setClock()` |

## Data model (`ledger.v1`)

- `settings`: currency, monthlyBudget, theme, remindDays, remindTime, hideAmountsInPush, push {url, deviceId, secret, enabled, lastSync, lastError}, calendarExportedHash, migratedAt, lastBackupAt, applePay {enabled, token, lastFetch, lastError}, cloudBackup {enabled, keyRaw, backupId, lastAt, lastHash, lastError}
- `expenses[]`: {id, amount, currency, baseAmount (main currency), category, note, date, billId?, person, createdAt, source? ('applepay'), inboxId?, card?, needsReview?}
- `merchantRules`: {shopKey: categoryId, '*firstword': categoryId}
- `bills[]`: {id, name, amount, currency, category, frequency (weekly|biweekly|monthly|quarterly|semiannual|yearly|once), anchorDay, startDate, nextDue, endDate, remindDays, autopay, active, notes, history[{due, paidOn, expenseId, amount} | {due, skipped}]}
- `trips[]`: {id, name, destination, startDate, endDate, budget, currency, people[], countInMonthly, closed}
- `tripExpenses[]`: {id, tripId, amount, currency, tripAmount (trip currency), baseAmount (main currency), category (t-*), note, date, payer, split, countInMonthly}
- `categories[]`: {id, name, icon, kind, custom?, aliases?}

Month "spent" = expenses in the month + trip expenses with `countInMonthly`.
"Left to spend" = budget - spent - bill occurrences still due this month (including overdue).

## Rules

- Calendar dates are local `YYYY-MM-DD` strings. Never use `toISOString()` for a
  calendar date (it shifts the day in Vilnius). Use `dates.js`.
- Monthly bills keep `anchorDay` so 31st stays the 31st (clamped in short months).
- Never delete or modify the old app's localStorage keys. They are the fallback.
- Any change to the stored shape must keep old saved state loading (`deepMerge` with defaults) and come with a test.
- When adding a file under `js/`, add it to `SHELL` in `sw.js` (`npm run check` fails otherwise).
- Do not add frameworks, bundlers or CDN scripts. The CSP in `index.html` blocks external scripts.
- iOS constraints: no background timers, no `new Notification()` (use `registration.showNotification`), notifications only in the installed app, permission must come from a tap. Inputs need font-size 16px or more to avoid zoom.
- UI copy: plain English, sentence case, short. Buttons say what they do ("Mark as paid", "Add bill"). No em dashes.
- Run `npm run check` (and `cd push-worker && npm test` if the worker changed) before committing.
- UI changes: run `npm run test:e2e` (Playwright, iPhone size). Add or update a spec in `e2e/` for any new behaviour. `npm run test:e2e:live` runs the same suite against the live site.

## Reminders

1. In-app: badge (`navigator.setAppBadge`), one summary notification per day when opened, Needs paying list.
2. Calendar export: repeating VEVENTs with VALARMs (`js/ics.js`).
3. Push worker: the phone sends `reminderSchedule()` (100 days) on every change and on open; cron every 15 min sends due items. Optional webcal feed at `/cal/<id>.ics`.

## Apple Pay logging and cloud backup

- A Wallet "Transaction" Shortcut automation POSTs {amount, merchant, card} to `/in/<deviceId>/<token>` (write-only). The app fetches `/inbox` on every open, adds the payments, then acks them. Unknown shops get `needsReview` and show on Home as "to check".
- Cloud backup: passphrase -> PBKDF2 -> AES key + backup id. Ciphertext only on the server (`PUT/GET /backup/<id>`, latest + previous). Auto backup on open, at most daily, only when `dataHash` changed. Restore needs only the passphrase.
- The push server deploys from `.github/workflows/push-server.yml` (secrets CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID). Live at https://tracker-push.femisteve02.workers.dev

## Design

Calm "pocket ledger": cool paper `#eef2f0`, ink `#17212b`, pine `#1e6b57` (primary),
marigold `#c9830f` (due soon), brick `#bf3b34` (overdue). Bricolage Grotesque
(self-hosted in `fonts/`) for titles and big amounts, system font for everything else.
The month strip on Home is the signature element; keep the rest quiet.
