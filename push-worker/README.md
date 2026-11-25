# Push server for Tracker

A tiny Cloudflare Worker that sends bill reminders to your iPhone as real push
notifications, even when the app is closed. Free plan is enough.

What it stores per phone: the push subscription, the reminder schedule (bill name,
amount unless you hide it in the app, and when to alert), and a list of active bills
for the optional calendar feed. Nothing else leaves your phone.

## One-time setup (about 10 minutes)

You need Node.js 20+ and a free Cloudflare account.

```bash
cd push-worker
npm install
npx wrangler login

# 1. Storage
npx wrangler kv namespace create DEVICES
#    Copy the id it prints into wrangler.toml (kv_namespaces.id)

# 2. Edit wrangler.toml
#    VAPID_SUBJECT  = "mailto:your-email"   (Apple requires a real contact)
#    ALLOWED_ORIGIN = where the app is hosted, e.g. https://oluwafemi02.github.io

# 3. Keys for signing pushes
npm run keys
npx wrangler secret put VAPID_PUBLIC_KEY     # paste the first value
npx wrangler secret put VAPID_PRIVATE_JWK    # paste the second value (the JSON)

# 4. Deploy
npm run deploy
#    Note the URL, e.g. https://tracker-push.<you>.workers.dev
```

## Connect the app

1. Install Tracker on the iPhone home screen (Safari, Share, Add to Home Screen).
2. Open it from the home screen, go to Settings, Reminders.
3. Tap **Turn on notifications** and allow.
4. Paste the worker URL under Push notifications and tap **Connect**.
5. Tap **Send test push**. Lock the phone; it should arrive within seconds.

Reminders are checked every 15 minutes, so an alert set for 09:00 arrives
between 09:00 and 09:15.

## Good to know

- The app re-sends its schedule whenever bills change and each time you open it.
  The schedule covers the next 100 days, so reminders keep coming even if you do
  not open the app for a while.
- If you delete and re-add the app to the home screen, connect again (iOS gives
  the new install a new push subscription).
- `MAX_DEVICES` (default 5) stops strangers from registering on your server.
- `npm run logs` streams live logs. `npm test` runs the encryption and route tests.
- Never commit the private key. It only lives in Cloudflare secrets.

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/vapid` | Public key for subscribing |
| POST | `/register` | Save a phone's push subscription |
| POST | `/sync` | Replace the reminder schedule and bill list |
| POST | `/test` | Send a test push now |
| DELETE | `/device` | Forget this phone |
| GET | `/cal/<id>.ics?k=<secret>` | Calendar feed of bills (webcal subscription) |

POST and DELETE need `Authorization: Bearer <secret>`; the app creates the secret.
