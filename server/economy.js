'use strict';
// All coin/item changes happen here, on the server. The client only asks.
const Sim = require('../shared/sim.js');
const CODES = require('./codes.js');

const xpNeed = lvl => 100 + lvl * 60;
// Events: get `goal` kills (counted from when the event starts) to claim the rewards.
const EVENTS = [
  { id: 'summer26', name: 'Summer Event', icon: '☀️', goal: 50, rewards: ['k24', 'g18'], desc: 'Want the Chroma versions? Try the ☀️ Sum Box in the Shop.' },
  { id: 'halloween26', name: 'Halloween Event', icon: '🎃', goal: 150, rewards: ['g20'], desc: 'Unlock the Death Gun. The Death Knives are in the 🎃 Halloween Box.' },
];
function eventState(p, id) {
  p.events = p.events || {};
  return (p.events[id] = p.events[id] || { kills: 0, claimed: false });
}
function claimEvent(p, id = EVENTS[0].id) {
  const E = EVENTS.find(e => e.id === id); if (!E) throw new Error('Unknown event');
  const ev = eventState(p, id);
  if (ev.claimed) throw new Error(`You already claimed the ${E.name} rewards`);
  if (ev.kills < E.goal) throw new Error(`You need ${E.goal - ev.kills} more kills`);
  if (p.inv.length + E.rewards.length > MAX_INV) throw new Error('Inventory full (500 items)');
  ev.claimed = true;
  return E.rewards.map(id => addItem(p, id).id);
}
// Bundles: buy a whole set for coins, once
const BUNDLES = [{ id: 'raygun', name: 'Raygun Set', icon: '🔫', price: 3999, items: ['g21', 'k28'] }];
function buyBundle(p, id) {
  const b = BUNDLES.find(x => x.id === id); if (!b) throw new Error('Unknown bundle');
  if (b.items.every(i => p.inv.some(x => x.id === i))) throw new Error(`You already have the ${b.name}`);
  if (p.coins < b.price) throw new Error('Not enough coins');
  if (p.inv.length + b.items.length > MAX_INV) throw new Error('Inventory full (500 items)');
  p.coins -= b.price;
  return b.items.map(i => addItem(p, i).id);
}
const MAX_INV = 500;

function publicProfile(p) {
  return { name: p.name, coins: p.coins, xp: p.xp, level: p.level, xpNeed: xpNeed(p.level), inv: p.inv, equip: p.equip, mT: p.mT, sT: p.sT, stats: p.stats, luck: !!p.luck,
    trophies: TROPHIES.map(t => ({ id: t.id, icon: t.icon, name: t.name, desc: t.desc, goal: t.goal, reward: t.reward, item: t.item, value: Math.min(t.get(p), t.goal), done: (p.trophies || []).includes(t.id) })),
    events: EVENTS.map(E => { const ev = (p.events && p.events[E.id]) || { kills: 0, claimed: false }; return { ...E, kills: Math.min(ev.kills, E.goal), claimed: ev.claimed }; }),
    bundles: BUNDLES.map(b => ({ ...b, owned: b.items.every(i => p.inv.some(x => x.id === i)) })) };
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

function openCrate(p, crateId, lucky) {
  const c = Sim.CRATES.find(x => x.id === crateId);
  if (!c) throw new Error('Unknown crate');
  if (p.coins < c.price) throw new Error('Not enough coins');
  p.coins -= c.price;
  const item = Sim.rollCrate(c, lucky || !!p.luck);
  const inst = addItem(p, item.id);
  p.stats.unboxed++;
  return inst;
}
function redeem(p, rawCode) {
  const code = String(rawCode || '').replace(/\s+/g, '').toUpperCase(); // spaces don't matter: "c memeset" = CMEMESET
  const c = Object.hasOwn(CODES, code) ? CODES[code] : null;
  if (!c) throw new Error('That code doesn\'t exist');
  if (c.expires && Date.now() > Date.parse(c.expires + 'T23:59:59Z')) throw new Error('That code expired');
  p.redeemed = p.redeemed || [];
  if (p.redeemed.includes(code) && !c.repeat) throw new Error('You already used that code');
  let out;
  if (c.reward.luck) {
    if (p.luck) throw new Error('Your luck is already on 🍀');
    p.luck = true; out = { luck: true };
  } else if (c.reward.all) {
    // only what you don't own yet, so it can be used again whenever new items come out
    const owned = new Set(p.inv.map(i => i.id));
    const missing = Sim.ITEMS.filter(i => !i.nodrop && !owned.has(i.id));
    if (!missing.length) throw new Error('You already have every knife and gun 😎');
    if (p.inv.length + missing.length > MAX_INV) throw new Error('Inventory full (500 items)');
    out = { all: missing.map(i => addItem(p, i.id).id) };
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
  const st = p.stats;
  if (res.won && res.role === 'murderer') st.murdWins = (st.murdWins || 0) + 1;
  if (res.won && res.role === 'sheriff') st.sheriffWins = (st.sheriffWins || 0) + 1;
  if (res.hero) st.heroes = (st.heroes || 0) + 1;
  if (res.won && res.mode === '1v1') st.duelWins = (st.duelWins || 0) + 1;
  if (res.alive && res.role !== 'murderer') st.survived = (st.survived || 0) + 1;
  p.stats.rounds++; p.stats.kills += res.kills; for (const E of EVENTS) eventState(p, E.id).kills += res.kills; if (res.won) p.stats.wins++; if (!res.alive) p.stats.deaths++;
  let lv = 0; while (p.xp >= xpNeed(p.level)) { p.xp -= xpNeed(p.level); p.level++; lv++; }
  p.mT = res.role === 'murderer' ? 1 : Math.min(50, p.mT + 1);
  p.sT = res.role === 'sheriff' ? 1 : Math.min(50, p.sT + 1);
  return { ...r, levelUps: lv, won: res.won, kills: res.kills };
}

// ---------- trophies ----------
// Unlocked once, forever, and each pays coins. Progress comes from stats the server tracks.
const stat = k => p => (p.stats && p.stats[k]) || 0;
const TROPHIES = [
  ['blood1', '🩸', 'First Blood', 'Get your first kill', stat('kills'), 1, 50, 't_blood1'],
  ['blood2', '🔪', 'Serial Killer', 'Get 50 kills', stat('kills'), 50, 500, 't_blood2'],
  ['blood3', '💀', 'Grim Reaper', 'Get 250 kills', stat('kills'), 250, 2500, 't_blood3'],
  ['blood4', '☠️', 'Death Itself', 'Get 1,000 kills', stat('kills'), 1000, 10000, 't_blood4'],
  ['play1', '🎮', 'Rookie', 'Play 10 rounds', stat('rounds'), 10, 100, 't_play1'],
  ['play2', '🕹️', 'Regular', 'Play 100 rounds', stat('rounds'), 100, 1000, 't_play2'],
  ['play3', '🧟', 'No Life', 'Play 500 rounds', stat('rounds'), 500, 5000, 't_play3'],
  ['win1', '🥉', 'Winner', 'Win 10 rounds', stat('wins'), 10, 200, 't_win1'],
  ['win2', '🥇', 'Champion', 'Win 100 rounds', stat('wins'), 100, 2000, 't_win2'],
  ['murd', '😈', 'Murderer Main', 'Win 25 rounds as Murderer', stat('murdWins'), 25, 1500, 't_murd'],
  ['sher', '🤠', 'Law & Order', 'Win 25 rounds as Sheriff', stat('sheriffWins'), 25, 1500, 't_sher'],
  ['hero1', '🦸', 'Hero Moment', 'Pick up the dropped gun', stat('heroes'), 1, 150, 't_hero1'],
  ['hero2', '🛡️', 'Real Hero', 'Become the Hero 10 times', stat('heroes'), 10, 1000, 't_hero2'],
  ['duel1', '⚔️', 'Duelist', 'Win 10 1v1s', stat('duelWins'), 10, 750, 't_duel1'],
  ['duel2', '👑', 'Duel King', 'Win 50 1v1s', stat('duelWins'), 50, 3000, 't_duel2'],
  ['surv', '🏃', 'Survivor', 'Survive 25 rounds as Innocent or Sheriff', stat('survived'), 25, 750, 't_surv'],
  ['coin1', '💰', 'Coin Collector', 'Earn 1,000 coins from rounds', stat('coins'), 1000, 250, 't_coin1'],
  ['coin2', '🤑', 'Money Bags', 'Earn 25,000 coins from rounds', stat('coins'), 25000, 2500, 't_coin2'],
  ['box1', '📦', 'Unboxer', 'Open 25 boxes', stat('unboxed'), 25, 300, 't_box1'],
  ['box2', '🎰', 'Box Addict', 'Open 250 boxes', stat('unboxed'), 250, 3000, 't_box2'],
  ['trade', '🤝', 'Trader', 'Finish 10 trades', stat('trades'), 10, 400, 't_trade'],
  ['lvl1', '⭐', 'Level 10', 'Reach level 10', p => p.level, 10, 500, 't_lvl1'],
  ['lvl2', '🌟', 'Level 25', 'Reach level 25', p => p.level, 25, 2000, 't_lvl2'],
  ['lvl3', '💫', 'Level 50', 'Reach level 50', p => p.level, 50, 7500, 't_lvl3'],
  ['chroma', '🌈', 'Chroma Hunter', 'Own 5 Chroma items', p => p.inv.filter(i => Sim.ITEM[i.id] && Sim.ITEM[i.id].r === 'Chroma').length, 5, 5000, 't_chroma'],
].map(([id, icon, name, desc, get, goal, reward, item]) => ({ id, icon, name, desc, get, goal, reward, item }));
// call after any change to a profile: unlocks what's newly earned and pays the reward
function checkTrophies(p) {
  p.trophies = p.trophies || [];
  const got = [];
  p.trophyGifts = p.trophyGifts || [];
  for (const t of TROPHIES) if (!p.trophies.includes(t.id) && t.get(p) >= t.goal) { p.trophies.push(t.id); p.coins += t.reward; got.push(t.id); }
  // each unlocked trophy hands over its weapon once (this also catches trophies unlocked before weapons existed)
  for (const t of TROPHIES) if (p.trophies.includes(t.id) && !p.trophyGifts.includes(t.id) && p.inv.length < MAX_INV) { addItem(p, t.item); p.trophyGifts.push(t.id); }
  return got;
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

module.exports = { TROPHIES, checkTrophies, EVENTS, BUNDLES, claimEvent, buyBundle, publicProfile, equippedId, openCrate, redeem, equip, applyRoundResult, genTraders, tradersView, trade, xpNeed };
