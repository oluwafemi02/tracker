// Prints a new VAPID key pair. Run: node scripts/gen-vapid.mjs
import { generateVapidKeys } from '../src/webpush.js';

const { publicKey, privateJwk } = await generateVapidKeys();
console.log('VAPID_PUBLIC_KEY (paste when wrangler asks):\n' + publicKey + '\n');
console.log('VAPID_PRIVATE_JWK (paste when wrangler asks, keep it secret):\n' + JSON.stringify(privateJwk) + '\n');
