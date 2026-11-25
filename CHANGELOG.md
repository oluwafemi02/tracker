# Changelog

## 1.4.0 (2026-11-25)
- Accounts: add the bank accounts and cards your bills are paid from, in any currency.
- Every bill has a "Paid from" account; a sheet assigns accounts to existing bills in one go.
- Bills, By account: how much each account needs per month, by category, with "Have by" dates, what is already paid, and usual everyday spending as a note.
- Transfer reminder: a push and a Home card before each account's first bill of the month ("Move €1,524 to Swedbank by 7 Dec"), 2 days before by default.
- Apple Pay payments are matched to accounts by card name; expenses can be marked "Paid with".

## 1.3.0 (2026-11-25)
- Bills ask first whether they repeat or are paid once.
- Repeating bills end never, on a date, or after a number of payments, with a live summary ("12 payments left, last on 10 Oct 2027").
- Bill list and details show one-time bills and payments left.
- Version number shown in Settings; a short message after each update.

## 1.2.0 (2026-11-25)
- Apple Pay logging through an iPhone Shortcut, with shop categories remembered.
- Encrypted cloud backup on the push server, restorable with a passphrase.
- Push server deploys from GitHub Actions.

## 1.1.0 (2026-11-25)
- Find lost trips: old storage, monthly copies, old backups and trip CSV files.
- Old-app backups accepted by Restore; early trips recovered in euros.
- Fixes found by the new end-to-end tests (rate rounding, currency picker zoom, date fields overflowing, month arrow).

## 1.0.0 (2026-11-25)
- Rebuilt app: bills with reminders that reach the iPhone, new design, trips, import from the old version.
