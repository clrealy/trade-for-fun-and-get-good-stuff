'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Sim = require('../shared/sim.js');
const Eco = require('../server/economy.js');
const { defaultProfile } = require('../server/store.js');

test('bot-only rounds always finish with a winner', () => {
  for (let i = 0; i < 5; i++) {
    const R = Sim.createRound({ players: [] });
    for (let n = 0; n < 6000 && R.phase !== 'end'; n++) Sim.step(R, 1 / 30);
    assert.ok(['innocents', 'murderer'].includes(R.winner));
  }
});

test('players cannot move faster than allowed (teleport/speed hacks)', () => {
  const R = Sim.createRound({ mapIdx: 1, players: [{ pid: 'a', name: 'a' }] });
  R.phase = 'play';
  const e = R.ents[0]; e.x = 6 * 48 + 24; e.y = 7 * 48; const x0 = e.x;
  for (let i = 0; i < 30; i++) { Sim.setInput(R, e.id, { x: e.x + 1000, y: e.y, a: 0 }); Sim.step(R, 1 / 30); }
  assert.ok(e.x - x0 <= Sim.PLAYER_SPEED * 1.2, `moved ${e.x - x0}px in 1s`);
});

test('snapshots never reveal other players roles', () => {
  const R = Sim.createRound({ players: [{ pid: 'a', name: 'a' }] });
  const me = R.ents[0];
  const s = JSON.stringify(Sim.snapshotFor(R, me.id));
  const others = R.ents.filter(e => e !== me).map(e => e.role);
  if (me.role !== 'murderer') assert.ok(!s.includes('murderer'), 'murderer leaked');
  if (me.role !== 'sheriff') assert.ok(!s.includes('sheriff'), 'sheriff leaked');
  assert.ok(others.length === 11);
});

test('crates cost coins and cannot overspend', () => {
  const p = defaultProfile('t'); p.coins = 100;
  Eco.openCrate(p, 'knifebox');
  assert.strictEqual(p.coins, 40); assert.strictEqual(p.inv.length, 1);
  assert.throws(() => Eco.openCrate(p, 'knifebox'), /Not enough coins/);
  assert.throws(() => Eco.openCrate(p, 'nope'), /Unknown crate/);
});

test('trades validate ownership and swap items', () => {
  const p = defaultProfile('t');
  const trader = { name: 'bot', inv: [{ u: 1, id: 'k1' }], greed: 1, nextU: 100 };
  assert.throws(() => Eco.trade(p, trader, [999], []), /no longer have/);
  p.inv.push({ u: 5, id: 'k13' }); p.nextUid = 6; p.equip.knife = 5;
  const r = Eco.trade(p, trader, [5], [1]);
  assert.ok(r.ok);
  assert.deepStrictEqual(p.inv.map(i => i.id), ['k1']);
  assert.strictEqual(p.equip.knife, null);
  assert.ok(trader.inv.some(i => i.id === 'k13'));
});

test('codes give their reward once per account', () => {
  const p = defaultProfile('t');
  const { inst } = Eco.redeem(p, ' godly26 ');
  assert.strictEqual(Sim.ITEM[inst.id].r, 'Godly');
  const c0 = p.coins; assert.deepStrictEqual(Eco.redeem(p, 'freecash'), { coins: 500 }); assert.strictEqual(p.coins, c0 + 500);
  assert.strictEqual(Eco.redeem(p, 'CHROMA4LIFE').inst.id, 'g13');
  const c1 = p.coins; assert.deepStrictEqual(Eco.redeem(p, 'millionaire'), { coins: 1000000 }); assert.strictEqual(p.coins, c1 + 1000000);
  assert.throws(() => Eco.redeem(p, 'GODLY26'), /already used/);
  assert.strictEqual(Eco.redeem(p, 'gimmeall').all.length, Sim.ITEMS.filter(i => !i.nodrop).length);
  assert.deepStrictEqual(Eco.redeem(p, 'memeset').items, ['k20', 'g15']);
  assert.strictEqual(Sim.ITEM.k20.val, 69420);
  assert.deepStrictEqual(Eco.redeem(p, 'c memeset').items, ['k21', 'g17']);
  assert.ok(Sim.ITEM.g17.noCooldown && Sim.ITEM.k21.r === 'Chroma');
  assert.deepStrictEqual(Eco.redeem(p, 'cngs').items, ['k22', 'k23']);
  assert.throws(() => Eco.redeem(p, 'FAKECODE'), /doesn't exist/);
  assert.throws(() => Eco.redeem(p, '__proto__'), /doesn't exist/);
});

test('no-cooldown skins skip the reload timer', () => {
  const R = Sim.createRound({ players: [{ pid: 'a', name: 'a', gun: 'g14' }, { pid: 'b', name: 'b', gun: 'g1' }], fillBots: false });
  R.phase = 'play';
  for (const e of R.ents) { e.role = 'sheriff'; e.hasGun = true; Sim.setInput(R, e.id, { x: e.x, y: e.y, a: 0, atk: true }); }
  Sim.step(R, 1 / 30);
  const [fastE, slowE] = R.ents;
  assert.ok(fastE.atkCd < 0.2, `ginger scope cooldown ${fastE.atkCd}`);
  assert.ok(slowE.atkCd > 2, `normal gun cooldown ${slowE.atkCd}`);
});

test('/sheffeme gives the gun, but not to the murderer', () => {
  const R = Sim.createRound({ players: [{ pid: 'a', name: 'a' }] });
  R.phase = 'play';
  const inn = R.ents.find(e => e.role === 'innocent'), m = R.murderer;
  assert.match(Sim.cheat(R, inn.id, '/sheffeme'), /got the gun/);
  assert.ok(inn.hasGun); assert.strictEqual(inn.role, 'sheriff');
  // murderer uses it: gets the gun, loses the knife, and a new murderer is picked
  const sher = inn;
  assert.match(Sim.cheat(R, m.id, '/SheffEme'), /knife is gone/);
  assert.ok(m.hasGun); assert.strictEqual(m.role, 'sheriff');
  assert.ok(!sher.hasGun, 'old gun holder lost the gun'); assert.strictEqual(sher.role, 'innocent');
  assert.notStrictEqual(R.murderer, m); assert.strictEqual(R.murderer.role, 'murderer');
  assert.strictEqual(R.ents.filter(e => e.hasGun).length, 1); assert.strictEqual(R.gunDrop, null);
  assert.match(Sim.cheat(R, inn.id, '/nope'), /Unknown/);
});

test('/murdme, /speed and /whoisit work', () => {
  const R = Sim.createRound({ players: [{ pid: 'a', name: 'a' }] });
  R.phase = 'play';
  const me = R.ents.find(e => e.role === 'innocent'), old = R.murderer;
  assert.match(Sim.cheat(R, me.id, '/whoisit'), new RegExp(old.name));
  assert.match(Sim.cheat(R, me.id, '/murdme'), /murderer now/);
  assert.strictEqual(R.murderer, me); assert.strictEqual(old.role, 'innocent');
  const gh = R.ents.find(e => e.hasGun && e !== me);
  Sim.cheat(R, gh.id, '/murdme'); assert.ok(!gh.hasGun); assert.strictEqual(R.gunDrop, null, 'gun is gone, not dropped');
  assert.strictEqual(me.role, 'innocent');
  const s0 = me.speed; Sim.cheat(R, me.id, '/speed'); assert.ok(me.speed > s0); Sim.cheat(R, me.id, '/speed'); assert.strictEqual(me.speed, s0);
});

test('a round survives save and restore', () => {
  const R = Sim.createRound({ players: [{ pid: 'a', name: 'a' }] });
  for (let i = 0; i < 900; i++) Sim.step(R, 1 / 30);
  const R2 = Sim.restoreRound(Sim.serializeRound(R));
  assert.strictEqual(R2.ents.length, 12); assert.strictEqual(R2.murderer.id, R.murderer.id);
  for (let n = 0; n < 6000 && R2.phase !== 'end'; n++) Sim.step(R2, 1 / 30);
  assert.ok(R2.winner);
});

test('/r brings you back', () => {
  const R = Sim.createRound({ players: [{ pid: 'a', name: 'a' }] });
  R.phase = 'play';
  const me = R.ents.find(e => e.role === 'innocent');
  assert.match(Sim.cheat(R, me.id, '/r'), /already alive/);
  me.alive = false; R.bodies.push({ id: me.id, x: me.x, y: me.y, a: 0 });
  assert.match(Sim.cheat(R, me.id, '/speed'), /Try \/r/);
  assert.match(Sim.cheat(R, me.id, '/r'), /back/);
  assert.ok(me.alive); assert.ok(!R.bodies.some(b => b.id === me.id));
});

test('ginger scopes shoot farther', () => {
  const R = Sim.createRound({ players: [{ pid: 'a', name: 'a', gun: 'g14' }, { pid: 'b', name: 'b', gun: 'g1' }], fillBots: false });
  R.phase = 'play';
  for (const e of R.ents) { e.role = 'sheriff'; e.hasGun = true; Sim.setInput(R, e.id, { x: e.x, y: e.y, a: 0, atk: true }); }
  Sim.step(R, 1 / 30);
  const lives = R.proj.map(p => [p.owner.gun, p.life]);
  const g = lives.find(l => l[0] === 'g14'), n = lives.find(l => l[0] === 'g1');
  if (g && n) assert.ok(g[1] > n[1] * 1.8);
  assert.ok(Sim.ITEM.g14.long && Sim.ITEM.g16.long);
});

test('/god stops you from dying', () => {
  const R = Sim.createRound({ players: [{ pid: 'a', name: 'a' }, { pid: 'b', name: 'b' }], fillBots: false });
  R.phase = 'play';
  const [me, m] = R.ents;
  me.role = 'innocent'; me.hasGun = false; m.role = 'murderer'; m.hasGun = false; R.murderer = m;
  const stab = () => { m.x = me.x + 20; m.y = me.y; m.atkCd = 0; Sim.setInput(R, m.id, { x: m.x, y: m.y, a: Math.PI, atk: true }); Sim.setInput(R, me.id, { x: me.x, y: me.y, a: 0 }); Sim.step(R, 1 / 30); };
  assert.match(Sim.cheat(R, me.id, '/god'), /on/);
  for (let i = 0; i < 10; i++) stab();
  assert.ok(me.alive, 'god mode player survived');
  assert.match(Sim.cheat(R, me.id, '/god'), /off/);
  stab();
  assert.ok(!me.alive, 'without god mode the stab lands');
});

test('summer event unlocks at 50 kills', () => {
  const p = defaultProfile('t');
  assert.throws(() => Eco.claimEvent(p), /50 more kills/);
  Eco.applyRoundResult(p, { role: 'murderer', won: true, alive: true, bag: 0, kills: 11 });
  assert.strictEqual(Eco.publicProfile(p).events[0].kills, 11);
  assert.throws(() => Eco.claimEvent(p), /39 more kills/);
  for (let i = 0; i < 4; i++) Eco.applyRoundResult(p, { role: 'murderer', won: true, alive: true, bag: 0, kills: 11 });
  assert.deepStrictEqual(Eco.claimEvent(p), ['k24', 'g18']);
  assert.throws(() => Eco.claimEvent(p), /already claimed/);
  assert.ok(Eco.publicProfile(p).events[0].claimed);
});

test('the Sum Box is the only place the Chroma summer items drop', () => {
  const sum = Sim.CRATES.find(c => c.id === 'sumbox');
  let special = 0, elsewhere = 0;
  for (let i = 0; i < 20000; i++) {
    if (['k25', 'g19'].includes(Sim.rollCrate(sum).id)) special++;
    for (const c of Sim.CRATES) if (c !== sum && ['k25', 'g19'].includes(Sim.rollCrate(c).id)) elsewhere++;
  }
  assert.ok(special > 700 && special < 1300, `sum box specials ${special}/20000`);
  assert.strictEqual(elsewhere, 0);
  const p = defaultProfile('t'); p.coins = 200; Eco.openCrate(p, 'sumbox'); assert.strictEqual(p.coins, 0);
});

test('halloween: Death Gun at 150 kills, knives only from the Halloween Box', () => {
  const p = defaultProfile('t');
  for (let i = 0; i < 13; i++) Eco.applyRoundResult(p, { role: 'murderer', won: true, alive: true, bag: 0, kills: 11 });
  assert.throws(() => Eco.claimEvent(p, 'halloween26'), /7 more kills/);
  assert.deepStrictEqual(Eco.claimEvent(p, 'summer26'), ['k24', 'g18']);
  Eco.applyRoundResult(p, { role: 'murderer', won: true, alive: true, bag: 0, kills: 11 });
  assert.deepStrictEqual(Eco.claimEvent(p, 'halloween26'), ['g20']);
  const box = Sim.CRATES.find(c => c.id === 'halloween');
  const n = { k26: 0, k27: 0 }, elsewhere = { k26: 0, k27: 0 };
  for (let i = 0; i < 20000; i++) {
    const id = Sim.rollCrate(box).id; if (id in n) n[id]++;
    for (const c of Sim.CRATES) if (c !== box) { const o = Sim.rollCrate(c).id; if (o in elsewhere) elsewhere[o]++; }
  }
  assert.ok(n.k26 > 1600 && n.k26 < 2400, `death knife ${n.k26}`);
  assert.ok(n.k27 > 250 && n.k27 < 550, `chroma death knife ${n.k27}`);
  assert.deepStrictEqual(elsewhere, { k26: 0, k27: 0 });
});

test('Raygun Set costs 3,999 coins, once, or the secret code', () => {
  const p = defaultProfile('t'); p.coins = 3998;
  assert.throws(() => Eco.buyBundle(p, 'raygun'), /Not enough coins/);
  p.coins = 5000;
  assert.deepStrictEqual(Eco.buyBundle(p, 'raygun'), ['g21', 'k28']);
  assert.strictEqual(p.coins, 1001);
  assert.throws(() => Eco.buyBundle(p, 'raygun'), /already have/);
  assert.ok(Eco.publicProfile(p).bundles[0].owned);
  const q = defaultProfile('q');
  assert.deepStrictEqual(Eco.redeem(q, 'zap zap boom 13').items, ['g21', 'k28']);
});

test('owner luck: 95% Death items from the Halloween Box, only when turned on', () => {
  const box = Sim.CRATES.find(c => c.id === 'halloween'), death = ['k26', 'g20', 'k27', 'g22'];
  let lucky = 0, normal = 0;
  for (let i = 0; i < 20000; i++) { if (death.includes(Sim.rollCrate(box, true).id)) lucky++; if (death.includes(Sim.rollCrate(box).id)) normal++; }
  assert.ok(lucky > 18700 && lucky < 19300, `lucky ${lucky}/20000`);
  assert.ok(normal > 3200 && normal < 4000, `normal ${normal}/20000`);
  const p = defaultProfile('me');
  assert.deepStrictEqual(Eco.redeem(p, 'deathluck95'), { luck: true });
  p.coins = 250 * 200; let got = 0;
  for (let i = 0; i < 200; i++) if (death.includes(Eco.openCrate(p, 'halloween').id)) got++;
  assert.ok(got > 170, `owner got ${got}/200`);
  const other = defaultProfile('them'); other.coins = 250 * 200; let theirs = 0;
  for (let i = 0; i < 200; i++) if (death.includes(Eco.openCrate(other, 'halloween').id)) theirs++;
  assert.ok(theirs < 70, `others got ${theirs}/200`);
});

test('the Raygun makes its own sound', () => {
  const R = Sim.createRound({ players: [{ pid: 'a', name: 'a', gun: 'g21' }, { pid: 'b', name: 'b', gun: 'g1' }], fillBots: false });
  R.phase = 'play';
  for (const e of R.ents) { e.role = 'sheriff'; e.hasGun = true; Sim.setInput(R, e.id, { x: e.x, y: e.y, a: 0, atk: true }); }
  Sim.step(R, 1 / 30);
  const sounds = Sim.drain(R).filter(ev => ev.t === 'sfx').map(ev => ev.s).sort();
  assert.deepStrictEqual(sounds, ['ray', 'shoot']);
  assert.ok(R.ents[0].atkCd < 0.2, 'raygun has no reload');
});

test('1v1: two players, one murderer and one sheriff, and the round finishes', () => {
  for (let i = 0; i < 10; i++) {
    const R = Sim.createRound({ mode: '1v1', players: [{ pid: 'a', name: 'a' }] });
    assert.strictEqual(R.ents.length, 2);
    assert.deepStrictEqual(R.ents.map(e => e.role).sort(), ['murderer', 'sheriff']);
    assert.strictEqual(R.time, 120);
    R.ents[0].human = false;
    for (let n = 0; n < 5000 && R.phase !== 'end'; n++) Sim.step(R, 1 / 30);
    assert.ok(R.winner);
  }
});

test('a murderer kill plays the kill sound and tells the killer', () => {
  const R = Sim.createRound({ players: [{ pid: 'a', name: 'a' }, { pid: 'b', name: 'b' }], fillBots: false });
  R.phase = 'play';
  const [m, v] = R.ents; m.role = 'murderer'; v.role = 'innocent'; v.hasGun = false; R.murderer = m;
  v.x = m.x + 20; v.y = m.y;
  Sim.setInput(R, m.id, { x: m.x, y: m.y, a: 0, atk: true }); Sim.setInput(R, v.id, { x: v.x, y: v.y, a: 0 });
  Sim.step(R, 1 / 30);
  const ev = Sim.drain(R);
  assert.ok(ev.some(e => e.t === 'sfx' && e.s === 'kill'));
  assert.ok(Sim.eventsFor(ev, m.id).some(e => e.t === 'killConfirm'));
  assert.ok(!Sim.eventsFor(ev, v.id).some(e => e.t === 'killConfirm'));
});

test('trophies unlock once and pay coins', () => {
  const p = defaultProfile('t');
  assert.deepStrictEqual(Eco.checkTrophies(p), []);
  Eco.applyRoundResult(p, { role: 'murderer', won: true, alive: true, bag: 0, kills: 1, mode: '1v1' });
  const c0 = p.coins;
  assert.deepStrictEqual(Eco.checkTrophies(p), ['blood1']);
  assert.strictEqual(p.coins, c0 + 50);
  assert.deepStrictEqual(Eco.checkTrophies(p), [], 'no double unlock');
  for (let i = 0; i < 9; i++) Eco.applyRoundResult(p, { role: 'murderer', won: true, alive: true, bag: 0, kills: 0, mode: '1v1' });
  const got = Eco.checkTrophies(p);
  assert.ok(got.includes('play1') && got.includes('win1') && got.includes('duel1'), got.join());
  const pub = Eco.publicProfile(p).trophies;
  assert.strictEqual(pub.length, Eco.TROPHIES.length);
  assert.ok(pub.find(t => t.id === 'duel1').done);
  assert.strictEqual(pub.find(t => t.id === 'duel2').value, 10);
});

test('every trophy gives its own exclusive weapon, once', () => {
  const ids = Eco.TROPHIES.map(t => t.item);
  assert.strictEqual(new Set(ids).size, Eco.TROPHIES.length);
  for (const id of ids) { assert.ok(Sim.ITEM[id] && Sim.ITEM[id].exclusive, id); }
  for (let i = 0; i < 20000; i++) for (const c of Sim.CRATES) assert.ok(!Sim.ITEM[Sim.rollCrate(c).id].trophy);
  const p = defaultProfile('t');
  Eco.applyRoundResult(p, { role: 'murderer', won: true, alive: true, bag: 0, kills: 1 });
  Eco.checkTrophies(p); Eco.checkTrophies(p);
  assert.deepStrictEqual(p.inv.map(i => i.id), ['t_blood1']);
  // trophies unlocked before weapons existed get their weapon on the next check
  const old = defaultProfile('o'); old.trophies = ['play1']; Eco.checkTrophies(old);
  assert.ok(old.inv.some(i => i.id === 't_play1'));
});
