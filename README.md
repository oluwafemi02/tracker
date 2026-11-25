# Tracker

A personal expense tracker built as an iPhone home-screen web app. Log spending in
a few seconds, keep every regular bill on a schedule with reminders, and track trips
in any currency with a shared-cost split.

Live: https://oluwafemi02.github.io/tracker/

## What it does

- **Home** shows what is safe to spend this month after the bills still to come, a
  strip of the month with today and each bill's due date, bills that need paying,
  what is coming up, and recent spending.
- **Bills** keeps rent, subscriptions, phone, loans and so on. Each bill has a next
  due date, a repeat rule and a reminder. One tap on **Paid** logs the payment and
  moves the bill to its next date (with Undo). Bills on direct debit can be set to
  **Paid automatically** and are logged on their due date.
- **Activity** lists spending by month with search, a category breakdown and a
  six-month trend against your budget.
- **Trips** have their own budget and currency, a per-day figure, category
  breakdown, and "who owes whom" when costs are shared. A trip expense can also
  count towards the monthly budget.
- **Settings** has reminders, budget and currency, theme, categories, and backup,
  restore and CSV export.

- **Apple Pay logging**: an iPhone Shortcut sends each Apple Pay payment to the push
  server; the app adds them the next time it opens and remembers each shop's category.
- **Cloud backup**: an encrypted copy on the push server, restorable on a new phone
  with just your passphrase.

Data lives on the phone (localStorage), with the optional encrypted cloud backup.

## Reminders on iPhone

iPhone home-screen web apps cannot run in the background. That is why the old
version never reminded you: it used timers and `new Notification()`, which only run
while the app is open (and `new Notification()` does not work on iOS at all).

The app now uses three layers:

1. **In the app**: an app-icon badge with the number of bills to pay, a summary
   notification when you open the app on a due day, and the Needs paying list.
2. **iPhone Calendar** (no setup): Settings, Reminders, **Add bills to calendar**
   exports every bill as a repeating event with alerts before and on the due day.
   The app tells you when bills changed so you can export again.
3. **Push notifications** (one-time setup): a free Cloudflare Worker in
   [`push-worker/`](push-worker/README.md) sends real lock-screen alerts on schedule.
   Once connected it also offers a calendar subscription that stays in sync.

Notifications need iOS 16.4 or later and the app opened from the home screen.

## Install on iPhone

1. Open the live link in Safari.
2. Share, **Add to Home Screen**.
3. Open Tracker from the home screen, then Settings, Reminders, **Turn on notifications**.

## Upgrading from the old version

The first time the new version opens, it imports everything from the old app on
that phone: expenses, recurring expenses (now Bills), trips, trip expenses, custom
categories, budget and currency. The old data is left untouched, and Settings has
**Import again from the old version** if you ever need it.

During the import:

- Bills are moved to their next due date from today. Payments missed during the
  months the app was not used are not back-filled (you can log any you need).
- Duplicate recurring templates created by an old bug are merged.
- Trip expenses that were copied into the monthly list now live on the trip only,
  marked to count in the monthly budget, so nothing is counted twice.
- Budget rollover / reserve fund, premium, analytics and the language switcher
  were removed.

## Development

No build step. Plain ES modules served as static files.

```bash
npm run serve        # http://localhost:8080 (open /index.html)
npm run check        # syntax check, unit tests, offline file list
cd push-worker && npm install && npm test
```

Deploys to GitHub Pages on every push to `main` (`.github/workflows/deploy.yml`).
See [CLAUDE.md](CLAUDE.md) for the code map and conventions.
