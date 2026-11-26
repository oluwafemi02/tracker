# Changelog

## 1.6.0 (2026-11-26)
- Monthly summary: on the 1st, a push with last month's total, how it compares with the budget, and the category that changed most ("Groceries up 18% on October"). Also on Home for the first week. Can be turned off in Reminders.
- Category limits: set a monthly limit per category. An alert shows at 80% and again when you go over, Home lists categories close to their limit, and Activity shows each bar against its limit.
- Price changes: paying a fixed bill a different amount asks whether the price changed, and updates the bill so reminders show the new amount. The bill shows when the price last changed.
- Trip savings: set a savings target for an upcoming trip, log what you put aside, and see progress on the trip card. Optional monthly "Put aside €X" push and Home card with a Done button.
- The push server sends the monthly summary on its own instead of folding it into a batch of bill reminders.

## 1.5.0 (2026-11-26)
- Bills can be marked "Amount changes each time" (electricity, water). The app uses the average of the last 3 payments as the estimate everywhere, and Paid asks for the real amount, filled in with last time's.
- Changing bills paid automatically are logged at the estimate and shown on Home to confirm the real amount.
- Close the month: in Activity, enter what you really spent and the difference is added as one "Unlogged spending" entry. It updates instead of adding a second one, and can be removed.

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
