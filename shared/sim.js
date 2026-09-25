// Shared game simulation. Runs on the server (authoritative, online) and in the browser (offline practice).
// No DOM access in here: everything the UI needs goes out through snapshots and events.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Sim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };
  const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v)) ? v : d;

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
    // exclusive: only from codes/admin, never from crates or traders
    I('k20', 'knife', 'Sussy Slasher', 'Ancient', '#39ff14', 1, { val: 69420, exclusive: true, noCooldown: true }),
    I('g15', 'gun', 'Bruh Blaster', 'Ancient', '#ff69b4', 1, { val: 69420, exclusive: true, noCooldown: true }),
    I('k21', 'knife', 'Chroma Sussy Slasher', 'Chroma', 'chroma', 1, { val: 69420, exclusive: true, noCooldown: true }),
    I('g17', 'gun', 'Chroma Bruh Blaster', 'Chroma', 'chroma', 1, { val: 69420, exclusive: true, noCooldown: true }),
    I('k22', 'knife', 'Ginger Scope Knife', 'Ancient', '#c9743a', 1, { val: 10000000000000, exclusive: true, noCooldown: true, long: true }),
    I('k23', 'knife', 'Chroma Ginger Scope Knife', 'Chroma', 'chroma', 1, { val: 1e48, exclusive: true, noCooldown: true, long: true }),
    // Summer Event rewards (50 kills)
    I('k24', 'knife', 'Sunburn', 'Godly', '#ff9f1c', 1, { val: 5000, exclusive: true }),
    I('g18', 'gun', 'Splash Blaster', 'Godly', '#2ec4f1', 1, { val: 5000, exclusive: true }),
    // only from the Sum Box
    I('k25', 'knife', 'Chroma Sunburn', 'Chroma', 'chroma', 1, { val: 8000, exclusive: true }),
    I('g19', 'gun', 'Chroma Splash Blaster', 'Chroma', 'chroma', 1, { val: 8000, exclusive: true }),
    // Halloween: Death Set (gun from the Halloween Event, knives from the Halloween Box)
    I('g20', 'gun', 'Death Gun', 'Ancient', '#7b2cbf', 1, { val: 6000, exclusive: true }),
    I('k26', 'knife', 'Death Knife', 'Ancient', '#9d4edd', 1, { val: 3000, exclusive: true }),
    I('k27', 'knife', 'Chroma Death Knife', 'Chroma', 'chroma', 1, { val: 12000, exclusive: true }),
    I('g22', 'gun', 'Chroma Death Gun', 'Chroma', 'chroma', 1, { val: 24000, exclusive: true }),
    // Raygun Set: 3,999 coins in the Shop, or the secret code
    I('g21', 'gun', 'Raygun', 'Ancient', '#39ff14', 1, { val: 4000, exclusive: true, sound: 'ray', noCooldown: true }),
    I('k28', 'knife', 'Ray Blade', 'Ancient', '#00e5ff', 1, { val: 4000, exclusive: true }),
    I('g16', 'gun', 'Chroma Ginger Scope', 'Chroma', 'chroma', 1, { val: 1e48, exclusive: true, noCooldown: true, long: true }),
    I('g14', 'gun', 'Ginger Scope', 'Ancient', '#c9743a', 1, { val: 10000000000000, exclusive: true, noCooldown: true, long: true }),
  ];
  const ITEM = Object.fromEntries(ITEMS.map(i => [i.id, i]));
  const CRATES = [
    { id: 'knifebox', name: 'Knife Box', icon: '🗡️', price: 60, type: 'knife', desc: 'A random knife skin.', w: { Common: 45, Uncommon: 28, Rare: 16, Legendary: 8, Godly: 2.5, Ancient: 0.4, Chroma: 0.1 } },
    { id: 'gunbox', name: 'Gun Box', icon: '🔫', price: 60, type: 'gun', desc: 'A random gun skin.', w: { Common: 45, Uncommon: 28, Rare: 16, Legendary: 8, Godly: 2.5, Ancient: 0.4, Chroma: 0.1 } },
    { id: 'sumbox', name: 'Sum Box', icon: '☀️', price: 200, type: null, desc: '5% chance at a Chroma Sunburn or Chroma Splash Blaster 🌈', specials: [{ id: 'k25', chance: .025 }, { id: 'g19', chance: .025 }], w: { Common: 18, Uncommon: 30, Rare: 26, Legendary: 16, Godly: 7.5, Ancient: 2, Chroma: 0.5 } },
    { id: 'halloween', name: 'Halloween Box', icon: '🎃', price: 250, type: null, desc: 'Death Set + Chroma Death Set inside 💀 10% Death Knife, 5% Death Gun, 2% Chroma Death Knife, 1% Chroma Death Gun', specials: [{ id: 'k26', chance: .10 }, { id: 'g20', chance: .05 }, { id: 'k27', chance: .02 }, { id: 'g22', chance: .01 }],
      // owner luck: 95% for a Death item
      luckySpecials: [{ id: 'k26', chance: .30 }, { id: 'g20', chance: .30 }, { id: 'k27', chance: .175 }, { id: 'g22', chance: .175 }], w: { Common: 18, Uncommon: 30, Rare: 26, Legendary: 16, Godly: 7.5, Ancient: 2, Chroma: 0.5 } },
    { id: 'mystery', name: 'Mystery Box', icon: '🎁', price: 175, type: null, desc: 'Way better odds. Godly hunting 👀', w: { Common: 18, Uncommon: 30, Rare: 26, Legendary: 16, Godly: 7.5, Ancient: 2, Chroma: 0.5 } },
  ];
  // a crate roll: its special items first (if it has any), otherwise by rarity
  function rollCrate(c, lucky) {
    let x = Math.random();
    for (const sp of (lucky && c.luckySpecials) || c.specials || []) { if (x < sp.chance) return ITEM[sp.id]; x -= sp.chance; }
    return rollItem(c.w, c.type);
  }
  function rollItem(weights, type) {
    let tot = 0; for (const r in weights) tot += weights[r];
    let x = Math.random() * tot, rar = 'Common';
    for (const r in weights) { x -= weights[r]; if (x <= 0) { rar = r; break; } }
    let pool = ITEMS.filter(i => !i.nodrop && !i.exclusive && i.r === rar && (!type || i.type === type));
    if (!pool.length) pool = ITEMS.filter(i => !i.nodrop && !i.exclusive && (!type || i.type === type));
    return pick(pool);
  }

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

    {
      name: 'Bank', floor: ['#e8e1cf', '#dfd7c2'], wall: '#6b5d45', wallTop: '#8c7a5a', rows: [
        '####################################',
        '#......#..........##..........#....#',
        '#.BBB..#..TTTTTT..##..TTTTTT..#.BB.#',
        '#......D..........DD..........D....#',
        '#......#..........##..........#....#',
        '#.BBB..#....P.....##.....P....#.BB.#',
        '#......#..........##..........#....#',
        '####D######D######..######D#####D###',
        '#..................................#',
        '#..TT....TT....TT......TT....TT....#',
        '#..................................#',
        '#..................................#',
        '#.....######D######..######D######.#',
        '#.....#..........#....#..........#.#',
        '#.....#.BBB..BBB.#....#.TTT..TTT.#.#',
        '#..P..D..........#....#..........D.#',
        '#.....#.BBB..BBB.#....#.TTT..TTT.#.#',
        '#.....#..........#.P..#..........#.#',
        '#.....############....############.#',
        '#..................................#',
        '#..TT......TT........TT......TT....#',
        '#.......P..........P.........P.....#',
        '#..................................#',
        '####################################',
      ]
    },
    {
      name: 'Hospital', floor: ['#e6f0f2', '#dbe8eb'], wall: '#5f7d86', wallTop: '#86a7b0', rows: [
        '####################################',
        '#.....#.....#.....#.....#..........#',
        '#.BB..#.BB..#.BB..#.BB..#..TTTTT...#',
        '#.....#.....#.....#.....#..........#',
        '#..P..#..P..#..P..#..P..#..........#',
        '##D#####D#####D#####D####D##########',
        '#..................................#',
        '#..................................#',
        '#...TTTTTT..........TTTTTT.........#',
        '#..................................#',
        '#########D########..##########D#####',
        '#.........#..............#.........#',
        '#..BBBB...#...TT....TT...#...BBBB..#',
        '#.........D..............D.........#',
        '#..P......#...TT....TT...#......P..#',
        '#.........#..............#.........#',
        '#####D#####..............#####D#####',
        '#..................................#',
        '#..BB..BB..BB........BB..BB..BB....#',
        '#..................................#',
        '#.....TT.......P..........TT.......#',
        '#..................................#',
        '#..................................#',
        '####################################',
      ]
    },
    {
      name: 'Factory', floor: ['#8d8f94', '#85878c'], wall: '#3a3d42', wallTop: '#565a61', rows: [
        '########################################',
        '#......................................#',
        '#..TTTTTTTTTTTT......TTTTTTTTTTTT......#',
        '#......................................#',
        '#..........##########..........BBB.....#',
        '#..P.......#........#..........BBB.....#',
        '#..........#..TTTT..D..................#',
        '#..........#........#......TTTTTTTTT...#',
        '#####D######........#..................#',
        '#..........##########..........P.......#',
        '#......................................#',
        '#..BB..BB..BB............#####D#####...#',
        '#........................#.........#...#',
        '#..TTTTTTTTTTTT..........D..TT.TT..#...#',
        '#........................#.........#...#',
        '#........................#..BB.BB..#...#',
        '#...........P............###########...#',
        '#......................................#',
        '#..TTTTTTTTTTTT......TTTTTTTTTTTT......#',
        '#......................................#',
        '#....##########.............P..........#',
        '#....#........#........................#',
        '#....#..BBBB..D.......BB..BB..BB.......#',
        '#....#........#........................#',
        '#....##########........................#',
        '########################################',
      ]
    },
    {
      name: 'Ice Castle', floor: ['#d6f1ff', '#c8eafc'], wall: '#4a7fa8', wallTop: '#7fb3d9', rows: [
        '####################################',
        '#........#................#........#',
        '#..BB....#......TTTT......#....BB..#',
        '#........D................D........#',
        '#..P.....#................#.....P..#',
        '#........#......TTTT......#........#',
        '#####D####................####D#####',
        '#..................................#',
        '#....TT........######........TT....#',
        '#..............#....#..............#',
        '#..............D....D..............#',
        '#..............#.BB.#..............#',
        '#....TT........######........TT....#',
        '#..................................#',
        '#####D####................####D#####',
        '#........#......PPPP......#........#',
        '#..BB....#................#....BB..#',
        '#........D................D........#',
        '#..P.....#......TTTT......#.....P..#',
        '#........#................#........#',
        '#........#................#........#',
        '#........#.......P........#........#',
        '#........#................#........#',
        '####################################',
      ]
    },
  ];
  const TILE = 48;
  const SOLID_MOVE = new Set(['#', 'T', 'P', 'B']);
  const SOLID_SIGHT = new Set(['#', 'B']);
  const mapCache = {};
  function buildMap(idx) {
    if (mapCache[idx]) return mapCache[idx];
    const m = MAPS[idx], H = m.rows.length, W = Math.max(...m.rows.map(r => r.length));
    const grid = [];
    for (let y = 0; y < H; y++) {
      const row = [];
      for (let x = 0; x < W; x++) {
        let ch = m.rows[y][x] || '#';
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) ch = '#';
        if (ch === 'D') ch = '.';
        row.push(ch);
      }
      grid.push(row);
    }
    const M = { idx, name: m.name, floor: m.floor, wall: m.wall, wallTop: m.wallTop, W, H, grid, reach: [] };
    // largest connected walkable region = where people spawn & coins drop
    const seen = new Uint8Array(W * H); let best = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (seen[y * W + x] || moveSolid(M, x, y)) continue;
      const comp = [], st = [[x, y]]; seen[y * W + x] = 1;
      while (st.length) {
        const [cx, cy] = st.pop(); comp.push([cx, cy]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (!moveSolid(M, nx, ny) && !seen[ny * W + nx]) { seen[ny * W + nx] = 1; st.push([nx, ny]); }
        }
      }
      if (comp.length > best.length) best = comp;
    }
    M.reach = best;
    return (mapCache[idx] = M);
  }
  const tileAt = (M, tx, ty) => (tx < 0 || ty < 0 || tx >= M.W || ty >= M.H) ? '#' : M.grid[ty][tx];
  const moveSolid = (M, tx, ty) => SOLID_MOVE.has(tileAt(M, tx, ty));
  const moveSolidAt = (M, x, y) => moveSolid(M, Math.floor(x / TILE), Math.floor(y / TILE));
  const sightSolidAt = (M, x, y) => SOLID_SIGHT.has(tileAt(M, Math.floor(x / TILE), Math.floor(y / TILE)));
  const randReach = M => { const [tx, ty] = pick(M.reach); return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 }; };

  function los(M, ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / 10);
    for (let i = 1; i < n; i++) { const t = i / n; if (sightSolidAt(M, ax + (bx - ax) * t, ay + (by - ay) * t)) return false; }
    return true;
  }
  function clearLine(M, ax, ay, bx, by, r) {
    const d = Math.hypot(bx - ax, by - ay); if (d < 1) return true;
    const nx = -(by - ay) / d * r, ny = (bx - ax) / d * r, n = Math.ceil(d / 8);
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      if (moveSolidAt(M, x, y) || moveSolidAt(M, x + nx, y + ny) || moveSolidAt(M, x - nx, y - ny)) return false;
    }
    return true;
  }
  function astar(M, sx, sy, gx, gy) {
    const MW = M.W, s = Math.floor(sy / TILE) * MW + Math.floor(sx / TILE);
    const gtx = Math.floor(gx / TILE), gty = Math.floor(gy / TILE);
    if (moveSolid(M, gtx, gty)) return null;
    const goal = gty * MW + gtx; if (s === goal) return [];
    const N = MW * M.H, g = new Float32Array(N).fill(1e9), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
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
        if (moveSolid(M, nx, ny)) continue;
        if (dx && dy && (moveSolid(M, cx + dx, cy) || moveSolid(M, cx, cy + dy))) continue;
        const ni = ny * MW + nx; if (closed[ni]) continue;
        const ng = g[cur] + (dx && dy ? 1.414 : 1);
        if (ng < g[ni]) { if (g[ni] >= 1e9) open.push(ni); g[ni] = ng; came[ni] = cur; }
      }
    }
    if (came[goal] < 0) return null;
    const path = []; let c = goal;
    while (c !== s && c >= 0) { path.push({ x: (c % MW) * TILE + TILE / 2, y: ((c / MW) | 0) * TILE + TILE / 2 }); c = came[c]; }
    path.reverse(); path[path.length - 1] = { x: gx, y: gy };
    const out = []; let px = sx, py = sy, i = 0;
    while (i < path.length) {
      let j = path.length - 1;
      while (j > i && !clearLine(M, px, py, path[j].x, path[j].y, 15)) j--;
      out.push(path[j]); px = path[j].x; py = path[j].y; i = j + 1;
    }
    return out;
  }
  function collide(M, e) {
    const r = e.r, x0 = Math.floor((e.x - r) / TILE), x1 = Math.floor((e.x + r) / TILE), y0 = Math.floor((e.y - r) / TILE), y1 = Math.floor((e.y + r) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (!moveSolid(M, tx, ty)) continue;
      const cx = clamp(e.x, tx * TILE, tx * TILE + TILE), cy = clamp(e.y, ty * TILE, ty * TILE + TILE);
      const dx = e.x - cx, dy = e.y - cy, d2 = dx * dx + dy * dy;
      if (d2 < r * r) {
        if (d2 === 0) { e.x += 1; continue; }
        const d = Math.sqrt(d2); e.x += dx / d * (r - d); e.y += dy / d * (r - d);
      }
    }
  }
  // moves e by (dx,dy)*spd*dt in small substeps so nothing tunnels through walls
  function moveEnt(M, e, dx, dy, dt, spd) {
    const ox = e.x, oy = e.y, total = Math.hypot(dx, dy) * spd * dt, steps = Math.max(1, Math.ceil(total / 8));
    for (let s = 0; s < steps; s++) {
      e.x += dx * spd * dt / steps; e.y += dy * spd * dt / steps;
      collide(M, e); collide(M, e);
    }
    e.vx = (e.x - ox) / Math.max(dt, 1e-4); e.vy = (e.y - oy) / Math.max(dt, 1e-4);
    if (dx || dy) e.walk = (e.walk || 0) + dt * 12;
  }

  // ===================== Round =====================
  const BAG_MAX = 40, ROUND_TIME = 180, INTRO_TIME = 4, MAX_PLAYERS = 12, PLAYER_SPEED = 190, BOT_SPEED = 172;
  const BOT_NAMES = ['xX_Slayer_Xx', 'noob_123', 'BaconHair', 'Guest_1337', 'coolkid2009', 'pizzalover', 'ItsYaBoi', 'sussybaka', 'MM2Pro', 'KnifeKing', 'ChillGamer', 'OofMaster', 'godly_hunter', 'tradeMeHarv', 'lil_ninja', 'JustVibin', 'BloxBurger', 'nikilis_fan', 'GamerGrl', 'sheriffOrElse'];
  const COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#748ffc', '#da77f2', '#f783ac', '#e8e8e8', '#a9744f', '#63e6be'];

  function botSkin(type) { return Math.random() < .5 ? (type === 'knife' ? 'k0' : 'g0') : rollItem(CRATES[2].w, type).id; }

  function mkEnt(id, o) {
    return {
      id, pid: o.pid || null, name: o.name, human: !!o.human, color: o.color, x: 0, y: 0, vx: 0, vy: 0, r: 15, ang: rand(0, 6.28),
      role: 'innocent', startRole: 'innocent', alive: true, hasGun: false, weaponOut: false, atkCd: 0, throwCd: 0, swing: 0, bag: 0, kills: 0,
      speed: o.human ? PLAYER_SPEED : BOT_SPEED, walk: 0, budget: 0,
      knife: ITEM[o.knife] && ITEM[o.knife].type === 'knife' ? o.knife : 'k0', gun: ITEM[o.gun] && ITEM[o.gun].type === 'gun' ? o.gun : 'g0',
      mT: Math.max(1, num(o.mT, 1)), sT: Math.max(1, num(o.sT, 1)),
      inp: null, lastThr: 0, lastTog: 0,
      ai: { path: [], pathT: 0, goal: null, know: null, lastSeen: null, react: 0, grace: rand(12, 24), stuckT: 0, lx: 0, ly: 0, brave: Math.random() < .25, fleeT: 0, target: null, retarget: 0, noticeT: 0, wanderT: 0, coin: null },
    };
  }

  function weightedPick(list, w) {
    const tot = list.reduce((s, e) => s + w(e), 0); let x = Math.random() * tot;
    for (const e of list) { x -= w(e); if (x <= 0) return e; }
    return list[list.length - 1];
  }

  // players: [{pid, name, color?, knife, gun, mT, sT, human:true}] — bots fill the rest up to MAX_PLAYERS
  function createRound(opts) {
    let mapIdx = opts.mapIdx;
    if (!(mapIdx >= 0 && mapIdx < MAPS.length)) mapIdx = Math.floor(Math.random() * MAPS.length);
    const M = buildMap(mapIdx);
    const R = { M, mapIdx, ents: [], coins: [], proj: [], bodies: [], gunDrop: null, time: ROUND_TIME, phase: 'intro', introT: INTRO_TIME, coinT: 0, t: 0, endT: 0, events: [], heroName: null, winner: null, results: null, nextId: 1 };
    const cols = shuffle(COLORS);
    const humans = (opts.players || []).slice(0, MAX_PLAYERS);
    humans.forEach((p, i) => R.ents.push(mkEnt(R.nextId++, { ...p, human: true, color: p.color || cols[i % cols.length] })));
    const taken = new Set(humans.map(h => h.name.toLowerCase()));
    const names = shuffle(BOT_NAMES).filter(n => !taken.has(n.toLowerCase()));
    const fill = opts.fillBots === false ? 0 : MAX_PLAYERS - R.ents.length;
    for (let i = 0; i < fill; i++) R.ents.push(mkEnt(R.nextId++, { name: names[i % names.length], color: cols[(humans.length + i) % cols.length], knife: botSkin('knife'), gun: botSkin('gun') }));
    // spread-out spawns
    const spots = shuffle(M.reach), used = [];
    for (const e of R.ents) {
      let best = null;
      for (let k = 0; k < spots.length && k < 200; k++) {
        const [tx, ty] = spots[k], c = { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
        if (used.every(u => dist(u, c) > 170)) { best = c; spots.splice(k, 1); break; }
      }
      best = best || randReach(M); used.push(best); e.x = best.x; e.y = best.y;
    }
    // roles: MM2-style tickets (humans grow theirs each round they miss out)
    const m = weightedPick(R.ents, e => e.mT); m.role = 'murderer';
    const rest = R.ents.filter(e => e !== m);
    const s = weightedPick(rest, e => e.sT); s.role = 'sheriff'; s.hasGun = true;
    for (const e of R.ents) e.startRole = e.role;
    R.murderer = m; R.sheriffName = s.name;
    for (let i = 0; i < 14; i++) spawnCoin(R);
    return R;
  }

  function emit(R, ev) { R.events.push(ev); }
  function spawnCoin(R) {
    for (let k = 0; k < 10; k++) {
      const c = randReach(R.M); c.x = Math.round(c.x + rand(-12, 12)); c.y = Math.round(c.y + rand(-12, 12));
      if (R.coins.every(o => dist(o, c) > 70)) { R.coins.push(c); return; }
    }
  }
  const entById = (R, id) => R.ents.find(e => e.id === id);
  const gunHolder = R => R.ents.find(e => e.alive && e.hasGun);

  // ---------- combat ----------
  // skins with noCooldown attack almost nonstop (a tiny gap stops one shot per server tick)
  const fast = id => !!(ITEM[id] && ITEM[id].noCooldown);
  function tryStab(R, e) {
    if (e.role !== 'murderer' || !e.alive || e.atkCd > 0) return;
    e.weaponOut = true; e.atkCd = fast(e.knife) ? .15 : .5; e.swing = .15;
    emit(R, { t: 'sfx', s: 'stab', x: e.x, y: e.y });
    for (const o of R.ents) {
      if (o === e || !o.alive) continue;
      if (dist(e, o) < e.r + o.r + 26 && angDiff(Math.atan2(o.y - e.y, o.x - e.x), e.ang) < 1.4) { kill(R, o, e); break; }
    }
  }
  function tryThrow(R, e) {
    if (e.role !== 'murderer' || !e.alive || e.throwCd > 0) return;
    e.weaponOut = true; e.throwCd = fast(e.knife) ? .25 : 3; e.atkCd = fast(e.knife) ? .1 : .4;
    const sp = 720;
    R.proj.push({ type: 'knife', x: e.x + Math.cos(e.ang) * 18, y: e.y + Math.sin(e.ang) * 18, vx: Math.cos(e.ang) * sp, vy: Math.sin(e.ang) * sp, owner: e, life: 1.1, skin: e.knife });
    emit(R, { t: 'sfx', s: 'throw', x: e.x, y: e.y });
  }
  function tryShoot(R, e) {
    if (!e.hasGun || !e.alive || e.atkCd > 0) return;
    e.weaponOut = true; e.atkCd = fast(e.gun) ? .12 : 2.2;
    const sp = 1600;
    const muzzle = ITEM[e.gun] && ITEM[e.gun].long ? 52 : 22;
    R.proj.push({ type: 'bullet', skin: e.gun, x: e.x + Math.cos(e.ang) * muzzle, y: e.y + Math.sin(e.ang) * muzzle, vx: Math.cos(e.ang) * sp, vy: Math.sin(e.ang) * sp, owner: e, life: ITEM[e.gun] && ITEM[e.gun].long ? 1.1 : .55 }); // scoped guns shoot twice as far
    emit(R, { t: 'fx', k: 'flash', x: e.x + Math.cos(e.ang) * (muzzle + 6), y: e.y + Math.sin(e.ang) * (muzzle + 6) });
    emit(R, { t: 'sfx', s: ITEM[e.gun] && ITEM[e.gun].sound === 'ray' ? 'ray' : 'shoot', x: e.x, y: e.y });
  }
  function dropGun(R, x, y) {
    R.gunDrop = { x: Math.round(x), y: Math.round(y) };
    emit(R, { t: 'gunDrop' });
  }
  function addBody(R, e) { R.bodies.push({ id: e.id, x: Math.round(e.x), y: Math.round(e.y), a: +e.ang.toFixed(2) }); }
  function kill(R, v, k) {
    if (!v.alive || v.god) return;
    v.alive = false; v.weaponOut = false;
    addBody(R, v);
    emit(R, { t: 'fx', k: 'blood', x: v.x, y: v.y });
    emit(R, { t: 'sfx', s: 'die', x: v.x, y: v.y });
    if (v.hasGun) { v.hasGun = false; dropGun(R, v.x, v.y); }
    if (k) {
      k.kills++;
      if (k.role === 'murderer') {
        if (!k.human) { k.ai.grace = rand(3, 8); k.ai.target = null; } // lay low after a kill
        for (const b of R.ents) if (!b.human && b.alive && b !== k && dist(b, k) < 420 && los(R.M, b.x, b.y, k.x, k.y)) { b.ai.know = k; b.ai.lastSeen = { x: k.x, y: k.y }; }
      } else if (v.role !== 'murderer' && k.alive && !k.god) {
        // sheriff/hero shot an innocent → they die too
        emit(R, { t: 'badShot', name: k.name, id: k.id });
        k.alive = false; k.weaponOut = false;
        addBody(R, k);
        if (k.hasGun) { k.hasGun = false; dropGun(R, k.x, k.y); }
        emit(R, { t: 'died', to: k.id, how: 'badShot' });
      }
    }
    emit(R, { t: 'died', to: v.id, how: k ? (k.role === 'murderer' ? 'murdered' : 'shot') : 'died', by: k ? k.name : null });
    if (v.role === 'murderer') emit(R, { t: 'murdererDown', by: k ? k.name : null, byId: k ? k.id : null });
  }

  // ===================== Bots =====================
  function setGoal(R, b, x, y, force) {
    const ai = b.ai;
    if (!force && ai.goal && ai.pathT > 0 && Math.hypot(ai.goal.x - x, ai.goal.y - y) < 48) return;
    ai.goal = { x, y }; ai.pathT = rand(.45, .75);
    if (clearLine(R.M, b.x, b.y, x, y, 15)) ai.path = [{ x, y }];
    else ai.path = astar(R.M, b.x, b.y, x, y) || [];
  }
  function steer(b) {
    const p = b.ai.path;
    while (p.length && Math.hypot(p[0].x - b.x, p[0].y - b.y) < 10) p.shift();
    if (!p.length) return [0, 0];
    const dx = p[0].x - b.x, dy = p[0].y - b.y, d = Math.hypot(dx, dy) || 1;
    return [dx / d, dy / d];
  }
  function nearestCoin(R, b) {
    let best = null, bd = 1e9;
    for (const c of R.coins) { const d = dist(b, c); if (d < bd) { bd = d; best = c; } }
    return best;
  }
  function wander(R, b, dt) {
    const ai = b.ai; ai.wanderT -= dt;
    if (ai.wanderT <= 0 || !ai.path.length) { const t = randReach(R.M); setGoal(R, b, t.x, t.y, true); ai.wanderT = rand(3, 7); }
  }
  function collect(R, b, dt) {
    if (b.bag >= BAG_MAX || !R.coins.length) return wander(R, b, dt);
    if (!b.ai.coin || !R.coins.includes(b.ai.coin) || b.ai.pathT <= 0) b.ai.coin = nearestCoin(R, b);
    if (b.ai.coin) setGoal(R, b, b.ai.coin.x, b.ai.coin.y);
  }

  function botThink(R, b, dt) {
    const ai = b.ai, M = R.M; ai.pathT -= dt;
    let spd = b.speed;
    if (b.role !== 'murderer') {
      const m = R.murderer;
      if (m.alive && m.weaponOut && dist(b, m) < 520 && los(M, b.x, b.y, m.x, m.y)) {
        ai.noticeT += dt;
        if (ai.noticeT > .6 && ai.know !== m) { ai.know = m; ai.react = rand(.3, .7); }
      } else ai.noticeT = 0;
      if (ai.know && !ai.know.alive) ai.know = null;
    }

    if (b.role === 'murderer') {
      ai.grace -= dt;
      if (ai.grace > 0) { b.weaponOut = false; collect(R, b, dt); }
      else {
        ai.retarget -= dt;
        const gh = gunHolder(R);
        if (!ai.target || !ai.target.alive || ai.retarget <= 0) {
          let best = null, bd = 1e9;
          for (const o of R.ents) {
            if (o === b || !o.alive) continue;
            let d = R.gunDrop ? dist(b, o) * .4 + dist(o, R.gunDrop) : dist(b, o); // guard the dropped gun
            if (o.hasGun && o.weaponOut) d += 250; // avoid an alert gun holder a bit
            if (d < bd) { bd = d; best = o; }
          }
          ai.target = best; ai.retarget = rand(1.5, 3);
        }
        const t = ai.target;
        if (t) {
          const d = dist(b, t), see = los(M, b.x, b.y, t.x, t.y);
          // smart murderer: don't pull the knife while the gun holder can see you (unless they're the target)
          const watched = gh && gh !== b && gh !== t && dist(gh, b) < 600 && los(M, gh.x, gh.y, b.x, b.y);
          b.weaponOut = d < 140 && see && !watched;
          if (watched && d < 140) ai.retarget = 0;
          if (b.weaponOut) spd = 196;
          if (see) b.ang = Math.atan2(t.y - b.y, t.x - b.x);
          if (d < b.r + t.r + 22 && see && !watched) tryStab(R, b);
          else if (see && !watched && d > 130 && d < 430 && b.throwCd <= 0 && Math.random() < dt * (t.hasGun ? 2.5 : .9)) {
            const lead = d / 720;
            b.ang = Math.atan2(t.y + t.vy * lead - b.y, t.x + t.vx * lead - b.x) + rand(-.08, .08);
            tryThrow(R, b);
          }
          setGoal(R, b, t.x, t.y);
        }
        if (gh && gh !== b && gh.weaponOut && los(M, b.x, b.y, gh.x, gh.y) && dist(b, gh) < 450 && b.throwCd <= 0 && Math.random() < dt * 2) {
          b.ang = Math.atan2(gh.y - b.y, gh.x - b.x); tryThrow(R, b);
        }
        // gun pointed at you → juke sideways
        if (gh && gh !== b && gh.weaponOut && dist(b, gh) < 700 && los(M, b.x, b.y, gh.x, gh.y)) {
          ai.dodgeT = (ai.dodgeT || 0) - dt;
          if (ai.dodgeT <= 0) { ai.dodgeT = rand(.25, .5); ai.dodgeS = Math.random() < .5 ? 1 : -1; }
          const a = Math.atan2(gh.y - b.y, gh.x - b.x) + ai.dodgeS * Math.PI / 2;
          const tx = b.x + Math.cos(a) * 60, ty = b.y + Math.sin(a) * 60;
          if (!moveSolidAt(M, tx, ty)) { ai.path = [{ x: tx, y: ty }]; ai.goal = null; }
          else ai.dodgeS *= -1;
          spd = 196;
        }
      }
    } else if (b.hasGun) {
      const k = ai.know;
      if (k && k.alive) {
        const see = los(M, b.x, b.y, k.x, k.y) && dist(b, k) < 750;
        if (see) {
          ai.lastSeen = { x: k.x, y: k.y };
          b.weaponOut = true;
          const d = dist(b, k), lead = d / 1600;
          b.ang = Math.atan2(k.y + k.vy * lead - b.y, k.x + k.vx * lead - b.x);
          ai.react -= dt;
          if (ai.react <= 0 && b.atkCd <= 0) { b.ang += rand(-1, 1) * (0.07 + d / 2500) * (b.role === 'hero' ? 1.8 : 1); tryShoot(R, b); ai.react = rand(.4, .9); }
          if (d < 170) setGoal(R, b, b.x - (k.x - b.x), b.y - (k.y - b.y));
          else { ai.path = []; ai.goal = null; }
        } else {
          ai.react = Math.max(ai.react, rand(.35, .6));
          const t = ai.lastSeen || k; setGoal(R, b, t.x, t.y);
          if (ai.lastSeen && dist(b, ai.lastSeen) < 30) { ai.lastSeen = null; ai.know = Math.random() < .5 ? k : null; } // lost them
        }
      } else { b.weaponOut = false; collect(R, b, dt); }
    } else {
      const k = ai.know;
      ai.fleeT -= dt;
      if (k && k.alive && dist(b, k) < 400 && (dist(b, k) < 180 || los(M, b.x, b.y, k.x, k.y))) {
        if (ai.fleeT <= 0 || !ai.path.length) {
          let best = null, bs = -1e9;
          for (let i = 0; i < 14; i++) {
            const c = randReach(M), s = dist(c, k) * 1.2 - dist(c, b) * .6;
            const pen = angDiff(Math.atan2(c.y - b.y, c.x - b.x), Math.atan2(k.y - b.y, k.x - b.x)) < .8 ? 400 : 0;
            if (s - pen > bs) { bs = s - pen; best = c; }
          }
          setGoal(R, b, best.x, best.y, true); ai.fleeT = rand(.9, 1.5);
        }
      } else if (R.gunDrop && (ai.brave || ai.know) && dist(b, R.gunDrop) < 800) setGoal(R, b, R.gunDrop.x, R.gunDrop.y);
      else collect(R, b, dt);
    }

    const [dx, dy] = steer(b);
    if (dx || dy) {
      ai.stuckT += dt;
      if (ai.stuckT > .8) { if (Math.hypot(b.x - ai.lx, b.y - ai.ly) < 10) { ai.pathT = 0; ai.path = []; const t = randReach(M); setGoal(R, b, t.x, t.y, true); } ai.stuckT = 0; ai.lx = b.x; ai.ly = b.y; }
      if (!(b.weaponOut && (b.role === 'murderer' || b.hasGun))) b.ang = Math.atan2(dy, dx);
    }
    moveEnt(M, b, dx, dy, dt, spd);
  }

  // ===================== Humans =====================
  // inp: {x, y, a, atk:bool, thr:int, tog:int}. x/y is where the client predicts it is;
  // the server only moves the player toward it at legal speed, through collision.
  function setInput(R, id, inp) {
    const e = entById(R, id);
    if (!e || !e.human || !inp || typeof inp !== 'object') return;
    e.inp = { x: num(inp.x, e.x), y: num(inp.y, e.y), a: num(inp.a, e.ang), atk: !!inp.atk, thr: num(inp.thr, e.lastThr) | 0, tog: num(inp.tog, e.lastTog) | 0 };
  }
  function applyHuman(R, e, dt) {
    const inp = e.inp; if (!inp) return;
    if (R.phase !== 'play') { e.lastThr = inp.thr; e.lastTog = inp.tog; return; }
    e.budget = Math.min(e.budget + e.speed * dt * 1.15, e.speed * .3);
    const dx = inp.x - e.x, dy = inp.y - e.y, d = Math.hypot(dx, dy);
    const ox = e.x, oy = e.y;
    if (d > .5) {
      const mv = Math.min(d, e.budget);
      moveEnt(R.M, e, dx / d, dy / d, 1, mv);
      e.budget -= Math.hypot(e.x - ox, e.y - oy);
    }
    e.vx = (e.x - ox) / dt; e.vy = (e.y - oy) / dt;
    e.ang = inp.a;
    if (inp.tog !== e.lastTog) { e.lastTog = inp.tog; if (e.role === 'murderer' || e.hasGun) e.weaponOut = !e.weaponOut; }
    if (inp.thr !== e.lastThr) { e.lastThr = inp.thr; tryThrow(R, e); }
    if (inp.atk) { if (e.role === 'murderer') tryStab(R, e); else if (e.hasGun) tryShoot(R, e); }
  }
  // a player who leaves mid-round is handed to the AI
  function releaseHuman(R, pid) {
    const e = R.ents.find(x => x.pid === pid);
    if (e) { e.human = false; e.inp = null; e.speed = BOT_SPEED; e.ai.grace = rand(3, 8); }
  }

  // ===================== Cheats (practice, or admins online) =====================
  const CHEATS = { sheffeme: 'Get the gun', murdme: 'Become the murderer', speed: 'Run faster (type again to stop)', whoisit: 'See who the murderer is', r: 'Come back to life', god: 'Nothing can kill you (type again to stop)' };
  function cheat(R, id, cmd) {
    const e = entById(R, id);
    cmd = String(cmd || '').toLowerCase().replace(/^\//, '').trim();
    if (cmd === 'help') return 'Cheats: ' + Object.entries(CHEATS).map(([k, v]) => `/${k} (${v})`).join(', ');
    if (!Object.hasOwn(CHEATS, cmd)) return `Unknown command /${cmd}. Type /help`;
    if (!e) return 'You\'re not in this round';
    if (R.phase === 'end') return 'The round is over';
    if (cmd === 'r') {
      if (e.alive) return 'You\'re already alive lol';
      e.alive = true; e.weaponOut = false; e.atkCd = 0; e.throwCd = 0;
      const lostGun = !e.hasGun && (e.role === 'sheriff' || e.role === 'hero');
      if (lostGun) e.role = 'innocent';
      R.bodies = R.bodies.filter(b => b.id !== e.id);
      emit(R, { t: 'sfx', s: 'gun', x: e.x, y: e.y });
      return 'You\'re back 😎' + (lostGun ? ' You\'re innocent now, the gun stayed where it dropped.' : '');
    }
    if (!e.alive) return 'You need to be alive for that. Try /r';
    if (cmd === 'sheffeme') {
      if (e.hasGun) return 'You already have the gun';
      // everyone else's gun goes bye bye (including one on the floor)
      for (const o of R.ents) if (o !== e && o.hasGun) { o.hasGun = false; o.weaponOut = false; if (o.role === 'sheriff' || o.role === 'hero') o.role = 'innocent'; }
      R.gunDrop = null;
      let extra = '';
      if (e.role === 'murderer') {
        // someone else has to be the murderer now
        const pool = R.ents.filter(o => o !== e && o.alive);
        if (!pool.length) return 'Nobody left to be the murderer';
        const m = pool[Math.floor(Math.random() * pool.length)];
        m.role = 'murderer'; m.hasGun = false; m.ai.grace = rand(4, 8); m.ai.target = null; R.murderer = m;
        for (const b of R.ents) if (b.ai.know === e) { b.ai.know = null; b.ai.lastSeen = null; }
        extra = ' Your knife is gone and someone else is the murderer now 👀';
      }
      e.weaponOut = false; e.hasGun = true; e.role = 'sheriff';
      emit(R, { t: 'sfx', s: 'gun', x: e.x, y: e.y });
      return 'You got the gun 🔫 You\'re the sheriff now.' + extra;
    }
    if (cmd === 'murdme') {
      if (e.role === 'murderer') return 'You\'re already the murderer 😈';
      // the old murderer's knife goes bye bye
      const old = R.murderer;
      old.role = 'innocent'; old.weaponOut = false; old.ai.target = null;
      for (const b of R.ents) if (b.ai.know === old) { b.ai.know = null; b.ai.lastSeen = null; }
      let extra = '';
      if (e.hasGun) { e.hasGun = false; extra = ' Your gun is gone.'; }
      e.weaponOut = false; e.role = 'murderer'; R.murderer = e;
      return 'You\'re the murderer now 🔪 Click to stab, Q to throw.' + extra;
    }
    if (cmd === 'speed') {
      const base = e.human ? PLAYER_SPEED : BOT_SPEED;
      e.speed = e.speed > base ? base : Math.round(base * 1.6);
      return e.speed > base ? 'Speed boost on 💨' : 'Speed boost off';
    }
    if (cmd === 'god') { e.god = !e.god; return e.god ? 'God mode on 😇 Nothing can kill you' : 'God mode off'; }
    if (cmd === 'whoisit') return `The murderer is ${R.murderer.id === e.id ? 'YOU lol' : R.murderer.name} 👀`;
  }

  // ---------- save/restore a round (keeps a practice round alive across page updates) ----------
  function serializeRound(R) {
    const idOf = e => e ? e.id : null;
    return JSON.parse(JSON.stringify({
      ...R, M: null, murderer: idOf(R.murderer), events: [],
      ents: R.ents.map(e => ({ ...e, ai: { ...e.ai, know: idOf(e.ai.know), target: idOf(e.ai.target), coin: null } })),
      proj: R.proj.map(p => ({ ...p, owner: idOf(p.owner) })),
    }));
  }
  function restoreRound(o) {
    const R = { ...o, M: buildMap(o.mapIdx), events: [] };
    const by = id => R.ents.find(e => e.id === id) || null;
    for (const e of R.ents) { e.ai.know = by(e.ai.know); e.ai.target = by(e.ai.target); }
    R.murderer = by(o.murderer);
    R.proj = R.proj.map(p => ({ ...p, owner: by(p.owner) }));
    return R;
  }

  // ===================== Step =====================
  function step(R, dt) {
    R.t += dt;
    if (R.phase === 'intro') {
      R.introT -= dt;
      for (const e of R.ents) if (e.human) applyHuman(R, e, dt);
      if (R.introT <= 0) { R.phase = 'play'; emit(R, { t: 'start' }); }
      return;
    }
    if (R.phase === 'end') { R.endT += dt; stepProjectiles(R, dt); return; }
    R.time -= dt;
    R.coinT -= dt;
    if (R.coinT <= 0) { R.coinT = .55; if (R.coins.length < 30) spawnCoin(R); }
    for (const e of R.ents) if (e.alive) { if (e.human) applyHuman(R, e, dt); else botThink(R, e, dt); }
    for (const e of R.ents) { e.atkCd = Math.max(0, e.atkCd - dt); e.throwCd = Math.max(0, e.throwCd - dt); e.swing = Math.max(0, e.swing - dt); }
    for (const e of R.ents) {
      if (!e.alive) continue;
      if (e.bag < BAG_MAX) for (let i = R.coins.length - 1; i >= 0; i--) {
        if (dist(e, R.coins[i]) < e.r + 10) { R.coins.splice(i, 1); e.bag++; emit(R, { t: 'coin', to: e.id, full: e.bag === BAG_MAX }); }
      }
      if (R.gunDrop && e.role === 'innocent' && dist(e, R.gunDrop) < e.r + 14) {
        e.hasGun = true; e.role = 'hero'; R.gunDrop = null; R.heroName = e.name;
        e.ai.react = rand(.8, 1.4);
        emit(R, { t: 'hero', to: e.id }); emit(R, { t: 'gunTaken', except: e.id });
      }
    }
    stepProjectiles(R, dt);
    const m = R.murderer;
    if (!m.alive) endRound(R, 'innocents');
    else if (R.ents.every(e => e === m || !e.alive)) endRound(R, 'murderer');
    else if (R.time <= 0) endRound(R, 'innocents');
  }
  function stepProjectiles(R, dt) {
    for (let i = R.proj.length - 1; i >= 0; i--) {
      const pr = R.proj[i]; pr.life -= dt; let dead = pr.life <= 0;
      const steps = Math.ceil(Math.hypot(pr.vx, pr.vy) * dt / 8);
      for (let s = 0; s < steps && !dead; s++) {
        pr.x += pr.vx * dt / steps; pr.y += pr.vy * dt / steps;
        if (sightSolidAt(R.M, pr.x, pr.y)) {
          dead = true;
          if (pr.type === 'knife') emit(R, { t: 'fx', k: 'stuck', x: pr.x - pr.vx * .012, y: pr.y - pr.vy * .012, a: Math.atan2(pr.vy, pr.vx), skin: pr.skin });
          break;
        }
        if (R.phase === 'play') for (const e of R.ents) if (e.alive && e !== pr.owner && Math.hypot(e.x - pr.x, e.y - pr.y) < e.r + 4) { kill(R, e, pr.owner); dead = true; break; }
      }
      if (dead) R.proj.splice(i, 1);
    }
  }
  function endRound(R, winner) {
    R.phase = 'end'; R.winner = winner; R.endT = 0;
    for (const e of R.ents) e.weaponOut = e.alive && (e.role === 'murderer' || e.hasGun);
    R.results = R.ents.filter(e => e.pid).map(e => {
      const won = (winner === 'murderer') === (e.startRole === 'murderer');
      return { pid: e.pid, id: e.id, role: e.startRole, won, alive: e.alive, bag: e.bag, kills: e.kills };
    });
    R.endInfo = { w: winner, roles: R.ents.map(e => [e.id, e.role]), murderer: R.murderer.name, sheriff: R.sheriffName, hero: R.heroName };
    emit(R, { t: 'end', ...R.endInfo });
  }
  // rewards are computed from results by whoever owns the economy (the server)
  function rewardFor(res) {
    const coins = res.bag + (res.won ? 10 : 0);
    const xp = 25 + res.bag * 2 + res.kills * 20 + (res.won ? 60 : 0) + (res.won && res.alive ? 20 : 0);
    return { coins, xp };
  }

  // ===================== Network views =====================
  // Per-viewer snapshot: never includes other players' roles, coin bags or who holds the gun.
  function snapshotFor(R, viewerId) {
    const me = entById(R, viewerId);
    const s = {
      ph: R.phase, tm: Math.max(0, +R.time.toFixed(1)), it: +R.introT.toFixed(1),
      e: R.ents.map(e => [e.id, Math.round(e.x), Math.round(e.y), +e.ang.toFixed(2), e.alive ? 1 : 0, e.weaponOut ? (e.role === 'murderer' ? 'k' : 'g') : 0, +e.swing.toFixed(2)]),
      c: R.coins.map(c => [c.x, c.y]),
      p: R.proj.map(p => [p.type === 'knife' ? 'k' : 'b', Math.round(p.x), Math.round(p.y), Math.round(p.vx), Math.round(p.vy), p.skin || 0]),
      b: R.bodies, g: R.gunDrop,
    };
    if (me) s.me = { id: me.id, spd: me.speed, role: me.role, bag: me.bag, atk: +me.atkCd.toFixed(2), thr: +me.throwCd.toFixed(2), alive: me.alive, gun: me.hasGun, wo: me.weaponOut, x: Math.round(me.x), y: Math.round(me.y) };
    if (R.phase === 'end') s.end = R.endInfo;
    return s;
  }
  function roster(R) { return R.ents.map(e => ({ id: e.id, name: e.name, color: e.color, knife: e.knife, gun: e.gun, human: e.human })); }
  function eventsFor(evs, viewerId) { return evs.filter(ev => (ev.to === undefined || ev.to === viewerId) && ev.except !== viewerId); }
  function drain(R) { const e = R.events; R.events = []; return e; }

  return {
    RAR, RORDER, ITEMS, ITEM, CRATES, rollItem, rollCrate, MAPS, TILE, BAG_MAX, MAX_PLAYERS, PLAYER_SPEED,
    buildMap, tileAt, moveSolidAt, moveEnt, los,
    createRound, setInput, step, releaseHuman, cheat, serializeRound, restoreRound, snapshotFor, roster, eventsFor, drain, rewardFor, entById,
  };
});
