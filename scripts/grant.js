'use strict';
// Owner-only: give items to a player. Runs with the Firebase service account, so only whoever
// holds that key can use it. Usage:
//   FIREBASE_SERVICE_ACCOUNT="$(cat key.json)" node scripts/grant.js <username> <count> [rarity|itemId]
// Examples:  node scripts/grant.js CoolKid 25 Godly      node scripts/grant.js CoolKid 1 g13
const admin = require('firebase-admin');
const Sim = require('../shared/sim.js');

const [name, countArg, what = 'Godly'] = process.argv.slice(2);
const count = parseInt(countArg, 10);
if (!name || !(count > 0 && count <= 500)) { console.error('Usage: node scripts/grant.js <username> <count 1-500> [rarity|itemId]'); process.exit(1); }
const pool = Sim.ITEM[what] ? [Sim.ITEM[what]] : Sim.ITEMS.filter(i => !i.nodrop && !i.exclusive && i.r.toLowerCase() === what.toLowerCase());
if (!pool.length) { console.error(`Unknown rarity or item "${what}". Rarities: ${Sim.RORDER.join(', ')}`); process.exit(1); }

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) { console.error('Set FIREBASE_SERVICE_ACCOUNT (the service account JSON or its base64).'); process.exit(1); }
const sa = JSON.parse(raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

(async () => {
  const n = await db.collection('usernames').doc(name.toLowerCase()).get();
  if (!n.exists) { console.error(`No player named "${name}".`); process.exit(1); }
  const ref = db.collection('users').doc(n.data().uid);
  const given = await db.runTransaction(async tx => {
    const p = (await tx.get(ref)).data();
    if (p.inv.length + count > 500) throw new Error(`That would put ${name} over the 500 item limit.`);
    const out = [];
    for (let i = 0; i < count; i++) { const it = pool[Math.floor(Math.random() * pool.length)]; p.inv.push({ u: p.nextUid++, id: it.id }); out.push(it.name); }
    tx.set(ref, p);
    return out;
  });
  console.log(`Gave ${name}: ${given.join(', ')}`);
  console.log('They will see them next time they log in.');
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
