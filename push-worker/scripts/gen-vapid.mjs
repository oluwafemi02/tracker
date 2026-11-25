// Creates a new VAPID key pair.
//   node scripts/gen-vapid.mjs            prints both keys for copy and paste
//   node scripts/gen-vapid.mjs --out DIR  writes public.txt and private.json (used by the deploy workflow)
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateVapidKeys } from '../src/webpush.js';

const { publicKey, privateJwk } = await generateVapidKeys();
const i = process.argv.indexOf('--out');
if (i > 0) {
  const dir = process.argv[i + 1];
  writeFileSync(join(dir, 'public.txt'), publicKey);
  writeFileSync(join(dir, 'private.json'), JSON.stringify(privateJwk), { mode: 0o600 });
  console.log('Keys written');
} else {
  console.log('VAPID_PUBLIC_KEY (paste when wrangler asks):\n' + publicKey + '\n');
  console.log('VAPID_PRIVATE_JWK (paste when wrangler asks, keep it secret):\n' + JSON.stringify(privateJwk) + '\n');
}
