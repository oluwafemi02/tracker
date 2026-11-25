# Push server for Tracker

A tiny Cloudflare Worker that sends bill reminders to your iPhone as real push
notifications, even when the app is closed. The free plan is enough.

What it stores per phone: the push subscription, the reminder schedule (bill name,
amount unless you hide it in the app, and when to alert), and a list of active bills
for the optional calendar feed. Nothing else leaves your phone.

## One-time setup (about 5 minutes, no command line)

GitHub deploys the server for you (`.github/workflows/push-server.yml`). It creates
the storage and the signing keys in your Cloudflare account; the private key never
leaves Cloudflare.

1. **Cloudflare account**: sign up free at https://dash.cloudflare.com/sign-up, then
   open **Workers & Pages** once so Cloudflare creates your `workers.dev` address.
2. **Account ID**: on the Workers & Pages page, copy the **Account ID** shown on the right
   (or from the URL `dash.cloudflare.com/<account id>/...`).
3. **API token**: profile icon, **My Profile**, **API Tokens**, **Create Token**, use the
   **Edit Cloudflare Workers** template. Under Account Resources pick your account,
   under Zone Resources pick **All zones**. Create it and copy the token.
4. **Give them to GitHub**: in the repo, **Settings**, **Secrets and variables**,
   **Actions**, **New repository secret**, twice:
   - `CLOUDFLARE_ACCOUNT_ID` = the account ID
   - `CLOUDFLARE_API_TOKEN` = the token
5. **Deploy**: repo **Actions** tab, **Deploy push server**, **Run workflow**. When it
   finishes, its summary shows the server address, e.g.
   `https://tracker-push.<you>.workers.dev`.

Later changes to `push-worker/` deploy automatically.

### By hand instead (needs Node.js 20+)

```bash
cd push-worker && npm install && npx wrangler login
npx wrangler kv namespace create DEVICES   # put the id in wrangler.toml
npm run keys                               # then:
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_JWK
npm run deploy
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
