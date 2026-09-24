'use strict';
// All coin/item changes happen here, on the server. The client only asks.
const Sim = require('../shared/sim.js');
const CODES = require('./codes.js');

const xpNeed = lvl => 100 + lvl * 60;
const MAX_INV = 500;

function publicProfile(p) {
  return { name: p.name, coins: p.coins, xp: p.xp, level: p.level, xpNeed: xpNeed(p.level), inv: p.inv, equip: p.equip, mT: p.mT, sT: p.sT, stats: p.stats };
}
function equippedId(p, type) {
  const inst = p.inv.find(i => i.u === p.equip[type]);
  return inst ? inst.id : (type === 'knife' ? 'k0' : 'g0');
}
function addItem(p, id) {
  if (p.inv.length >= MAX_INV) throw new Error('Inventory full (500 items)');
  const inst = { u: p.nextUid++, id }; p.inv.push(inst); return inst;
}
function removeInst(p, u) {
  const k = p.inv.findIndex(i => i.u === u); if (k < 0) throw new Error('Item not found');
  const [inst] = p.inv.splice(k, 1);
  if (p.equip.knife === u) p.equip.knife = null;
  if (p.equip.gun === u) p.equip.gun = null;
  return inst;
}

function openCrate(p, crateId) {
  const c = Sim.CRATES.find(x => x.id === crateId);
  if (!c) throw new Error('Unknown crate');
  if (p.coins < c.price) throw new Error('Not enough coins');
  p.coins -= c.price;
  const item = Sim.rollItem(c.w, c.type);
  const inst = addItem(p, item.id);
  p.stats.unboxed++;
  return inst;
}
function redeem(p, rawCode) {
  const code = String(rawCode || '').trim().toUpperCase();
  const c = Object.hasOwn(CODES, code) ? CODES[code] : null;
  if (!c) throw new Error('That code doesn\'t exist');
  if (c.expires && Date.now() > Date.parse(c.expires + 'T23:59:59Z')) throw new Error('That code expired');
  p.redeemed = p.redeemed || [];
  if (p.redeemed.includes(code)) throw new Error('You already used that code');
  let out;
  if (c.reward.all) {
    const all = Sim.ITEMS.filter(i => !i.nodrop);
    if (p.inv.length + all.length > MAX_INV) throw new Error('Inventory full (500 items)');
    out = { all: all.map(i => addItem(p, i.id).id) };
  } else if (c.reward.items) {
    if (p.inv.length + c.reward.items.length > MAX_INV) throw new Error('Inventory full (500 items)');
    out = { items: c.reward.items.map(id => addItem(p, id).id) };
  } else if (c.reward.coins) { p.coins += c.reward.coins; out = { coins: c.reward.coins }; }
  else {
    const pool = c.reward.item ? [Sim.ITEM[c.reward.item]] : Sim.ITEMS.filter(i => !i.nodrop && !i.exclusive && i.r === c.reward.rarity);
    out = { inst: addItem(p, pool[Math.floor(Math.random() * pool.length)].id) };
  }
  p.redeemed.push(code);
  return out;
}
function equip(p, u) {
  if (u === null || u === undefined) return;
  const inst = p.inv.find(i => i.u === u); if (!inst) throw new Error('Item not found');
  const t = Sim.ITEM[inst.id].type;
  p.equip[t] = p.equip[t] === u ? null : u;
}
function applyRoundResult(p, res) {
  const r = Sim.rewardFor(res);
  p.coins += r.coins; p.stats.coins += r.coins; p.xp += r.xp;
  p.stats.rounds++; p.stats.kills += res.kills; if (res.won) p.stats.wins++; if (!res.alive) p.stats.deaths++;
  let lv = 0; while (p.xp >= xpNeed(p.level)) { p.xp -= xpNeed(p.level); p.level++; lv++; }
  p.mT = res.role === 'murderer' ? 1 : Math.min(50, p.mT + 1);
  p.sT = res.role === 'sheriff' ? 1 : Math.min(50, p.sT + 1);
  return { ...r, levelUps: lv, won: res.won, kills: res.kills };
}

// ---------- bot traders (kept per player, in memory) ----------
const TRADER_NAMES = ['JustVibin', 'MM2Pro', 'coolkid2009', 'tradeMeHarv', 'godly_hunter', 'BloxBurger', 'lil_ninja', 'GamerGrl'];
const LINES = {
  accept: ['W trade 🔥', 'deal ty!!', 'accepted, pleasure doing business 🤝', 'ok fine ur lucky lol', 'ez accept'],
  decline: ['nah thats a L for me 💀', 'add more pls', 'lowball 😭', 'bro thinks im new', 'nope. overpay or nothing'],
  gift: ['free stuff?? ty king 👑', 'omg ty 😭'],
  empty: ['u gotta offer something lol'],
};
const pick = a => a[Math.floor(Math.random() * a.length)];
function genTraders() {
  const names = [...TRADER_NAMES].sort(() => Math.random() - .5).slice(0, 3);
  let n = 1;
  return names.map(name => {
    const inv = []; const k = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < k; i++) inv.push({ u: n++, id: Sim.rollItem(Sim.CRATES[2].w).id });
    return { name, inv, greed: 1 + Math.random() * .25, nextU: 1000 };
  });
}
const tradersView = ts => ts.map(t => ({ name: t.name, inv: t.inv }));
const val = ids => ids.reduce((s, id) => s + Sim.ITEM[id].val, 0);

// mutates p and trader when accepted; returns {ok, line}
function trade(p, trader, mineU, theirsU) {
  if (!Array.isArray(mineU) || !Array.isArray(theirsU) || mineU.length > 4 || theirsU.length > 4) throw new Error('Pick up to 4 items on each side');
  if (new Set(mineU).size !== mineU.length || new Set(theirsU).size !== theirsU.length) throw new Error('Duplicate item in offer');
  const mine = mineU.map(u => { const i = p.inv.find(x => x.u === u); if (!i) throw new Error('You no longer have that item'); return i; });
  const theirs = theirsU.map(u => { const i = trader.inv.find(x => x.u === u); if (!i) throw new Error('Trader no longer has that item'); return i; });
  const mv = val(mine.map(i => i.id)), tv = val(theirs.map(i => i.id));
  let ok = false, line;
  if (!mine.length) line = pick(LINES.empty);
  else if (!theirs.length) { ok = true; line = pick(LINES.gift); }
  else if (mv >= tv * trader.greed) { ok = true; line = pick(LINES.accept); }
  else line = pick(LINES.decline);
  if (ok) {
    if (p.inv.length - mine.length + theirs.length > MAX_INV) throw new Error('Inventory full (500 items)');
    for (const i of mine) { removeInst(p, i.u); trader.inv.push({ u: trader.nextU++, id: i.id }); }
    for (const i of theirs) { trader.inv.splice(trader.inv.indexOf(i), 1); addItem(p, i.id); }
    p.stats.trades++;
  }
  return { ok, line };
}

module.exports = { publicProfile, equippedId, openCrate, redeem, equip, applyRoundResult, genTraders, tradersView, trade, xpNeed };
