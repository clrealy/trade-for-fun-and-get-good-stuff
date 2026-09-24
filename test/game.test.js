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
  assert.throws(() => Eco.redeem(p, 'GODLY26'), /already used/);
  assert.throws(() => Eco.redeem(p, 'FAKECODE'), /doesn't exist/);
  assert.throws(() => Eco.redeem(p, '__proto__'), /doesn't exist/);
});
