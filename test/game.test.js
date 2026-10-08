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
  const n0 = Sim.ITEMS.filter(i => !i.nodrop && !i.retired && !p.inv.some(x => x.id === i.id)).length;
  assert.strictEqual(Eco.redeem(p, 'gimmeall').all.length, n0);
  assert.throws(() => Eco.redeem(p, 'gimmeall'), /already have every/);
  p.inv = p.inv.filter(i => i.id !== 'g13');
  assert.deepStrictEqual(Eco.redeem(p, 'GIMMEALL').all, ['g13'], 'reusable: gives back just what is missing');
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
  assert.ok(fastE.atkCd < 0.2, `cookie scope cooldown ${fastE.atkCd}`);
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
  assert.ok(!sher.hasGun, 'old gun holder lost the gun'); assert.notStrictEqual(sher.role, 'sheriff'); // back to innocent, or picked as the new murderer
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

test('cookie scopes shoot farther', () => {
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

test('void event unlocks at 100 kills, and the summer stuff is gone', () => {
  const p = defaultProfile('t');
  assert.throws(() => Eco.claimEvent(p), /100 more kills/);
  Eco.applyRoundResult(p, { role: 'murderer', won: true, alive: true, bag: 0, kills: 20 });
  assert.strictEqual(Eco.publicProfile(p).events[0].kills, 20);
  assert.throws(() => Eco.claimEvent(p), /80 more kills/);
  for (let i = 0; i < 4; i++) Eco.applyRoundResult(p, { role: 'murderer', won: true, alive: true, bag: 0, kills: 20 });
  assert.deepStrictEqual(Eco.claimEvent(p), ['k30', 'g24']);
  assert.throws(() => Eco.claimEvent(p), /already claimed/);
  assert.ok(!Eco.publicProfile(p).events.some(e => e.id === 'summer26'));
  assert.ok(!Sim.CRATES.some(c => c.id === 'sumbox'));
  assert.throws(() => Eco.claimEvent(p, 'summer26'), /Unknown event/);
  // nobody gets summer items from boxes or GIMMEALL anymore, but old ones still work
  for (let i = 0; i < 5000; i++) for (const c of Sim.CRATES) assert.ok(!['k24', 'g18', 'k25', 'g19'].includes(Sim.rollCrate(c).id));
  const q = defaultProfile('q'); Eco.redeem(q, 'GIMMEALL');
  assert.ok(!q.inv.some(i => Sim.ITEM[i.id].retired));
  assert.ok(Sim.ITEM.k24 && Sim.ITEM.g19);
});

test('Void Gun evolves into the Void Scope once its Evo bar is full', () => {
  const p = defaultProfile('t');
  const inst = { u: p.nextUid++, id: 'g24' }; p.inv.push(inst); Eco.equip(p, inst.u);
  // without it equipped, no Evo points
  const q = defaultProfile('q'); assert.strictEqual(Eco.applyRoundResult(q, { role: 'innocent', won: false, alive: false, bag: 0, kills: 0 }).evo, 0);
  assert.throws(() => Eco.evolve(p, inst.u), /0 \/ 60/);
  const r = Eco.applyRoundResult(p, { role: 'sheriff', won: true, alive: true, bag: 0, kills: 1 });
  assert.strictEqual(r.evo, 12); // 2 for the round, 5 for the kill, 5 for the win
  for (let i = 0; i < 20; i++) Eco.applyRoundResult(p, { role: 'murderer', won: true, alive: true, bag: 0, kills: 3 });
  assert.strictEqual(Eco.publicProfile(p).evo.xp, 60); // capped at the goal
  assert.strictEqual(Eco.evolve(p, inst.u), 'g25');
  assert.strictEqual(Eco.equippedId(p, 'gun'), 'g25', 'still equipped after evolving');
  assert.strictEqual(Eco.publicProfile(p).evo.xp, 0);
  assert.throws(() => Eco.evolve(p, inst.u), /can't evolve/);
  const k = { u: p.nextUid++, id: 'k30' }; p.inv.push(k); assert.throws(() => Eco.evolve(p, k.u), /can't evolve/);
});

test('the Void Scope shoots a void laser with a 1.2 s reload only its owner hears', () => {
  const R = Sim.createRound({ mapIdx: 0, players: [{ pid: 'a', name: 'a', gun: 'g25' }, { pid: 'b', name: 'b' }], fillBots: false });
  R.phase = 'play';
  const e = R.ents[0]; e.hasGun = true; e.role = 'sheriff';
  Sim.setInput(R, e.id, { x: e.x, y: e.y, a: 0, atk: true }); Sim.step(R, 1 / 30);
  const ev = Sim.drain(R);
  assert.ok(ev.some(x => x.t === 'sfx' && x.s === 'void'));
  const rl = ev.find(x => x.s === 'voidReload'); assert.ok(rl && rl.to === e.id);
  assert.ok(e.atkCd > 1 && e.atkCd <= 1.2, `reload ${e.atkCd}`);
});

test('halloween: Death Gun at 150 kills, knives only from the Halloween Box', () => {
  const p = defaultProfile('t');
  for (let i = 0; i < 13; i++) Eco.applyRoundResult(p, { role: 'murderer', won: true, alive: true, bag: 0, kills: 11 });
  assert.throws(() => Eco.claimEvent(p, 'halloween26'), /7 more kills/);
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

test('Chroma Raygun Set costs 93,000 coins', () => {
  const p = defaultProfile('t'); p.coins = 92999;
  assert.throws(() => Eco.buyBundle(p, 'craygun'), /Not enough coins/);
  p.coins = 100000;
  assert.deepStrictEqual(Eco.buyBundle(p, 'craygun'), ['g23', 'k29']);
  assert.strictEqual(p.coins, 7000);
  assert.ok(Sim.ITEM.g23.noCooldown && Sim.ITEM.g23.sound === 'ray' && Sim.ITEM.k29.r === 'Chroma');
  for (let i = 0; i < 20000; i++) for (const c of Sim.CRATES) assert.ok(!['g23', 'k29'].includes(Sim.rollCrate(c).id));
});

test('jump clears tables, bomb jump goes way up and dodges stabs, crouch slows you', () => {
  const R = Sim.createRound({ mapIdx: 0, players: [{ pid: 'a', name: 'a' }, { pid: 'b', name: 'b' }], fillBots: false });
  R.phase = 'play';
  const [me, m] = R.ents; me.role = 'innocent'; me.hasGun = false; m.role = 'murderer'; m.hasGun = false; R.murderer = m;
  m.x = 30 * 48; m.y = 20 * 48;
  // Mansion has tables at tiles 6..9 x 11..12: walk into them while jumping and you get over
  me.x = 5 * 48 + 20; me.y = 11.5 * 48;
  let top = 0, jp = 1;
  for (let i = 0; i < 45; i++) { Sim.setInput(R, me.id, { x: me.x + 8, y: me.y, a: 0, jp }); Sim.step(R, 1 / 30); top = Math.max(top, me.z); if (!me.z) jp++; }
  assert.ok(top > .6 && top < 1.2, `normal jump height ${top.toFixed(2)}`);
  assert.ok(Math.floor(me.x / 48) >= 10, `hopped over the tables, now at tile ${Math.floor(me.x / 48)}`);
  // bomb jump: much higher, stabs miss while you're up there
  me.x = 15 * 48; me.y = 9.5 * 48; top = 0;
  Sim.setInput(R, me.id, { x: me.x, y: me.y, a: 0, jp, bj: 1 }); Sim.step(R, 1 / 30);
  for (let i = 0; i < 8; i++) { Sim.setInput(R, me.id, { x: me.x, y: me.y, a: 0, jp, bj: 1 }); Sim.step(R, 1 / 30); }
  assert.ok(me.z > 1, 'high up');
  m.x = me.x + 25; m.y = me.y; m.atkCd = 0;
  Sim.setInput(R, m.id, { x: m.x, y: m.y, a: Math.PI, atk: true }); Sim.step(R, 1 / 30);
  assert.ok(me.alive, 'stab misses someone in the air');
  Sim.setInput(R, m.id, { x: m.x, y: m.y, a: Math.PI, atk: false }); m.x = 30 * 48;
  for (let i = 0; i < 60; i++) { Sim.setInput(R, me.id, { x: me.x, y: me.y, a: 0, jp, bj: 1 }); Sim.step(R, 1 / 30); top = Math.max(top, me.z); }
  assert.ok(top > 3.5, `bomb jump height ${top.toFixed(2)}`);
  assert.strictEqual(me.z, 0, 'landed');
  // no cooldown: you can bomb jump again right away
  Sim.setInput(R, me.id, { x: me.x, y: me.y, a: 0, jp, bj: 2 }); Sim.step(R, 1 / 30);
  assert.ok(me.z > 0 && me.vz > 0, 'second bomb jump right away');
  // crouch
  const R2 = Sim.createRound({ mapIdx: 1, players: [{ pid: 'a', name: 'a' }], fillBots: false }); R2.phase = 'play';
  const e = R2.ents[0]; e.x = 6 * 48 + 24; e.y = 7 * 48; const sx = e.x;
  for (let i = 0; i < 30; i++) { Sim.setInput(R2, e.id, { x: e.x + 1000, y: e.y, a: 0, cr: true }); Sim.step(R2, 1 / 30); }
  assert.ok(e.crouch && e.x - sx < Sim.PLAYER_SPEED * .7, `crouch moved ${Math.round(e.x - sx)}`);
});

test('juke dashes you forward, then has a cooldown', () => {
  const run = (dj2) => {
    const R = Sim.createRound({ mapIdx: 1, players: [{ pid: 'a', name: 'a' }, { pid: 'b', name: 'b' }], fillBots: false }); R.phase = 'play'; R.introT = 0;
    const e = R.ents[0]; e.x = 6 * 48 + 24; e.y = 7 * 48; const sx = e.x;
    for (let i = 0; i < 9; i++) { Sim.setInput(R, e.id, { x: e.x + 1000, y: e.y, a: 0, dj: dj2 ? 1 : 0 }); Sim.step(R, 1 / 30); }
    return { d: e.x - sx, e, R };
  };
  const walk = run(false).d, j = run(true);
  assert.ok(j.d > walk * 1.4, `juke ${Math.round(j.d)} vs walk ${Math.round(walk)}`);
  assert.ok(j.e.dashCd > 0 && Sim.snapshotFor(j.R, j.e.id).me.dash > 0);
  const cd = j.e.dashCd; Sim.setInput(j.R, j.e.id, { x: j.e.x, y: j.e.y, a: 0, dj: 2 }); Sim.step(j.R, 1 / 30);
  assert.ok(j.e.dashCd < cd, 'a second juke during the cooldown does nothing');
});

test('a round saved by an older version still restores and runs', () => {
  const R = Sim.createRound({ mapIdx: 0, players: [{ pid: 'a', name: 'a' }] });
  const o = Sim.serializeRound(R);
  for (const e of o.ents) for (const k of ['z', 'vz', 'crouch', 'bombCd', 'lastJp', 'lastBj', 'dashT', 'dashCd', 'lastDj']) delete e[k];
  const R2 = Sim.restoreRound(JSON.parse(JSON.stringify(o)));
  for (let i = 0; i < 200; i++) { Sim.step(R2, 1 / 30); Sim.snapshotFor(R2, R2.ents[0].id); }
  assert.equal(R2.ents[0].z, 0);
});

test('GODLY1000 gives 1000 Godlys once, and only with room for them', () => {
  const p = defaultProfile('a');
  const r = Eco.redeem(p, 'godly1000');
  assert.equal(r.bulk, 1000);
  assert.equal(p.inv.filter(i => Sim.ITEM[i.id].r === 'Godly').length, 1000);
  assert.throws(() => Eco.redeem(p, 'GODLY1000'), /already used/);
  const full = defaultProfile('b'); for (let i = 0; i < 1500; i++) full.inv.push({ u: i + 1, id: 'k1' });
  assert.throws(() => Eco.redeem(full, 'GODLY1000'), /free slots/);
  assert.equal(full.inv.length, 1500);
});

test('the admin code turns on admin and owner luck', () => {
  const p = defaultProfile('a');
  assert.deepEqual(Eco.redeemMsg(Eco.redeem(p, 'OWNERMODE777')), { t: 'codeAdmin' });
  assert.ok(p.admin && p.luck && Eco.publicProfile(p).admin);
});

test('pets: only from the Pet Box, equip into their own slot, and follow you into rounds', () => {
  const box = Sim.CRATES.find(c => c.id === 'petbox');
  for (let i = 0; i < 3000; i++) {
    assert.strictEqual(Sim.rollCrate(box).type, 'pet');
    for (const c of Sim.CRATES) if (c !== box) assert.notStrictEqual(Sim.rollCrate(c).type, 'pet', c.id);
  }
  // rarity codes never hand out pets
  for (let i = 0; i < 200; i++) { const p = defaultProfile('c'); assert.notStrictEqual(Sim.ITEM[Eco.redeem(p, 'GODLY26').inst.id].type, 'pet'); }
  const p = defaultProfile('t'); p.coins = 1000;
  assert.strictEqual(Eco.equippedId(p, 'pet'), null);
  const inst = Eco.openCrate(p, 'petbox'); assert.strictEqual(p.coins, 880);
  Eco.equip(p, inst.u);
  assert.strictEqual(Eco.equippedId(p, 'pet'), inst.id);
  assert.strictEqual(Eco.equippedId(p, 'knife'), 'k0', 'weapons untouched');
  Eco.equip(p, inst.u); assert.strictEqual(Eco.equippedId(p, 'pet'), null, 'tapping it again puts it away');
  Eco.equip(p, inst.u);
  // trading it away unequips it
  const tr = { name: 'x', inv: [], greed: 1, nextU: 1000 };
  Eco.trade(p, tr, [inst.u], []);
  assert.strictEqual(p.equip.pet, null);
  const R = Sim.createRound({ players: [{ pid: 'a', name: 'a', pet: 'p9' }, { pid: 'b', name: 'b', pet: 'k1' }] });
  const ro = Sim.roster(R);
  assert.strictEqual(ro[0].pet, 'p9');
  assert.strictEqual(ro[1].pet, null, 'a knife is not a pet');
  assert.ok(ro.every(r => r.pet === null || Sim.ITEM[r.pet].type === 'pet'));
});

test('cheating onto the other team counts as that team for win/lose', () => {
  const R = Sim.createRound({ players: [{ pid: 'a', name: 'a' }], fillBots: true });
  R.phase = 'play';
  const me = R.ents[0];
  if (me.role === 'murderer') Sim.cheat(R, me.id, '/sheffeme'); else Sim.cheat(R, me.id, '/murdme');
  const myTeamMurderer = me.role === 'murderer';
  for (const e of R.ents) if (e !== me && e.role !== 'murderer') e.alive = false;
  if (!myTeamMurderer) R.murderer.alive = false;
  for (let i = 0; i < 5 && R.phase !== 'end'; i++) Sim.step(R, 1 / 30);
  assert.strictEqual(R.phase, 'end');
  assert.strictEqual(R.results[0].won, (R.winner === 'murderer') === myTeamMurderer);
  assert.strictEqual(R.results[0].won, true, 'my team won, so I won');
});

test('Haunted Manor is fully connected', () => {
  const i = Sim.MAPS.findIndex(m => m.name === 'Haunted Manor'); assert.ok(i >= 0);
  const M = Sim.buildMap(i); let walk = 0;
  for (let y = 0; y < M.H; y++) for (let x = 0; x < M.W; x++) if (!'#TPB'.includes(M.grid[y][x])) walk++;
  assert.strictEqual(M.reach.length, walk);
  assert.strictEqual(M.theme, 'haunted');
});

test('an accepted trade reports what you got, a declined one reports nothing', () => {
  const p = defaultProfile('t'); p.inv.push({ u: p.nextUid++, id: 'g13' });
  const tr = { name: 'x', inv: [{ u: 1, id: 'k1' }, { u: 2, id: 'g1' }], greed: 1, nextU: 1000 };
  const ok = Eco.trade(p, tr, [p.inv[0].u], [1, 2]);
  assert.ok(ok.ok); assert.deepStrictEqual(ok.got, ['k1', 'g1']);
  const no = Eco.trade(p, { name: 'y', inv: [{ u: 1, id: 'g16' }], greed: 1, nextU: 1000 }, [p.inv[0].u], [1]);
  assert.ok(!no.ok); assert.deepStrictEqual(no.got, []);
  // a code's random item says it came from a code
  assert.deepStrictEqual(Object.keys(Eco.redeemMsg({ inst: { id: 'k1' } })).sort(), ['code', 'crate', 'item', 't']);
});

test('/esp shows everyone\'s role, but only to the player who turned it on', () => {
  const R = Sim.createRound({ players: [{ pid: 'a', name: 'a' }, { pid: 'b', name: 'b' }] });
  R.phase = 'play';
  const [a, b] = R.ents;
  assert.strictEqual(Sim.snapshotFor(R, a.id).esp, undefined);
  assert.match(Sim.cheat(R, a.id, '/ESP'), /ESP on/);
  const esp = Sim.snapshotFor(R, a.id).esp;
  assert.strictEqual(esp.length, R.ents.length);
  assert.strictEqual(esp.find(x => x[0] === R.murderer.id)[1], 'murderer');
  assert.strictEqual(Sim.snapshotFor(R, b.id).esp, undefined, 'nobody else gets the roles');
  assert.match(Sim.cheat(R, a.id, '/esp'), /off/);
  assert.strictEqual(Sim.snapshotFor(R, a.id).esp, undefined);
});

test('deleting an account removes the profile and frees the name', async () => {
  const { MemoryStore } = require('../server/store.js');
  const s = new MemoryStore();
  await s.create('u1', 'Bob');
  await assert.rejects(() => s.create('u2', 'bob'), /taken/);
  await s.remove('u1');
  assert.strictEqual(await s.get('u1'), null);
  await assert.rejects(() => s.update('u1', p => p), /No profile/, 'late round rewards can\'t bring it back');
  assert.strictEqual((await s.create('u2', 'BOB')).name, 'BOB', 'name is free again');
});

test('/gun gives you a gun and every other shooter misses every shot', () => {
  const R = Sim.createRound({ players: [{ pid: 'a', name: 'a' }] });
  R.phase = 'play'; R.introT = 0;
  const me = R.ents.find(e => e.role === 'innocent'); // the cheat works for whoever types it
  assert.match(Sim.cheat(R, me.id, '/gun'), /You got a gun/);
  assert.ok(me.hasGun && me.role === 'hero');
  // a sheriff shooting point blank at the murderer never hits
  const sher = R.ents.find(e => e.role === 'sheriff' && e !== me), m = R.murderer;
  // a clear spot: 4 open tiles in a row, and nobody else around to get in the way
  let spot = null;
  for (let y = 1; y < R.M.H - 1 && !spot; y++) for (let x = 1; x < R.M.W - 5 && !spot; x++) if ([0, 1, 2, 3].every(k => R.M.grid[y][x + k] === '.')) spot = [x, y];
  for (const e of R.ents) if (![me, sher, m].includes(e)) e.alive = false;
  sher.x = spot[0] * 48 + 10; sher.y = spot[1] * 48 + 24; m.x = sher.x + 60; m.y = sher.y; m.god = false;
  m.human = true; m.inp = null; sher.human = true; // hold both still (a bot murderer would juke)
  for (let i = 0; i < 20; i++) { sher.atkCd = 0; Sim.setInput(R, sher.id, { x: sher.x, y: sher.y, a: 0, atk: true }); Sim.step(R, 1 / 30); }
  assert.ok(m.alive, 'the sheriff missed');
  // my own shots still hit
  sher.inp = null; sher.alive = false; me.x = sher.x; me.y = sher.y; me.human = true; me.atkCd = 0; m.x = me.x + 60; m.y = me.y;
  for (let i = 0; i < 15 && m.alive; i++) { Sim.setInput(R, me.id, { x: me.x, y: me.y, a: 0, atk: true }); Sim.step(R, 1 / 30); }
  assert.ok(!m.alive, 'my bullet hits');
});

test('no item uses a Murder Mystery 2 item name (Play Store)', () => {
  const mm2 = /luger|harvester|nebula|icewing|lightbringer|batwing|elderwood|chroma fang|swirly|ginger|^laser$|^heat$|^pixel/i;
  assert.deepStrictEqual(Sim.ITEMS.filter(i => mm2.test(i.name)).map(i => i.name), []);
  assert.strictEqual(new Set(Sim.ITEMS.map(i => i.name)).size, Sim.ITEMS.length, 'names are unique');
});

test('avatars: only the offered options are accepted, and they show up in rounds', () => {
  const p = defaultProfile('t');
  const look = { skin: Sim.AVATAR.skin[3], shirt: Sim.AVATAR.shirt[13], pants: Sim.AVATAR.pants[2], hat: 'crown', face: 'cool' };
  Eco.setAvatar(p, { ...look, extra: 'ignored' });
  assert.deepStrictEqual(p.avatar, look);
  assert.deepStrictEqual(Eco.publicProfile(p).avatar, look);
  for (const bad of [null, 'x', { ...look, hat: 'rocket' }, { ...look, skin: '#123456' }, { ...look, face: undefined }]) assert.throws(() => Eco.setAvatar(p, bad), /options/);
  assert.deepStrictEqual(p.avatar, look, 'a bad pick changes nothing');
  const R = Sim.createRound({ players: [{ pid: 'a', name: 'a', avatar: look }, { pid: 'b', name: 'b' }] });
  const ro = Sim.roster(R);
  assert.deepStrictEqual(ro[0].avatar, look);
  assert.strictEqual(ro[0].color, look.shirt);
  assert.strictEqual(ro[1].avatar.hat, 'cap', 'no avatar yet: the classic look');
  assert.ok(ro.every(r => Sim.cleanAvatar(r.avatar)), 'every avatar (bots too) is valid');
});
