'use strict';
// ===================== Murder Mystery (MM2-style) =====================
const $ = s => document.querySelector(s);
const cv = $('#game'), ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
  cv.width = W * DPR; cv.height = H * DPR; cv.style.width = W + 'px'; cv.style.height = H + 'px';
}
addEventListener('resize', resize); resize();

const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };

// ===================== Items =====================
const RAR = {
  Common: { c: '#b8b8b8', v: 1 }, Uncommon: { c: '#5bd46a', v: 3 }, Rare: { c: '#3fa2ff', v: 10 },
  Legendary: { c: '#ff4d4d', v: 30 }, Godly: { c: '#e35bff', v: 150 }, Ancient: { c: '#ffc233', v: 500 }, Chroma: { c: 'chroma', v: 1200 },
};
const RORDER = Object.keys(RAR);
const I = (id, type, name, r, col, mult = 1, extra = {}) => ({ id, type, name, r, col, val: Math.round(RAR[r].v * mult), ...extra });
const ITEMS = [
  I('k0', 'knife', 'Default Knife', 'Common', '#c9c9d6', 0, { nodrop: true }),
  I('k1', 'knife', 'Butter Knife', 'Common', '#f3e3a0'),
  I('k2', 'knife', 'Rusty Blade', 'Common', '#a0613a', 1.2),
  I('k3', 'knife', 'Kitchen Knife', 'Common', '#dfe6ee', 1.1),
  I('k4', 'knife', 'Camo Blade', 'Uncommon', '#6b8e3a'),
  I('k5', 'knife', 'Neon Slasher', 'Uncommon', '#39ff9c', 1.3),
  I('k6', 'knife', 'Pixel Knife', 'Uncommon', '#ff9de2', 1.1),
  I('k7', 'knife', 'Frostbite', 'Rare', '#9ee8ff'),
  I('k8', 'knife', 'Toxic', 'Rare', '#9dff3a', 1.2),
  I('k9', 'knife', 'Galaxy Shard', 'Rare', '#7a5cff', 1.4),
  I('k10', 'knife', 'Inferno', 'Legendary', '#ff6a00'),
  I('k11', 'knife', 'Blood Moon', 'Legendary', '#c4001a', 1.3),
  I('k12', 'knife', 'Thunderclap', 'Legendary', '#ffe600', 1.1),
  I('k13', 'knife', 'Harvester', 'Godly', '#ff8c1a', 1.6),
  I('k14', 'knife', 'Nebula', 'Godly', '#b04dff', 1.2),
  I('k15', 'knife', 'Icewing', 'Godly', '#6fe3ff', 1.0),
  I('k16', 'knife', 'Heat', 'Godly', '#ff3b3b', 0.8),
  I('k17', 'knife', 'Elderwood Scythe', 'Ancient', '#3dd68c', 1.2),
  I('k18', 'knife', 'Batwing', 'Ancient', '#5a2a7a', 1.0),
  I('k19', 'knife', 'Chroma Fang', 'Chroma', 'chroma'),
  I('g0', 'gun', 'Default Gun', 'Common', '#8a8f99', 0, { nodrop: true }),
  I('g1', 'gun', 'Cap Gun', 'Common', '#e84a4a'),
  I('g2', 'gun', 'Water Pistol', 'Common', '#3fb6ff', 1.2),
  I('g3', 'gun', 'Camo Pistol', 'Uncommon', '#6b8e3a'),
  I('g4', 'gun', 'Retro Blaster', 'Uncommon', '#ff7de9', 1.2),
  I('g5', 'gun', 'Frost Revolver', 'Rare', '#9ee8ff'),
  I('g6', 'gun', 'Laser', 'Rare', '#ff2e63', 1.3),
  I('g7', 'gun', 'Dragonfire', 'Legendary', '#ff5a1f', 1.2),
  I('g8', 'gun', 'Golden Six', 'Legendary', '#ffcf3a'),
  I('g9', 'gun', 'Luger', 'Godly', '#2b2b2b', 1.5),
  I('g10', 'gun', 'Blizzard', 'Godly', '#d9f6ff', 1.0),
  I('g11', 'gun', 'Lightbringer', 'Godly', '#fff4a8', 1.3),
  I('g12', 'gun', 'Swirly Gun', 'Ancient', '#ff77c8'),
  I('g13', 'gun', 'Chroma Luger', 'Chroma', 'chroma', 1.1),
];
const ITEM = Object.fromEntries(ITEMS.map(i => [i.id, i]));
const CRATES = [
  { id: 'knifebox', name: 'Knife Box', icon: '🗡️', price: 60, type: 'knife', desc: 'A random knife skin.', w: { Common: 45, Uncommon: 28, Rare: 16, Legendary: 8, Godly: 2.5, Ancient: 0.4, Chroma: 0.1 } },
  { id: 'gunbox', name: 'Gun Box', icon: '🔫', price: 60, type: 'gun', desc: 'A random gun skin.', w: { Common: 45, Uncommon: 28, Rare: 16, Legendary: 8, Godly: 2.5, Ancient: 0.4, Chroma: 0.1 } },
  { id: 'mystery', name: 'Mystery Box', icon: '🎁', price: 175, type: null, desc: 'Way better odds. Godly hunting 👀', w: { Common: 18, Uncommon: 30, Rare: 26, Legendary: 16, Godly: 7.5, Ancient: 2, Chroma: 0.5 } },
];
function rollItem(weights, type) {
  let tot = 0; for (const r in weights) tot += weights[r];
  let x = Math.random() * tot, rar = 'Common';
  for (const r in weights) { x -= weights[r]; if (x <= 0) { rar = r; break; } }
  let pool = ITEMS.filter(i => !i.nodrop && i.r === rar && (!type || i.type === type));
  if (!pool.length) pool = ITEMS.filter(i => !i.nodrop && (!type || i.type === type));
  return pick(pool);
}
const itemColor = (it, t = performance.now() / 1000) => it.col === 'chroma' ? `hsl(${(t * 140) % 360},95%,62%)` : it.col;
const rarColor = r => r === 'Chroma' ? '#fff' : RAR[r].c;

// ===================== Save =====================
const SAVE_KEY = 'mm_clone_save_v1';
function defSave() { return { coins: 120, xp: 0, level: 1, inv: [], uid: 1, equip: { knife: null, gun: null }, mT: 1, sT: 1, stats: { rounds: 0, wins: 0, kills: 0, deaths: 0, coins: 0, unboxed: 0, trades: 0 } }; }
function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && Array.isArray(s.inv)) { const d = defSave(); return { ...d, ...s, stats: { ...d.stats, ...s.stats }, equip: { ...d.equip, ...s.equip } }; } } catch (e) { }
  return defSave();
}
let S = loadSave();
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { } }
const xpNeed = lvl => 100 + lvl * 60;
function addItem(id) { const inst = { u: S.uid++, id }; S.inv.push(inst); return inst; }
function equipped(type) {
  const u = S.equip[type]; const inst = S.inv.find(i => i.u === u);
  return inst ? ITEM[inst.id] : ITEM[type === 'knife' ? 'k0' : 'g0'];
}

// ===================== Audio =====================
let AC = null;
function tone(f, d = .1, type = 'square', vol = .05, slide = 0) {
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g).connect(AC.destination); o.start(t); o.stop(t + d);
  } catch (e) { }
}
function noise(d = .15, vol = .15) {
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const n = AC.sampleRate * d, b = AC.createBuffer(1, n, AC.sampleRate), ch = b.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
    const s = AC.createBufferSource(), g = AC.createGain(); g.gain.value = vol; s.buffer = b; s.connect(g).connect(AC.destination); s.start();
  } catch (e) { }
}
const SFX = {
  coin: () => tone(1200, .08, 'square', .03, 600),
  stab: () => { noise(.08, .12); tone(300, .1, 'sawtooth', .04, -200); },
  shoot: () => { noise(.2, .25); tone(160, .15, 'square', .05, -100); },
  throw: () => tone(700, .2, 'triangle', .05, -500),
  die: () => tone(400, .4, 'sawtooth', .05, -330),
  gun: () => { tone(500, .12, 'square', .05); setTimeout(() => tone(750, .15, 'square', .05), 110); },
  win: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, .18, 'square', .05), i * 120)),
  lose: () => [400, 330, 260].forEach((f, i) => setTimeout(() => tone(f, .25, 'triangle', .06), i * 180)),
  roll: () => tone(900, .03, 'square', .02),
};

// ===================== Maps =====================
// # wall   B shelf/couch (blocks sight)   T table / P plant (block movement only, you can shoot over them)
const MAPS = [
  {
    name: 'Mansion', floor: ['#d9c7a3', '#d2bf99'], wall: '#4d3828', wallTop: '#6e5139', rows: [
      '####################################',
      '#........#..........#..............#',
      '#.BB.....#..TT......#...B.....B....#',
      '#........#..TT......#..............#',
      '#........D..........D......TTT.....#',
      '#...TT...#..........#......TTT.....#',
      '#...TT...#.......P..#..............#',
      '#........#..........#####D##########',
      '###D######..........#..............#',
      '#.........................#........#',
      '#..P......................D...BB...#',
      '#.....TTTT.......TTTT.....#........#',
      '#.....TTTT.......TTTT.....#...TT...#',
      '#.........................#...TT...#',
      '#...................P.....#........#',
      '######D#####D########D#####D########',
      '#.........#...........#............#',
      '#..BB.....#...........#....TTTT....#',
      '#.........D.....TT....D....TTTT....#',
      '#.........#.....TT....#............#',
      '#..TT.....#...........#............#',
      '#..TT.....#..B.....B..#..P......P..#',
      '#.........#...........#............#',
      '####################################',
    ]
  },
  {
    name: 'Office', floor: ['#b9c4cf', '#b1bcc8'], wall: '#394556', wallTop: '#55657c', rows: [
      '####################################',
      '#......#......#......#......#......#',
      '#.TT...#.TT...#.TT...#.TT...#.TT...#',
      '#.TT...#.TT...#.TT...#.TT...#.TT...#',
      '#......#......#......#......#......#',
      '###D######D######D######D######D####',
      '#..................................#',
      '#..................................#',
      '#...P......P.......P.......P.......#',
      '#####D########....########D#########',
      '#.........#..........#.............#',
      '#.TTTTTT..#...TTTT...#..BBBBBB.....#',
      '#.........#...TTTT...#.............#',
      '#.TTTTTT..D..........D..TTT..TTT...#',
      '#.........#...TTTT...#..TTT..TTT...#',
      '#.TTTTTT..#...TTTT...#.............#',
      '#.........#..........#.............#',
      '#####D#########..#########D#########',
      '#..................................#',
      '#..P.....BB.......P.......BB.....P.#',
      '#..................................#',
      '#...TT......TT......TT......TT.....#',
      '#..................................#',
      '####################################',
    ]
  },
  {
    name: 'Hotel', floor: ['#8e3b46', '#86343f'], wall: '#2a1e24', wallTop: '#46323b', rows: [
      '####################################',
      '#.......#.......#.......#..........#',
      '#.BB....#.BB....#.BB....#...TTTT...#',
      '#.......#.......#.......#...TTTT...#',
      '#....P..#....P..#....P..#..........#',
      '####D#######D#######D########D######',
      '#..................................#',
      '#..TT......................TT......#',
      '#..TT.....####....####.....TT......#',
      '#.........#..........#.............#',
      '#.........D...TTTT...D.............#',
      '#.........#...TTTT...#......P......#',
      '#..P......####....####.............#',
      '#..................................#',
      '#..........TT......TT..............#',
      '######D#######D########D#######D####',
      '#..........#.........#.............#',
      '#..BBBB....#...TTT...#...BB...BB...#',
      '#..........#...TTT...#.............#',
      '#..........D.........D.............#',
      '#...TT.....#...P.....#...TT...TT...#',
      '#...TT.....#.........#.............#',
      '#..........#.........#.............#',
      '####################################',
    ]
  },
];
const TILE = 48;
let MW = 0, MH = 0, GRID = [], REACH = [], MAP = null;
const SOLID_MOVE = new Set(['#', 'T', 'P', 'B']);
const SOLID_SIGHT = new Set(['#', 'B']);
const tileAt = (tx, ty) => (tx < 0 || ty < 0 || tx >= MW || ty >= MH) ? '#' : GRID[ty][tx];
const moveSolid = (tx, ty) => SOLID_MOVE.has(tileAt(tx, ty));
const moveSolidAt = (x, y) => moveSolid(Math.floor(x / TILE), Math.floor(y / TILE));
const sightSolidAt = (x, y) => SOLID_SIGHT.has(tileAt(Math.floor(x / TILE), Math.floor(y / TILE)));

function loadMap(m) {
  MAP = m; MH = m.rows.length; MW = Math.max(...m.rows.map(r => r.length));
  GRID = [];
  for (let y = 0; y < MH; y++) {
    const row = [];
    for (let x = 0; x < MW; x++) {
      let ch = m.rows[y][x] || '#';
      if (x === 0 || y === 0 || x === MW - 1 || y === MH - 1) ch = '#';
      if (ch === 'D') ch = '.';
      row.push(ch);
    }
    GRID.push(row);
  }
  // largest connected walkable region = where people spawn & coins drop
  const seen = new Uint8Array(MW * MH); let best = [];
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (seen[y * MW + x] || moveSolid(x, y)) continue;
    const comp = [], st = [[x, y]]; seen[y * MW + x] = 1;
    while (st.length) {
      const [cx, cy] = st.pop(); comp.push([cx, cy]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (!moveSolid(nx, ny) && !seen[ny * MW + nx]) { seen[ny * MW + nx] = 1; st.push([nx, ny]); }
      }
    }
    if (comp.length > best.length) best = comp;
  }
  REACH = best;
}
const randReach = () => { const [tx, ty] = pick(REACH); return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 }; };

function los(ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / 10);
  for (let i = 1; i < n; i++) { const t = i / n; if (sightSolidAt(ax + (bx - ax) * t, ay + (by - ay) * t)) return false; }
  return true;
}
function clearLine(ax, ay, bx, by, r) {
  const d = Math.hypot(bx - ax, by - ay); if (d < 1) return true;
  const nx = -(by - ay) / d * r, ny = (bx - ax) / d * r, n = Math.ceil(d / 8);
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
    if (moveSolidAt(x, y) || moveSolidAt(x + nx, y + ny) || moveSolidAt(x - nx, y - ny)) return false;
  }
  return true;
}
function astar(sx, sy, gx, gy) {
  const s = Math.floor(sy / TILE) * MW + Math.floor(sx / TILE);
  let gtx = Math.floor(gx / TILE), gty = Math.floor(gy / TILE);
  if (moveSolid(gtx, gty)) return null;
  const goal = gty * MW + gtx; if (s === goal) return [];
  const N = MW * MH, g = new Float32Array(N).fill(1e9), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const open = [s]; g[s] = 0;
  const h = i => { const x = i % MW, y = (i / MW) | 0; const dx = Math.abs(x - gtx), dy = Math.abs(y - gty); return Math.max(dx, dy) + .414 * Math.min(dx, dy); };
  let it = 0;
  while (open.length && it++ < 2000) {
    let bi = 0, bf = 1e9;
    for (let k = 0; k < open.length; k++) { const f = g[open[k]] + h(open[k]); if (f < bf) { bf = f; bi = k; } }
    const cur = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    if (cur === goal) break;
    closed[cur] = 1;
    const cx = cur % MW, cy = (cur / MW) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (moveSolid(nx, ny)) continue;
      if (dx && dy && (moveSolid(cx + dx, cy) || moveSolid(cx, cy + dy))) continue;
      const ni = ny * MW + nx; if (closed[ni]) continue;
      const ng = g[cur] + (dx && dy ? 1.414 : 1);
      if (ng < g[ni]) { if (g[ni] >= 1e9) open.push(ni); g[ni] = ng; came[ni] = cur; }
    }
  }
  if (came[goal] < 0) return null;
  const path = []; let c = goal;
  while (c !== s && c >= 0) { path.push({ x: (c % MW) * TILE + TILE / 2, y: ((c / MW) | 0) * TILE + TILE / 2 }); c = came[c]; }
  path.reverse(); path[path.length - 1] = { x: gx, y: gy };
  // string-pull the path
  const out = []; let px = sx, py = sy, i = 0;
  while (i < path.length) {
    let j = path.length - 1;
    while (j > i && !clearLine(px, py, path[j].x, path[j].y, 15)) j--;
    out.push(path[j]); px = path[j].x; py = path[j].y; i = j + 1;
  }
  return out;
}

// ===================== Round state =====================
const BOT_NAMES = ['xX_Slayer_Xx', 'noob_123', 'BaconHair', 'Guest_1337', 'coolkid2009', 'pizzalover', 'ItsYaBoi', 'sussybaka', 'MM2Pro', 'KnifeKing', 'ChillGamer', 'OofMaster', 'godly_hunter', 'tradeMeHarv', 'lil_ninja', 'JustVibin', 'BloxBurger', 'nikilis_fan', 'GamerGrl', 'sheriffOrElse'];
const COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#748ffc', '#da77f2', '#f783ac', '#e8e8e8', '#a9744f', '#63e6be'];
const BAG_MAX = 40;
let G = null;
let uidE = 1;
let keys = {}, mouse = { x: 0, y: 0, wx: 0, wy: 0 };

function mkEnt(name, isPlayer, color) {
  return {
    id: uidE++, name, isPlayer, color, x: 0, y: 0, vx: 0, vy: 0, r: 15, ang: rand(0, 6.28),
    role: 'innocent', alive: true, hasGun: false, weaponOut: false, atkCd: 0, throwCd: 0, swing: 0, bag: 0, kills: 0,
    speed: isPlayer ? 190 : 172, walk: 0,
    knife: isPlayer ? equipped('knife') : botSkin('knife'), gun: isPlayer ? equipped('gun') : botSkin('gun'),
    ai: { path: [], pathT: 0, goal: null, know: null, lastSeen: null, react: 0, grace: rand(12, 24), stuckT: 0, lx: 0, ly: 0, brave: Math.random() < .25, fleeT: 0, target: null, retarget: 0, noticeT: 0, wanderT: 0, coin: null },
  };
}
function botSkin(type) { return Math.random() < .5 ? ITEM[type === 'knife' ? 'k0' : 'g0'] : rollItem(CRATES[2].w, type); }

function startRound(mapIdx) {
  if (mapIdx < 0) mapIdx = Math.floor(Math.random() * MAPS.length);
  loadMap(MAPS[mapIdx]);
  G = { ents: [], coins: [], proj: [], bodies: [], fx: [], gunDrop: null, time: 180, phase: 'intro', introT: 4, coinT: 0, t: 0, cam: { x: 0, y: 0 }, spec: null, heroName: null, endT: 0, rid: Math.random() };
  const p = mkEnt('You', true, '#ffffff'); G.player = p; G.ents.push(p);
  const names = shuffle(BOT_NAMES).slice(0, 11), cols = shuffle(COLORS);
  names.forEach((n, i) => G.ents.push(mkEnt(n, false, cols[i % cols.length])));
  // spread-out spawns
  const spots = shuffle(REACH);
  const used = [];
  for (const e of G.ents) {
    let best = null;
    for (let k = 0; k < spots.length && k < 200; k++) {
      const [tx, ty] = spots[k], c = { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
      if (used.every(u => dist(u, c) > 170)) { best = c; spots.splice(k, 1); break; }
    }
    best = best || randReach(); used.push(best); e.x = best.x; e.y = best.y;
  }
  // roles — player uses the MM2-style chance system
  const n = G.ents.length;
  let pool = G.ents.slice(1);
  if (Math.random() < S.mT / (S.mT + n - 1)) p.role = 'murderer';
  else if (Math.random() < S.sT / (S.sT + n - 2)) { p.role = 'sheriff'; p.hasGun = true; }
  pool = shuffle(pool);
  if (p.role !== 'murderer') pool.pop().role = 'murderer';
  if (p.role !== 'sheriff') { const s = pool.pop(); s.role = 'sheriff'; s.hasGun = true; }
  G.murderer = G.ents.find(e => e.role === 'murderer');
  G.sheriffName = G.ents.find(e => e.role === 'sheriff').name;
  for (let i = 0; i < 14; i++) spawnCoin();

  $('#lobby').classList.add('hide'); $('#endScreen').classList.add('hide');
  $('#hud').classList.remove('hide'); $('#spec').classList.add('hide'); $('#msgs').innerHTML = '';
  const R = { murderer: ['MURDERER', '#ff4d5e', 'Kill everyone. Don\'t get caught with your knife out 🔪'], sheriff: ['SHERIFF', '#4da3ff', 'Find the murderer and shoot them. Don\'t shoot innocents!'], innocent: ['INNOCENT', '#5bd46a', 'Hide, survive, and collect coins. Grab the gun if the sheriff dies.'] }[p.role];
  $('#introRole').textContent = R[0]; $('#introRole').style.color = R[1]; $('#introSub').textContent = R[2];
  $('#intro').classList.remove('hide');
  G.cam.x = p.x; G.cam.y = p.y;
  tone(220, .3, 'triangle', .06); setTimeout(() => tone(330, .4, 'triangle', .06), 300);
}

function spawnCoin() {
  for (let k = 0; k < 10; k++) {
    const c = randReach(); c.x += rand(-12, 12); c.y += rand(-12, 12);
    if (G.coins.every(o => dist(o, c) > 70)) { c.b = rand(0, 6); G.coins.push(c); return; }
  }
}
function msg(text, color = '#fff', dur = 3.5) {
  const d = document.createElement('div'); d.textContent = text; d.style.color = color;
  $('#msgs').appendChild(d);
  setTimeout(() => d.style.opacity = 0, dur * 1000); setTimeout(() => d.remove(), dur * 1000 + 600);
  while ($('#msgs').children.length > 4) $('#msgs').firstChild.remove();
}

function moveEnt(e, dx, dy, dt, spd) {
  const ox = e.x, oy = e.y;
  e.x += dx * spd * dt; e.y += dy * spd * dt;
  for (let it = 0; it < 2; it++) collide(e);
  e.vx = (e.x - ox) / Math.max(dt, 1e-4); e.vy = (e.y - oy) / Math.max(dt, 1e-4);
  if (dx || dy) e.walk += dt * 12;
}
function collide(e) {
  const r = e.r, x0 = Math.floor((e.x - r) / TILE), x1 = Math.floor((e.x + r) / TILE), y0 = Math.floor((e.y - r) / TILE), y1 = Math.floor((e.y + r) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (!moveSolid(tx, ty)) continue;
    const cx = clamp(e.x, tx * TILE, tx * TILE + TILE), cy = clamp(e.y, ty * TILE, ty * TILE + TILE);
    let dx = e.x - cx, dy = e.y - cy; const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      if (d2 === 0) { e.x += 1; continue; }
      const d = Math.sqrt(d2); e.x += dx / d * (r - d); e.y += dy / d * (r - d);
    }
  }
}

// ---------- combat ----------
function tryStab(e) {
  if (e.role !== 'murderer' || !e.alive || e.atkCd > 0) return;
  e.weaponOut = true; e.atkCd = .5; e.swing = .2; SFX.stab();
  for (const o of G.ents) {
    if (o === e || !o.alive) continue;
    if (dist(e, o) < e.r + o.r + 26 && angDiff(Math.atan2(o.y - e.y, o.x - e.x), e.ang) < 1.4) { kill(o, e); break; }
  }
}
function tryThrow(e) {
  if (e.role !== 'murderer' || !e.alive || e.throwCd > 0) return;
  e.weaponOut = true; e.throwCd = 3; e.atkCd = .4;
  const sp = 720;
  G.proj.push({ type: 'knife', x: e.x + Math.cos(e.ang) * 18, y: e.y + Math.sin(e.ang) * 18, vx: Math.cos(e.ang) * sp, vy: Math.sin(e.ang) * sp, owner: e, life: 1.1, rot: 0, skin: e.knife });
  SFX.throw();
}
function tryShoot(e) {
  if (!e.hasGun || !e.alive || e.atkCd > 0) return;
  e.weaponOut = true; e.atkCd = 2.2;
  const sp = 1600;
  G.proj.push({ type: 'bullet', x: e.x + Math.cos(e.ang) * 22, y: e.y + Math.sin(e.ang) * 22, vx: Math.cos(e.ang) * sp, vy: Math.sin(e.ang) * sp, owner: e, life: .55, trail: [] });
  G.fx.push({ type: 'flash', x: e.x + Math.cos(e.ang) * 28, y: e.y + Math.sin(e.ang) * 28, t: .08 });
  SFX.shoot();
  // everyone nearby hears the shot and learns who the gun holder is (only matters for murderer bots)
}
function dropGun(x, y) {
  G.gunDrop = { x, y };
  msg('The Sheriff has been killed! The gun has dropped 🔫', '#4da3ff', 5);
  SFX.gun();
}
function kill(v, k) {
  if (!v.alive) return;
  v.alive = false; v.weaponOut = false;
  G.bodies.push({ x: v.x, y: v.y, ang: v.ang, color: v.color, name: v.name });
  for (let i = 0; i < 14; i++) G.fx.push({ type: 'blood', x: v.x, y: v.y, vx: rand(-120, 120), vy: rand(-120, 120), t: rand(.3, .6) });
  SFX.die();
  if (v.hasGun) { v.hasGun = false; dropGun(v.x, v.y); }
  if (k) {
    k.kills++;
    if (k.role === 'murderer') {
      if (!k.isPlayer) { k.ai.grace = rand(3, 8); k.ai.target = null; } // lay low after a kill
      for (const b of G.ents) if (!b.isPlayer && b.alive && b !== k && dist(b, k) < 420 && los(b.x, b.y, k.x, k.y)) { b.ai.know = k; b.ai.lastSeen = { x: k.x, y: k.y }; }
    } else if (v.role !== 'murderer' && k.alive) {
      // sheriff/hero shot an innocent → they die too
      msg(`${k.isPlayer ? 'You' : k.name} shot an innocent! 💀`, '#ff4d5e', 4);
      k.alive = false; k.weaponOut = false;
      G.bodies.push({ x: k.x, y: k.y, ang: k.ang, color: k.color, name: k.name });
      if (k.hasGun) { k.hasGun = false; dropGun(k.x, k.y); }
      if (k.isPlayer) onPlayerDeath('You shot an innocent and died.');
    }
  }
  if (v.isPlayer) onPlayerDeath(k ? (k.role === 'murderer' ? `You were killed by ${k.name}!` : `${k.name} shot you!`) : 'You died.');
  else if (v.role === 'murderer') msg(`${k ? (k.isPlayer ? 'You' : k.name) : 'Someone'} killed the Murderer! 🎉`, '#5bd46a', 5);
}
function onPlayerDeath(text) {
  msg(text, '#ff4d5e', 5);
  S.stats.deaths++;
  G.spec = G.ents.find(e => e.alive) || null;
}

// ===================== Bots =====================
function setGoal(b, x, y, force) {
  const ai = b.ai;
  if (!force && ai.goal && ai.pathT > 0 && Math.hypot(ai.goal.x - x, ai.goal.y - y) < 48) return;
  ai.goal = { x, y }; ai.pathT = rand(.45, .75);
  if (clearLine(b.x, b.y, x, y, 15)) ai.path = [{ x, y }];
  else ai.path = astar(b.x, b.y, x, y) || [];
}
function steer(b) {
  const p = b.ai.path;
  while (p.length && Math.hypot(p[0].x - b.x, p[0].y - b.y) < 10) p.shift();
  if (!p.length) return [0, 0];
  const dx = p[0].x - b.x, dy = p[0].y - b.y, d = Math.hypot(dx, dy) || 1;
  return [dx / d, dy / d];
}
const gunHolder = () => G.ents.find(e => e.alive && e.hasGun);
function nearestCoin(b) {
  let best = null, bd = 1e9;
  for (const c of G.coins) { const d = dist(b, c); if (d < bd) { bd = d; best = c; } }
  return best;
}
function wander(b, dt) {
  const ai = b.ai; ai.wanderT -= dt;
  if (ai.wanderT <= 0 || !ai.path.length) { const t = randReach(); setGoal(b, t.x, t.y, true); ai.wanderT = rand(3, 7); }
}
function collect(b, dt) {
  if (b.bag >= BAG_MAX || !G.coins.length) return wander(b, dt);
  if (!b.ai.coin || !G.coins.includes(b.ai.coin) || b.ai.pathT <= 0) b.ai.coin = nearestCoin(b);
  if (b.ai.coin) setGoal(b, b.ai.coin.x, b.ai.coin.y);
}

function botThink(b, dt) {
  const ai = b.ai; ai.pathT -= dt;
  let spd = b.speed;
  if (b.role !== 'murderer') {
    const m = G.murderer;
    if (m.alive && m.weaponOut && dist(b, m) < 520 && los(b.x, b.y, m.x, m.y)) {
      ai.noticeT += dt;
      if (ai.noticeT > .6 && ai.know !== m) { ai.know = m; ai.react = rand(.3, .7); }
    } else ai.noticeT = 0;
    if (ai.know && !ai.know.alive) ai.know = null;
  }

  if (b.role === 'murderer') {
    ai.grace -= dt;
    if (ai.grace > 0) { b.weaponOut = false; collect(b, dt); }
    else {
      ai.retarget -= dt;
      const gh = gunHolder();
      if (!ai.target || !ai.target.alive || ai.retarget <= 0) {
        let best = null, bd = 1e9;
        for (const o of G.ents) {
          if (o === b || !o.alive) continue;
          let d = G.gunDrop ? dist(b, o) * .4 + dist(o, G.gunDrop) : dist(b, o); // guard the dropped gun
          if (o.hasGun && o.weaponOut) d += 250; // avoid an alert gun holder a bit
          if (d < bd) { bd = d; best = o; }
        }
        ai.target = best; ai.retarget = rand(1.5, 3);
      }
      const t = ai.target;
      if (t) {
        const d = dist(b, t), see = los(b.x, b.y, t.x, t.y);
        // smart murderer: don't pull the knife while the gun holder can see you (unless they're the target)
        const watched = gh && gh !== b && gh !== t && dist(gh, b) < 600 && los(gh.x, gh.y, b.x, b.y);
        b.weaponOut = d < 140 && see && !watched;
        if (watched && d < 140) ai.retarget = 0;
        if (b.weaponOut) spd = 196;
        if (see) b.ang = Math.atan2(t.y - b.y, t.x - b.x);
        if (d < b.r + t.r + 22 && see && !watched) tryStab(b);
        else if (see && !watched && d > 130 && d < 430 && b.throwCd <= 0 && Math.random() < dt * (t.hasGun ? 2.5 : .9)) {
          const lead = d / 720;
          b.ang = Math.atan2(t.y + t.vy * lead - b.y, t.x + t.vx * lead - b.x) + rand(-.08, .08);
          tryThrow(b);
        }
        setGoal(b, t.x, t.y);
      }
      // a gun holder who knows about you and is looking → throw at them
      if (gh && gh !== b && gh.weaponOut && los(b.x, b.y, gh.x, gh.y) && dist(b, gh) < 450 && b.throwCd <= 0 && Math.random() < dt * 2) {
        b.ang = Math.atan2(gh.y - b.y, gh.x - b.x); tryThrow(b);
      }
      // gun pointed at you → juke sideways
      if (gh && gh !== b && gh.weaponOut && dist(b, gh) < 700 && los(b.x, b.y, gh.x, gh.y)) {
        ai.dodgeT = (ai.dodgeT || 0) - dt;
        if (ai.dodgeT <= 0) { ai.dodgeT = rand(.25, .5); ai.dodgeS = Math.random() < .5 ? 1 : -1; }
        const a = Math.atan2(gh.y - b.y, gh.x - b.x) + ai.dodgeS * Math.PI / 2;
        const tx = b.x + Math.cos(a) * 60, ty = b.y + Math.sin(a) * 60;
        if (!moveSolidAt(tx, ty)) { ai.path = [{ x: tx, y: ty }]; ai.goal = null; }
        else ai.dodgeS *= -1;
        spd = 196;
      }
    }
  } else if (b.hasGun) {
    const k = ai.know;
    if (k && k.alive) {
      const see = los(b.x, b.y, k.x, k.y) && dist(b, k) < 750;
      if (see) {
        ai.lastSeen = { x: k.x, y: k.y };
        b.weaponOut = true;
        const d = dist(b, k), lead = d / 1600;
        b.ang = Math.atan2(k.y + k.vy * lead - b.y, k.x + k.vx * lead - b.x);
        ai.react -= dt;
        if (ai.react <= 0 && b.atkCd <= 0) { b.ang += rand(-1, 1) * (0.07 + d / 2500) * (b.role === "hero" ? 1.8 : 1); tryShoot(b); ai.react = rand(.4, .9); }
        // keep some distance, otherwise stand and aim
        if (d < 170) { const t = { x: b.x - (k.x - b.x), y: b.y - (k.y - b.y) }; setGoal(b, t.x, t.y); }
        else { ai.path = []; ai.goal = null; }
      } else {
        ai.react = Math.max(ai.react, rand(.35, .6));
        const t = ai.lastSeen || k; setGoal(b, t.x, t.y);
        if (ai.lastSeen && dist(b, ai.lastSeen) < 30) { ai.lastSeen = null; ai.know = Math.random() < .5 ? k : null; } // lost them
      }
    } else { b.weaponOut = false; collect(b, dt); }
  } else {
    const k = ai.know;
    ai.fleeT -= dt;
    if (k && k.alive && dist(b, k) < 400 && (dist(b, k) < 180 || los(b.x, b.y, k.x, k.y))) {
      if (ai.fleeT <= 0 || !ai.path.length) {
        let best = null, bs = -1e9;
        for (let i = 0; i < 14; i++) {
          const c = randReach(), s = dist(c, k) * 1.2 - dist(c, b) * .6;
          const toC = Math.atan2(c.y - b.y, c.x - b.x), toK = Math.atan2(k.y - b.y, k.x - b.x);
          const pen = angDiff(toC, toK) < .8 ? 400 : 0;
          if (s - pen > bs) { bs = s - pen; best = c; }
        }
        setGoal(b, best.x, best.y, true); ai.fleeT = rand(.9, 1.5);
      }
    } else if (G.gunDrop && (ai.brave || ai.know) && dist(b, G.gunDrop) < 800) setGoal(b, G.gunDrop.x, G.gunDrop.y);
    else collect(b, dt);
  }

  let [dx, dy] = steer(b);
  // stuck detection
  if (dx || dy) {
    ai.stuckT += dt;
    if (ai.stuckT > .8) { if (Math.hypot(b.x - ai.lx, b.y - ai.ly) < 10) { ai.pathT = 0; ai.path = []; const t = randReach(); setGoal(b, t.x, t.y, true); } ai.stuckT = 0; ai.lx = b.x; ai.ly = b.y; }
    if (!(b.weaponOut && (b.role === 'murderer' || b.hasGun))) b.ang = Math.atan2(dy, dx);
  }
  moveEnt(b, dx, dy, dt, spd);
}

// ===================== Update =====================
function update(dt) {
  G.t += dt;
  const p = G.player;
  if (G.phase === 'intro') {
    G.introT -= dt;
    if (G.introT <= 0) {
      G.phase = 'play'; $('#intro').classList.add('hide');
      msg(p.role === 'murderer' ? 'You have your knife. Happy hunting 😈' : p.role === 'sheriff' ? 'You have the gun. Find the murderer 👀' : 'Round started — stay alive!', '#fff', 3);
    }
  } else if (G.phase === 'play' || G.phase === 'end') {
    if (G.phase === 'play') {
      G.time -= dt;
      G.coinT -= dt;
      if (G.coinT <= 0) { G.coinT = .55; if (G.coins.length < 30) spawnCoin(); }
    }
    // player
    if (p.alive && G.phase === 'play') {
      let dx = 0, dy = 0;
      if (keys.KeyW || keys.ArrowUp) dy--; if (keys.KeyS || keys.ArrowDown) dy++;
      if (keys.KeyA || keys.ArrowLeft) dx--; if (keys.KeyD || keys.ArrowRight) dx++;
      const l = Math.hypot(dx, dy) || 1; moveEnt(p, dx / l, dy / l, dt, p.speed);
      p.ang = Math.atan2(mouse.wy - p.y, mouse.wx - p.x);
      if (mouse.down) { if (p.role === 'murderer') tryStab(p); else if (p.hasGun) tryShoot(p); }
    }
    for (const e of G.ents) if (!e.isPlayer && e.alive && G.phase === 'play') botThink(e, dt);
    for (const e of G.ents) { e.atkCd = Math.max(0, e.atkCd - dt); e.throwCd = Math.max(0, e.throwCd - dt); e.swing = Math.max(0, e.swing - dt); }
    // pickups
    for (const e of G.ents) {
      if (!e.alive) continue;
      if (e.bag < BAG_MAX) for (let i = G.coins.length - 1; i >= 0; i--) {
        if (dist(e, G.coins[i]) < e.r + 10) { G.coins.splice(i, 1); e.bag++; if (e.isPlayer) { SFX.coin(); if (e.bag === BAG_MAX) msg('Coin bag full! 💰', '#ffc233'); } }
      }
      if (G.gunDrop && e.role === 'innocent' && dist(e, G.gunDrop) < e.r + 14) {
        e.hasGun = true; e.role = 'hero'; G.gunDrop = null; G.heroName = e.name;
        e.ai.react = rand(.8, 1.4);
        msg(e.isPlayer ? 'You picked up the gun! You are the HERO 🦸' : 'Someone picked up the gun...', e.isPlayer ? '#ffc233' : '#fff', 4);
        if (e.isPlayer) SFX.gun();
      }
    }
    // projectiles
    for (let i = G.proj.length - 1; i >= 0; i--) {
      const pr = G.proj[i]; pr.life -= dt; let dead = pr.life <= 0;
      const steps = Math.ceil(Math.hypot(pr.vx, pr.vy) * dt / 8);
      for (let s = 0; s < steps && !dead; s++) {
        pr.x += pr.vx * dt / steps; pr.y += pr.vy * dt / steps;
        if (sightSolidAt(pr.x, pr.y)) { dead = true; if (pr.type === 'knife') G.fx.push({ type: 'stuck', x: pr.x - pr.vx * .012, y: pr.y - pr.vy * .012, ang: Math.atan2(pr.vy, pr.vx), t: 1.2, skin: pr.skin }); break; }
        for (const e of G.ents) if (e.alive && e !== pr.owner && Math.hypot(e.x - pr.x, e.y - pr.y) < e.r + 4) { kill(e, pr.owner); dead = true; break; }
      }
      if (pr.trail) { pr.trail.push({ x: pr.x, y: pr.y }); if (pr.trail.length > 5) pr.trail.shift(); }
      pr.rot = (pr.rot || 0) + dt * 25;
      if (dead) G.proj.splice(i, 1);
    }
    for (let i = G.fx.length - 1; i >= 0; i--) { const f = G.fx[i]; f.t -= dt; if (f.vx) { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= .9; f.vy *= .9; } if (f.t <= 0) G.fx.splice(i, 1); }
    // win check
    if (G.phase === 'play') {
      const m = G.murderer;
      if (!m.alive) endRound('innocents');
      else if (G.ents.every(e => e === m || !e.alive)) endRound('murderer');
      else if (G.time <= 0) endRound('innocents');
    } else {
      G.endT += dt;
      if (G.endT > 1.4 && $('#endScreen').classList.contains('hide') && !G.endShown) { G.endShown = true; showEnd(); }
    }
  }
  // spectate
  if (!p.alive && (!G.spec || !G.spec.alive)) G.spec = G.ents.find(e => e.alive) || null;
  const f = p.alive ? p : (G.spec || p);
  G.cam.x += (f.x - G.cam.x) * Math.min(1, dt * 8); G.cam.y += (f.y - G.cam.y) * Math.min(1, dt * 8);
  mouse.wx = mouse.x - W / 2 + G.cam.x; mouse.wy = mouse.y - H / 2 + G.cam.y;
  updateHUD();
}

function endRound(winner) {
  G.phase = 'end'; G.winner = winner;
  const p = G.player;
  const won = (winner === 'murderer') === (p.role === 'murderer');
  const coins = p.bag + (won ? 10 : 0);
  const xp = 25 + p.bag * 2 + p.kills * 20 + (won ? 60 : 0) + (won && p.alive ? 20 : 0);
  S.coins += coins; S.stats.coins += coins; S.xp += xp; S.stats.rounds++; S.stats.kills += p.kills; if (won) S.stats.wins++;
  let lv = 0; while (S.xp >= xpNeed(S.level)) { S.xp -= xpNeed(S.level); S.level++; lv++; }
  if (p.role === 'murderer') S.mT = 1; else S.mT++;
  if (p.role === 'sheriff') S.sT = 1; else S.sT++;
  save();
  G.reward = { coins, xp, lv, won };
  won ? SFX.win() : SFX.lose();
  for (const e of G.ents) e.weaponOut = e.alive && (e.role === 'murderer' || e.hasGun);
}
function showEnd() {
  const r = G.reward, w = G.winner;
  $('#endTitle').textContent = w === 'murderer' ? 'Murderer Wins! 🔪' : 'Innocents Win! 🎉';
  $('#endTitle').style.color = w === 'murderer' ? '#ff4d5e' : '#5bd46a';
  const nm = e => e.isPlayer ? 'You' : e.name;
  $('#endRoles').innerHTML = `<div>🔪 Murderer: <b style="color:#ff4d5e">${esc(nm(G.murderer))}</b></div><div>🔫 Sheriff: <b style="color:#4da3ff">${esc(G.sheriffName)}</b></div>` +
    (G.heroName ? `<div>🦸 Hero: <b style="color:#ffc233">${esc(G.heroName)}</b></div>` : '');
  $('#endRewards').innerHTML = `${r.won ? '<b style="color:#5bd46a">You won!</b>' : '<b style="color:#ff4d5e">You lost</b>'}<br>💰 +${r.coins} coins · ⭐ +${r.xp} XP` + (G.player.kills ? ` · ☠️ ${G.player.kills} kill${G.player.kills > 1 ? 's' : ''}` : '') + (r.lv ? `<br><b style="color:#ffc233">LEVEL UP! You're level ${S.level} 🎉</b>` : '');
  $('#endScreen').classList.remove('hide');
  const rid = G.rid; setTimeout(() => { if (G && G.rid === rid) backToLobby(); }, 12000);
}
function backToLobby() {
  if (G && G.reward) $("#lastRes").textContent = `Last round: ${G.winner === 'murderer' ? 'Murderer won' : 'Innocents won'} · you got 💰${G.reward.coins}`;
  G = null; mouse.down = false;
  $('#endScreen').classList.add('hide'); $('#hud').classList.add('hide'); $('#intro').classList.add('hide');
  $('#lobby').classList.remove('hide'); renderLobby();
}

// ===================== HUD =====================
let hudCache = {};
function setText(id, t) { if (hudCache[id] !== t) { hudCache[id] = t; $('#' + id).textContent = t; } }
function setHTML(id, t) { if (hudCache[id] !== t) { hudCache[id] = t; $('#' + id).innerHTML = t; } }
function updateHUD() {
  const p = G.player, t = Math.max(0, Math.ceil(G.time));
  setText('timer', G.phase === 'intro' ? Math.ceil(G.introT) + '' : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
  setText('alive', `👥 ${G.ents.filter(e => e.alive).length} alive`);
  setText('bag', `💰 ${p.bag}/${BAG_MAX}`);
  const role = p.role === 'hero' ? ['HERO', '#ffc233'] : p.role === 'murderer' ? ['MURDERER', '#ff4d5e'] : p.role === 'sheriff' ? ['SHERIFF', '#4da3ff'] : ['INNOCENT', '#5bd46a'];
  const rb = $('#roleBadge'); if (hudCache.role !== role[0] + p.alive) { hudCache.role = role[0] + p.alive; rb.textContent = (p.alive ? '' : '💀 ') + role[0]; rb.style.background = role[1] + '55'; rb.style.color = role[1]; }
  let cools = '';
  if (p.alive && p.role === 'murderer') cools = coolBar('Stab', 1 - p.atkCd / .5) + coolBar('Throw (Q)', 1 - p.throwCd / 3);
  else if (p.alive && p.hasGun) cools = coolBar('Gun', 1 - p.atkCd / 2.2);
  setHTML('cools', cools);
  const hint = !p.alive ? 'Click to switch spectate' : p.role === 'murderer' ? 'Click stab · Q/Right-click throw · E hide knife' : p.hasGun ? 'Click shoot · E put away gun' : 'Collect coins · Stay alive · Grab the gun if it drops';
  setText('hint', hint);
  const sp = $('#spec');
  if (!p.alive && G.spec) { sp.classList.remove('hide'); setText('spec', `👁️ Spectating ${G.spec.name}`); } else sp.classList.add('hide');
}
const coolBar = (n, f) => { f = clamp(f, 0, 1); return `<div class="cool"><i style="transform:scaleX(${f.toFixed(2)});background:${f >= 1 ? '#5bd46a' : '#b36bff'}"></i><span>${n}${f >= 1 ? ' ✓' : ''}</span></div>`; };

// ===================== Render =====================
function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#0d0b12'; ctx.fillRect(0, 0, W, H);
  if (!G) return;
  const cx = Math.round(G.cam.x - W / 2), cy = Math.round(G.cam.y - H / 2), T = performance.now() / 1000;
  ctx.save(); ctx.translate(-cx, -cy);
  const tx0 = Math.max(0, Math.floor(cx / TILE)), ty0 = Math.max(0, Math.floor(cy / TILE));
  const tx1 = Math.min(MW - 1, Math.floor((cx + W) / TILE)), ty1 = Math.min(MH - 1, Math.floor((cy + H) / TILE));
  // floor
  for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
    const c = GRID[y][x]; if (c === '#') continue;
    ctx.fillStyle = MAP.floor[(x + y) & 1]; ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
  }
  // props
  for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
    const c = GRID[y][x], X = x * TILE, Y = y * TILE;
    if (c === 'T') { ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(X + 3, Y + 7, TILE - 2, TILE - 4); ctx.fillStyle = '#8a5a34'; ctx.fillRect(X + 1, Y + 1, TILE - 2, TILE - 4); ctx.fillStyle = '#a06b40'; ctx.fillRect(X + 3, Y + 3, TILE - 6, TILE - 10); }
    else if (c === 'P') { ctx.fillStyle = '#8b4a2b'; ctx.fillRect(X + 16, Y + 26, 16, 16); ctx.fillStyle = '#2f9e44'; for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(X + 24 + Math.cos(k * 1.3) * 9, Y + 20 + Math.sin(k * 1.3) * 8, 9, 0, 7); ctx.fill(); } }
    else if (c === 'B') { ctx.fillStyle = '#3b2616'; ctx.fillRect(X, Y, TILE, TILE); const bc = ['#c92a2a', '#1971c2', '#e67700', '#2b8a3e', '#862e9c']; for (let k = 0; k < 6; k++) { ctx.fillStyle = bc[(x * 3 + y + k) % 5]; ctx.fillRect(X + 4 + k * 7, Y + 6, 5, 16); ctx.fillStyle = bc[(x + y * 2 + k) % 5]; ctx.fillRect(X + 4 + k * 7, Y + 26, 5, 16); } }
  }
  // walls
  for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
    if (GRID[y][x] !== '#') continue;
    ctx.fillStyle = MAP.wall; ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    ctx.fillStyle = MAP.wallTop; ctx.fillRect(x * TILE, y * TILE, TILE, TILE - 10);
    if (tileAt(x, y + 1) !== '#') { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x * TILE, (y + 1) * TILE, TILE, 8); }
  }
  // coins
  for (const c of G.coins) {
    const s = Math.abs(Math.cos(T * 3 + c.b)), yy = c.y + Math.sin(T * 4 + c.b) * 2;
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(c.x, c.y + 9, 7, 3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#e8a400'; ctx.beginPath(); ctx.ellipse(c.x, yy, 8 * s + 1, 8, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd43b'; ctx.beginPath(); ctx.ellipse(c.x, yy, 6 * s + .5, 6, 0, 0, 7); ctx.fill();
  }
  // dropped gun
  if (G.gunDrop) {
    const g = G.gunDrop, pulse = 18 + Math.sin(T * 5) * 5;
    const grd = ctx.createRadialGradient(g.x, g.y, 2, g.x, g.y, pulse * 2);
    grd.addColorStop(0, 'rgba(77,163,255,.8)'); grd.addColorStop(1, 'rgba(77,163,255,0)');
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(g.x, g.y, pulse * 2, 0, 7); ctx.fill();
    drawGun(g.x - 8, g.y, T, '#8a8f99');
  }
  // stuck knives
  for (const f of G.fx) if (f.type === 'stuck') { ctx.globalAlpha = Math.min(1, f.t * 2); drawKnife(f.x, f.y, f.ang, f.skin, T); ctx.globalAlpha = 1; }
  // bodies
  for (const b of G.bodies) {
    ctx.fillStyle = 'rgba(160,0,0,.35)'; ctx.beginPath(); ctx.ellipse(b.x + 4, b.y + 6, 22, 15, .3, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.ang);
    ctx.fillStyle = shade(b.color, -.35); ctx.beginPath(); ctx.ellipse(0, 0, 18, 13, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#222'; ctx.lineWidth = 2; ctx.beginPath();
    for (const s of [-5, 5]) { ctx.moveTo(6, s - 3); ctx.lineTo(12, s + 3); ctx.moveTo(12, s - 3); ctx.lineTo(6, s + 3); }
    ctx.stroke(); ctx.restore();
  }
  // players (alive), sorted by y
  const al = G.ents.filter(e => e.alive).sort((a, b) => a.y - b.y);
  for (const e of al) drawEnt(e, T);
  for (const e of al) {
    ctx.font = '600 12px Fredoka, sans-serif'; ctx.textAlign = 'center';
    const lbl = e.isPlayer ? 'You' : e.name;
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillText(lbl, e.x + 1, e.y - 25);
    let nc = '#fff';
    if (G.phase === 'end' && e.role === 'murderer') nc = '#ff4d5e';
    if (e.isPlayer) nc = p_roleColor(e);
    ctx.fillStyle = nc; ctx.fillText(lbl, e.x, e.y - 26);
  }
  // projectiles
  for (const pr of G.proj) {
    if (pr.type === 'knife') drawKnife(pr.x, pr.y, pr.rot, pr.skin, T);
    else {
      ctx.strokeStyle = '#fff6a0'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath();
      const t0 = pr.trail[0] || pr; ctx.moveTo(t0.x, t0.y); ctx.lineTo(pr.x, pr.y); ctx.stroke();
    }
  }
  for (const f of G.fx) {
    if (f.type === 'blood') { ctx.fillStyle = `rgba(200,0,20,${Math.min(1, f.t * 2)})`; ctx.fillRect(f.x - 2, f.y - 2, 4, 4); }
    if (f.type === 'flash') { ctx.fillStyle = 'rgba(255,240,150,.9)'; ctx.beginPath(); ctx.arc(f.x, f.y, 9, 0, 7); ctx.fill(); }
  }
  ctx.restore();

  // offscreen gun arrow (for innocents)
  const p = G.player;
  if (G.gunDrop && p.alive && p.role === 'innocent') {
    const gx = G.gunDrop.x - cx, gy = G.gunDrop.y - cy;
    if (gx < 0 || gy < 0 || gx > W || gy > H) {
      const a = Math.atan2(gy - H / 2, gx - W / 2), R = Math.min(W, H) / 2 - 40;
      const ax = W / 2 + Math.cos(a) * R, ay = H / 2 + Math.sin(a) * R;
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(a); ctx.fillStyle = '#4da3ff';
      ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-10, -12); ctx.lineTo(-10, 12); ctx.fill(); ctx.restore();
      ctx.font = '700 13px Fredoka'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText('GUN', ax, ay - 18);
    }
  }
  // vignette
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.max(W, H) * .75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)'); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  // crosshair
  if (p.alive && (p.role === 'murderer' || p.hasGun) && G.phase === 'play') {
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 8, 0, 7);
    ctx.moveTo(mouse.x - 13, mouse.y); ctx.lineTo(mouse.x - 5, mouse.y); ctx.moveTo(mouse.x + 5, mouse.y); ctx.lineTo(mouse.x + 13, mouse.y); ctx.stroke();
  }
}
const p_roleColor = e => ({ murderer: '#ff4d5e', sheriff: '#4da3ff', hero: '#ffc233', innocent: '#5bd46a' })[e.role];
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const m = v => clamp(Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f), 0, 255);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
function drawEnt(e, T) {
  const bob = Math.sin(e.walk) * 1.5;
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(e.x, e.y + 13, 14, 5, 0, 0, 7); ctx.fill();
  ctx.save(); ctx.translate(e.x, e.y + bob); ctx.rotate(e.ang);
  // arms / weapon
  const out = e.weaponOut && (e.role === 'murderer' || e.hasGun);
  if (out && e.role === 'murderer') {
    const sw = e.swing > 0 ? Math.sin((1 - e.swing / .2) * Math.PI) * 1.2 : 0;
    ctx.save(); ctx.rotate(.6 - sw); drawKnifeLocal(18, 0, 0, e.knife, T); ctx.restore();
  } else if (out && e.hasGun) {
    drawGunLocal(14, 6, T, itemColor(e.gun, T));
  }
  // body (Roblox-y: torso + head)
  ctx.fillStyle = shade(e.color, -.3); ctx.beginPath(); ctx.ellipse(0, 0, 11, 17, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#f2c89b'; ctx.beginPath(); ctx.arc(4, -14, 5, 0, 7); ctx.arc(4, 14, 5, 0, 7); ctx.fill();
  ctx.fillStyle = '#f7d154'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.fill();
  ctx.fillStyle = e.color; ctx.beginPath(); ctx.arc(-3, 0, 10, Math.PI / 2, Math.PI * 1.5); ctx.fill(); // hair
  ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(6, -4, 1.8, 0, 7); ctx.arc(6, 4, 1.8, 0, 7); ctx.fill();
  ctx.restore();
  if (e.isPlayer) { ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, 22, 0, 7); ctx.stroke(); }
}
function drawKnifeLocal(x, y, a, skin, T) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.fillStyle = '#3b2616'; ctx.fillRect(-8, -2.5, 9, 5);
  ctx.fillStyle = itemColor(skin, T); ctx.beginPath(); ctx.moveTo(1, -4); ctx.lineTo(20, -1); ctx.lineTo(22, 1); ctx.lineTo(1, 4); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
}
function drawKnife(x, y, a, skin, T) { ctx.save(); ctx.translate(x, y); ctx.rotate(a); drawKnifeLocal(-8, 0, 0, skin, T); ctx.restore(); }
function drawGunLocal(x, y, T, col) {
  ctx.fillStyle = col; ctx.fillRect(x, y - 3, 20, 6);
  ctx.fillStyle = shade(col.startsWith('#') ? col : '#888888', -.4); ctx.fillRect(x, y - 3, 6, 10);
}
function drawGun(x, y, T, col) { drawGunLocal(x, y, T, col); }

// ===================== Input =====================
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (!G || G.phase !== 'play') return;
  const p = G.player; if (!p.alive) return;
  if (e.code === 'KeyQ' && p.role === 'murderer') tryThrow(p);
  if ((e.code === 'KeyE' || e.code === 'Digit1') && (p.role === 'murderer' || p.hasGun)) p.weaponOut = !p.weaponOut;
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { keys = {}; mouse.down = false; });
cv.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
cv.addEventListener('mousedown', e => {
  if (!G) return;
  const p = G.player;
  if (!p.alive) { // cycle spectate
    const alive = G.ents.filter(x => x.alive); if (alive.length) G.spec = alive[(alive.indexOf(G.spec) + 1) % alive.length]; return;
  }
  if (e.button === 0) mouse.down = true;
  if (e.button === 2 && G.phase === 'play' && p.role === 'murderer') tryThrow(p);
});
addEventListener('mouseup', e => { if (e.button === 0) mouse.down = false; });
cv.addEventListener('contextmenu', e => e.preventDefault());

// ===================== Lobby UI =====================
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function itemCard(it, opts = {}) {
  const rc = rarColor(it.r);
  return `<div class="item ${it.r === 'Chroma' ? 'chroma' : ''} ${opts.eq ? 'eq' : ''} ${opts.sel ? 'sel' : ''}" style="border-color:${rc}" ${opts.attr || ''}>
    <div class="ic" style="${it.col === 'chroma' ? '' : `text-shadow:0 0 12px ${it.col}`}">${it.type === 'knife' ? '🔪' : '🔫'}</div>
    <div class="nm">${esc(it.name)}</div><div class="rr" style="color:${rc}">${it.r}</div>${opts.noval ? '' : `<div class="vv">value ${it.val}</div>`}</div>`;
}
let curTab = 'play';
document.querySelectorAll('.tab').forEach(b => b.onclick = () => {
  curTab = b.dataset.tab;
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === b));
  document.querySelectorAll('.tabpage').forEach(x => x.classList.toggle('hide', x.id !== 'tab-' + curTab));
  renderLobby();
});
$('#mapSel').innerHTML = '<option value="-1">🎲 Random</option>' + MAPS.map((m, i) => `<option value="${i}">${m.name}</option>`).join('');
$('#playBtn').onclick = () => { tone(600, .1); startRound(+$('#mapSel').value); };
$('#endBtn').onclick = backToLobby;

function sortedInv() { return S.inv.slice().sort((a, b) => ITEM[b.id].val - ITEM[a.id].val); }
function renderLobby() {
  $('#coinPill').textContent = `💰 ${S.coins}`;
  $('#lvlPill').textContent = `Lv ${S.level}`;
  $('#xpFill').style.width = (S.xp / xpNeed(S.level) * 100) + '%';
  if (curTab === 'play') {
    const n = 12;
    const pm = S.mT / (S.mT + n - 1), ps = (1 - pm) * (S.sT / (S.sT + n - 2));
    $('#mChance').textContent = Math.round(pm * 100) + '%';
    $('#sChance').textContent = Math.round(ps * 100) + '%';
    const st = S.stats;
    $('#statsBox').innerHTML = [['Rounds', st.rounds], ['Wins', st.wins], ['Kills', st.kills], ['Deaths', st.deaths], ['Coins earned', st.coins], ['Unboxed', st.unboxed], ['Trades', st.trades]].map(([a, b]) => `<div><b>${b}</b>${a}</div>`).join('');
  } else if (curTab === 'inv') {
    $('#eqKnife').innerHTML = itemCard(equipped('knife'), { noval: true });
    $('#eqGun').innerHTML = itemCard(equipped('gun'), { noval: true });
    $('#invCount').textContent = `(${S.inv.length})`;
    const inv = sortedInv();
    $('#invGrid').innerHTML = inv.length ? inv.map(i => itemCard(ITEM[i.id], { eq: S.equip[ITEM[i.id].type] === i.u, attr: `data-u="${i.u}"` })).join('') : '<div class="muted">No items yet — go unbox some in the Shop 📦</div>';
    $('#invGrid').querySelectorAll('.item').forEach(el => el.onclick = () => {
      const inst = S.inv.find(i => i.u === +el.dataset.u), t = ITEM[inst.id].type;
      S.equip[t] = S.equip[t] === inst.u ? null : inst.u; save(); tone(800, .06); renderLobby();
    });
  } else if (curTab === 'shop') {
    $('#crates').innerHTML = CRATES.map(c => `<div class="crate"><div class="box">${c.icon}</div><h3>${c.name}</h3><p>${c.desc}</p><button class="btn" data-c="${c.id}" ${S.coins < c.price ? 'disabled' : ''}>💰 ${c.price}</button></div>`).join('');
    $('#crates').querySelectorAll('button').forEach(b => b.onclick = () => openCrate(CRATES.find(c => c.id === b.dataset.c)));
    const w = CRATES[0].w, tot = Object.values(w).reduce((a, b) => a + b, 0);
    $('#rates').innerHTML = RORDER.map(r => `<span style="color:${rarColor(r)}">${r} ${(w[r] / tot * 100).toFixed(1)}%</span>`).join('') + '<span class="muted">(Knife/Gun Box)</span>';
  } else if (curTab === 'trade') renderTrade();
}

// ---------- crates ----------
function openCrate(c) {
  if (S.coins < c.price) return;
  S.coins -= c.price;
  const win = rollItem(c.w, c.type);
  const inst = addItem(win.id); S.stats.unboxed++; save();
  const N = 45, WIN = 38, cards = [];
  for (let i = 0; i < N; i++) cards.push(i === WIN ? win : rollItem(c.w, c.type));
  const reel = $('#reel');
  reel.style.transition = 'none'; reel.style.transform = 'translateX(0)';
  reel.innerHTML = cards.map(it => itemCard(it, { noval: true })).join('');
  $('#unboxRes').textContent = ''; $('#unboxBtn').classList.add('hide');
  $('#unbox').classList.remove('hide');
  const wrapW = $('.reelwrap').clientWidth, step = 108;
  const target = WIN * step + 50 - wrapW / 2 + rand(-35, 35);
  let ticks = 0; const tickI = setInterval(() => { SFX.roll(); if (++ticks > 30) clearInterval(tickI); }, 130);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    reel.style.transition = 'transform 4.5s cubic-bezier(.12,.8,.2,1)';
    reel.style.transform = `translateX(${-target}px)`;
  }));
  setTimeout(() => {
    clearInterval(tickI);
    const big = RORDER.indexOf(win.r) >= 4;
    $('#unboxRes').innerHTML = `${big ? '🔥 ' : ''}You unboxed <span style="color:${rarColor(win.r)}">${esc(win.name)}</span> (${win.r})!${big ? ' 🔥' : ''}`;
    big ? SFX.win() : tone(880, .2, 'triangle', .06);
    $('#unboxBtn').classList.remove('hide');
    $('#unboxBtn').onclick = () => { $('#unbox').classList.add('hide'); renderLobby(); };
    renderLobby();
  }, 4700);
  renderLobby();
}

// ---------- trading ----------
const TRADER_LINES = {
  accept: ['W trade 🔥', 'deal ty!!', 'accepted, pleasure doing business 🤝', 'ok fine ur lucky lol', 'ez accept'],
  decline: ['nah thats a L for me 💀', 'add more pls', 'lowball 😭', 'bro thinks im new', 'nope. overpay or nothing'],
  gift: ['free stuff?? ty king 👑', 'omg ty 😭'],
  empty: ['u gotta offer something lol'],
};
let traders = [], curTrader = 0, offMine = [], offTheirs = [];
function genTraders() {
  const names = shuffle(BOT_NAMES).slice(0, 3);
  traders = names.map(n => {
    const inv = []; const k = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < k; i++) inv.push({ u: 'b' + Math.random().toString(36).slice(2), id: rollItem(CRATES[2].w).id });
    return { name: n, inv, greed: rand(1, 1.25) };
  });
  curTrader = 0; offMine = []; offTheirs = [];
}
genTraders();
const val = arr => arr.reduce((s, it) => s + ITEM[it.id].val, 0);
function renderTrade() {
  const tr = traders[curTrader];
  $('#traderTabs').innerHTML = traders.map((t, i) => `<button class="${i === curTrader ? 'active' : ''}" data-i="${i}">${esc(t.name)}</button>`).join('');
  $('#traderTabs').querySelectorAll('button').forEach(b => b.onclick = () => { curTrader = +b.dataset.i; offMine = []; offTheirs = []; $('#tradeChat').textContent = ''; renderTrade(); });
  $('#traderName').textContent = `${tr.name}'s items`;
  const mine = sortedInv();
  $('#trMine').innerHTML = mine.length ? mine.map(i => itemCard(ITEM[i.id], { sel: offMine.includes(i), attr: `data-u="${i.u}"` })).join('') : '<div class="muted">Nothing to trade yet</div>';
  $('#trTheirs').innerHTML = tr.inv.map(i => itemCard(ITEM[i.id], { sel: offTheirs.includes(i), attr: `data-u="${i.u}"` })).join('');
  $('#offMine').innerHTML = offMine.map(i => itemCard(ITEM[i.id], { attr: `data-u="${i.u}"` })).join('');
  $('#offTheirs').innerHTML = offTheirs.map(i => itemCard(ITEM[i.id], { attr: `data-u="${i.u}"` })).join('');
  const toggle = (list, inst) => { const k = list.indexOf(inst); if (k >= 0) list.splice(k, 1); else if (list.length < 4) list.push(inst); tone(700, .04); renderTrade(); };
  $('#trMine').querySelectorAll('.item').forEach(el => el.onclick = () => toggle(offMine, S.inv.find(i => String(i.u) === el.dataset.u)));
  $('#offMine').querySelectorAll('.item').forEach(el => el.onclick = () => toggle(offMine, offMine.find(i => String(i.u) === el.dataset.u)));
  $('#trTheirs').querySelectorAll('.item').forEach(el => el.onclick = () => toggle(offTheirs, tr.inv.find(i => i.u === el.dataset.u)));
  $('#offTheirs').querySelectorAll('.item').forEach(el => el.onclick = () => toggle(offTheirs, offTheirs.find(i => i.u === el.dataset.u)));
  const mv = val(offMine), tv = val(offTheirs);
  $('#myVal').textContent = `(value ${mv})`; $('#theirVal').textContent = `(value ${tv})`;
  const wfl = $('#wfl');
  if (!mv && !tv) { wfl.textContent = ''; }
  else { const r = tv / Math.max(1, mv); wfl.textContent = r > 1.1 ? 'W 🟢' : r < .9 ? 'L 🔴' : 'FAIR 🟡'; wfl.style.color = r > 1.1 ? '#5bd46a' : r < .9 ? '#ff4d5e' : '#ffc233'; }
  $('#sendTrade').disabled = !offMine.length && !offTheirs.length;
}
$('#sendTrade').onclick = () => {
  const tr = traders[curTrader], mv = val(offMine), tv = val(offTheirs), chat = $('#tradeChat');
  let ok = false, line;
  if (!offMine.length) line = pick(TRADER_LINES.empty);
  else if (!offTheirs.length) { ok = true; line = pick(TRADER_LINES.gift); }
  else if (mv >= tv * tr.greed) { ok = true; line = pick(TRADER_LINES.accept); }
  else line = pick(TRADER_LINES.decline);
  chat.innerHTML = `<span class="muted">${esc(tr.name)}:</span> ${esc(line)}`;
  if (ok) {
    for (const i of offMine) { S.inv.splice(S.inv.indexOf(i), 1); if (S.equip.knife === i.u) S.equip.knife = null; if (S.equip.gun === i.u) S.equip.gun = null; tr.inv.push({ u: 'b' + Math.random().toString(36).slice(2), id: i.id }); }
    for (const i of offTheirs) { tr.inv.splice(tr.inv.indexOf(i), 1); addItem(i.id); }
    S.stats.trades++; save(); offMine = []; offTheirs = []; SFX.win();
  } else tone(200, .25, 'sawtooth', .04);
  renderLobby();
};
$('#refreshTraders').onclick = () => { genTraders(); $('#tradeChat').textContent = ''; renderTrade(); };

// ===================== Loop =====================
let last = performance.now();
function frame(t) {
  const dt = Math.min(.05, (t - last) / 1000); last = t;
  if (G) update(dt);
  render();
  requestAnimationFrame(frame);
}
renderLobby();
requestAnimationFrame(frame);
