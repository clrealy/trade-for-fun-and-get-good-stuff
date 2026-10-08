'use strict';
// 3D view of the round (three.js). It only draws: the simulation, HUD and menus are the same as 2D.
// World units: 1 unit = 1 tile (48 game px). Game x → X, game y → Z, up is Y.
const R3D = (() => {
  const S = 1 / 48;
  const api = { ok: false };
  if (typeof THREE === 'undefined') return api;
  let renderer;
  try {
    const cvs = document.createElement('canvas');
    cvs.id = 'game3d';
    renderer = new THREE.WebGLRenderer({ canvas: cvs, antialias: true, powerPreference: 'high-performance' });
    document.body.insertBefore(cvs, document.body.firstChild);
  } catch (e) { return api; }
  api.ok = true;
  // if the GPU drops the context (common on phones), stop using 3D so the 2D view takes over
  renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); api.ok = false; renderer.domElement.style.display = 'none'; });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  // sky, fog and light colors come from the map's theme (THEMES below)
  scene.background = null;
  scene.fog = new THREE.Fog('#0e0a18', 17, 36);
  let theme = null, mapGlows = []; // the current map's look, and its lamps/candles (glow sprites in Ultra)
  const camera = new THREE.PerspectiveCamera(45, 1, .1, 200);
  const hemi = new THREE.HemisphereLight(0xfff4ea, 0x3c3458, .5); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0dc, .62); sun.position.set(4, 10, 6); scene.add(sun, sun.target);
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0005; sun.shadow.normalBias = .02;
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: .5, far: 45 }); // wide enough for a low camera
  const fill = new THREE.DirectionalLight(0x8fb4ff, .16); fill.position.set(-6, 5, -8); scene.add(fill);
  // quick flashes of light for gunshots, explosions and the dropped gun (only in Ultra: every light costs on phones)
  const fxLights = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xffffff, 0, 6, 2); l.visible = false; scene.add(l); return l; });
  let quality = 'ultra';
  const ultra = () => quality === 'ultra';

  const matCache = new Map();
  const mat = (color, extra) => {
    const k = color + (extra ? JSON.stringify(extra) : '');
    if (!matCache.has(k)) matCache.set(k, new THREE.MeshLambertMaterial({ color, ...extra }));
    return matCache.get(k);
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const G = { unit: box(1, 1, 1) };

  // ---------------- map ----------------
  let mapGroup = null, mapIdx = -1;
  function rng(s) { return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const hash = (x, y, s = 0) => ((Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(s + 1, 83492791)) >>> 0) % 1000 / 1000;
  const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16), f = v => Math.max(0, Math.min(255, Math.round(v * k))); return 'rgb(' + f(n >> 16) + ',' + f(n >> 8 & 255) + ',' + f(n & 255) + ')'; };
  function canvasTex(w, h, draw, repeat, seed = 1) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), rng(seed));
    const t = new THREE.CanvasTexture(c); t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  function specks(g, r, w, h, color, n, size = 2, alpha = .3) { g.globalAlpha = alpha; g.fillStyle = color; for (let i = 0; i < n; i++) g.fillRect(r() * w | 0, r() * h | 0, size, size); g.globalAlpha = 1; }
  function crack(g, r, x, y, len, color = 'rgba(0,0,0,.25)') { g.strokeStyle = color; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); for (let i = 0; i < 5; i++) { x += (r() - .3) * len / 3; y += (r() - .5) * len / 3; g.lineTo(x, y); } g.stroke(); }

  // floors and outside ground: 128px per tile, drawn once per map
  const SURF = {
    wood(g, r, a, b) {
      const h = 32;
      for (let i = 0; i < 4; i++) {
        const off = (i * 45 + 20) % 128;
        for (const x0 of [off - 128, off]) { g.fillStyle = shade(i % 2 ? a : b, .9 + r() * .2); g.fillRect(x0, i * h, 128, h); g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(x0, i * h, 2, h); }
        g.strokeStyle = 'rgba(50,25,8,.22)'; g.lineWidth = 1;
        for (let k = 0; k < 4; k++) { const y = i * h + 4 + r() * (h - 8); g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(40, y + r() * 5 - 2.5, 85, y + r() * 5 - 2.5, 128, y); g.stroke(); }
        g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, i * h + 1, 128, 2);
        g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, i * h + h - 2, 128, 2);
      }
    },
    carpet(g, r, a, b) {
      g.fillStyle = a; g.fillRect(0, 0, 128, 128); specks(g, r, 128, 128, b, 2200, 2, .45); specks(g, r, 128, 128, '#000', 700, 1, .2);
      g.strokeStyle = shade(b, 1.5); g.globalAlpha = .4; g.lineWidth = 3;
      g.beginPath(); g.moveTo(64, 10); g.lineTo(118, 64); g.lineTo(64, 118); g.lineTo(10, 64); g.closePath(); g.stroke();
      g.fillStyle = shade(b, 1.6); g.beginPath(); g.arc(64, 64, 7, 0, 7); g.fill();
      for (const [x, y] of [[0, 0], [128, 0], [0, 128], [128, 128]]) { g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); }
      g.globalAlpha = 1;
    },
    carpettile(g, r, a, b) {
      for (let q = 0; q < 4; q++) {
        const x = (q % 2) * 64, y = (q >> 1) * 64; g.fillStyle = shade(a, q % 3 ? 1 : .93); g.fillRect(x, y, 64, 64);
        g.strokeStyle = 'rgba(0,0,0,.12)'; for (let k = 4; k < 64; k += 5) { g.beginPath(); q % 3 ? (g.moveTo(x + k, y), g.lineTo(x + k, y + 64)) : (g.moveTo(x, y + k), g.lineTo(x + 64, y + k)); g.stroke(); }
      }
      specks(g, r, 128, 128, b, 1500, 1, .5); g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, 0, 128, 1); g.fillRect(0, 0, 1, 128); g.fillRect(0, 64, 128, 1); g.fillRect(64, 0, 1, 128);
    },
    marble(g, r, a, b) {
      for (let q = 0; q < 4; q++) { g.fillStyle = q === 0 || q === 3 ? a : shade(a, .9); g.fillRect((q % 2) * 64, (q >> 1) * 64, 64, 64); }
      g.globalAlpha = .35; g.strokeStyle = b;
      for (let k = 0; k < 9; k++) { g.lineWidth = .5 + r() * 1.5; g.beginPath(); let x = r() * 128, y = r() * 128; g.moveTo(x, y); for (let i = 0; i < 4; i++) { x += r() * 40 - 15; y += r() * 30 - 15; g.lineTo(x, y); } g.stroke(); }
      g.globalAlpha = 1; g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 0, 128, 1); g.fillRect(0, 0, 1, 128); g.fillRect(0, 64, 128, 1); g.fillRect(64, 0, 1, 128);
      g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(1, 1, 126, 1);
    },
    tile(g, r, a, b) {
      g.fillStyle = b; g.fillRect(0, 0, 128, 128);
      for (let q = 0; q < 16; q++) { const x = (q % 4) * 32, y = (q >> 2) * 32; g.fillStyle = shade(a, .96 + r() * .06); g.fillRect(x + 1.5, y + 1.5, 29, 29); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x + 3, y + 3, 10, 2); }
      specks(g, r, 128, 128, '#7d8f96', 120, 1, .3);
    },
    concrete(g, r, a, b) {
      g.fillStyle = a; g.fillRect(0, 0, 128, 128); specks(g, r, 128, 128, b, 2500, 2, .35); specks(g, r, 128, 128, '#fff', 400, 1, .12);
      for (let k = 0; k < 3; k++) crack(g, r, r() * 128, r() * 128, 40);
      g.fillStyle = 'rgba(0,0,0,.08)'; g.beginPath(); g.ellipse(r() * 128, r() * 128, 26, 14, r() * 3, 0, 7); g.fill();
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, 128, 2); g.fillRect(0, 0, 2, 128);
    },
    ice(g, r, a, b) {
      const gr = g.createLinearGradient(0, 0, 128, 128); gr.addColorStop(0, a); gr.addColorStop(.5, b); gr.addColorStop(1, a); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      for (let k = 0; k < 6; k++) crack(g, r, r() * 128, r() * 128, 50, 'rgba(255,255,255,.55)');
      specks(g, r, 128, 128, '#fff', 90, 2, .8); g.fillStyle = 'rgba(255,255,255,.4)'; g.fillRect(0, 0, 128, 1); g.fillRect(0, 0, 1, 128);
    },
    stone(g, r, a, b) {
      g.fillStyle = b; g.fillRect(0, 0, 128, 128);
      const rows = [0, 40, 84, 128];
      for (let i = 0; i < 3; i++) { let x = -(i * 23 % 40); while (x < 128) { const w = 34 + r() * 30; for (const dx of [0, 128]) { g.fillStyle = shade(a, .82 + r() * .3); g.fillRect(x + 2 - dx, rows[i] + 2, w - 3, rows[i + 1] - rows[i] - 3); } x += w; } }
      specks(g, r, 128, 128, '#000', 900, 2, .18); for (let k = 0; k < 4; k++) crack(g, r, r() * 128, r() * 128, 30);
      specks(g, r, 128, 128, '#3d5a2a', 160, 2, .35); // moss
    },
    grass(g, r, a, b) {
      g.fillStyle = a; g.fillRect(0, 0, 128, 128); specks(g, r, 128, 128, b, 1500, 3, .5);
      g.lineWidth = 1; for (let i = 0; i < 700; i++) { const x = r() * 128, y = r() * 128; g.strokeStyle = shade(i % 2 ? a : b, 1.1 + r() * .5); g.globalAlpha = .7; g.beginPath(); g.moveTo(x, y); g.lineTo(x + r() * 3 - 1.5, y - 3 - r() * 4); g.stroke(); }
      g.globalAlpha = 1; for (let i = 0; i < 5; i++) { g.fillStyle = ['#fff3a8', '#ffffff', '#f4a6c8'][i % 3]; g.fillRect(r() * 128, r() * 128, 2, 2); }
    },
    deadgrass(g, r, a, b) {
      SURF.grass(g, r, a, b); g.fillStyle = 'rgba(40,28,18,.5)';
      for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(r() * 128, r() * 128, 10 + r() * 16, 6 + r() * 10, r() * 3, 0, 7); g.fill(); }
    },
    asphalt(g, r, a, b) { g.fillStyle = a; g.fillRect(0, 0, 128, 128); specks(g, r, 128, 128, '#8a8f99', 1800, 1, .35); specks(g, r, 128, 128, b, 900, 3, .4); for (let k = 0; k < 2; k++) crack(g, r, r() * 128, r() * 128, 40, 'rgba(0,0,0,.4)'); },
    sidewalk(g, r, a, b) { g.fillStyle = a; g.fillRect(0, 0, 128, 128); specks(g, r, 128, 128, b, 1600, 2, .3); g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, 0, 128, 2); g.fillRect(0, 0, 2, 128); g.fillRect(0, 63, 128, 2); g.fillRect(63, 0, 2, 128); },
    snow(g, r, a, b) { g.fillStyle = a; g.fillRect(0, 0, 128, 128); specks(g, r, 128, 128, b, 1400, 3, .35); specks(g, r, 128, 128, '#fff', 300, 1, .9); },
  };
  // walls: one picture per wall cell side, 128 x 172 (the wall is 1.35 tall)
  const WALLS = {
    wallpaper(g, r, a, b, trim) {
      g.fillStyle = a; g.fillRect(0, 0, 128, 172);
      g.fillStyle = b; for (let x = 6; x < 128; x += 32) g.fillRect(x, 0, 10, 112);
      g.fillStyle = shade(b, 1.35); g.globalAlpha = .5; for (let y = 14; y < 110; y += 26) for (let x = 27; x < 128; x += 32) { g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 4, y); g.lineTo(x, y + 5); g.lineTo(x - 4, y); g.fill(); }
      g.globalAlpha = 1; g.fillStyle = trim; g.fillRect(0, 112, 128, 60); g.fillStyle = shade(trim, 1.4); g.fillRect(0, 110, 128, 5);
      g.strokeStyle = shade(trim, 1.5); g.lineWidth = 2; g.strokeRect(10, 124, 48, 34); g.strokeRect(70, 124, 48, 34);
      g.fillStyle = shade(trim, .6); g.fillRect(0, 162, 128, 10); g.fillStyle = shade(trim, 1.3); g.fillRect(0, 0, 128, 6);
    },
    panel(g, r, a, b, trim) {
      g.fillStyle = a; g.fillRect(0, 0, 128, 172); specks(g, r, 128, 172, b, 600, 2, .3);
      g.fillStyle = b; g.fillRect(0, 60, 128, 3); g.fillRect(63, 0, 2, 172); g.fillStyle = shade(b, .8); g.fillRect(0, 100, 128, 14);
      g.fillStyle = trim; g.fillRect(0, 160, 128, 12);
    },
    stone(g, r, a, b, trim) {
      g.fillStyle = trim; g.fillRect(0, 0, 128, 172);
      for (let i = 0; i < 9; i++) { const y = i * 19, off = i % 2 ? -16 : 0; for (let x = off; x < 128; x += 32) { g.fillStyle = shade(r() < .5 ? a : b, .85 + r() * .3); g.fillRect(x + 1, y + 1, 30, 17); } }
      specks(g, r, 128, 172, '#000', 700, 2, .15); for (let k = 0; k < 3; k++) crack(g, r, r() * 128, r() * 172, 30);
    },
    tiles(g, r, a, b, trim) {
      g.fillStyle = shade(a, 1.05); g.fillRect(0, 0, 128, 172);
      g.fillStyle = '#c6d3d7'; g.fillRect(0, 86, 128, 86);
      for (let y = 86; y < 172; y += 16) for (let x = 0; x < 128; x += 16) { g.fillStyle = shade(a, .97 + r() * .05); g.fillRect(x + 1, y + 1, 14, 14); }
      g.fillStyle = b; g.fillRect(0, 78, 128, 8); g.fillStyle = trim; g.fillRect(0, 164, 128, 8);
    },
    metal(g, r, a, b, hazard) {
      for (let x = 0; x < 128; x += 16) { const gr = g.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, shade(a, .8)); gr.addColorStop(.5, shade(a, 1.2)); gr.addColorStop(1, shade(b, .8)); g.fillStyle = gr; g.fillRect(x, 0, 16, 150); }
      g.fillStyle = '#20232a'; for (let x = 8; x < 128; x += 32) for (const y of [8, 70, 138]) { g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill(); }
      specks(g, r, 128, 150, '#7a4a20', 160, 3, .35); // rust
      for (let x = -24; x < 140; x += 24) { g.fillStyle = hazard; g.beginPath(); g.moveTo(x, 150); g.lineTo(x + 12, 150); g.lineTo(x + 24, 172); g.lineTo(x + 12, 172); g.fill(); g.fillStyle = '#16181c'; g.beginPath(); g.moveTo(x + 12, 150); g.lineTo(x + 24, 150); g.lineTo(x + 36, 172); g.lineTo(x + 24, 172); g.fill(); }
    },
    iceblock(g, r, a, b, trim) {
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
        const x = j * 64 - (i % 2) * 32, y = i * 57; for (const dx of [0, 128]) {
          const gr = g.createLinearGradient(x + dx, y, x + dx + 64, y + 57); gr.addColorStop(0, b); gr.addColorStop(1, a); g.fillStyle = gr; g.fillRect(x + dx + 1, y + 1, 62, 55);
          g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(x + dx + 3, y + 3, 30, 3); g.fillRect(x + dx + 3, y + 3, 3, 20);
        }
      }
      for (let k = 0; k < 4; k++) crack(g, r, r() * 128, r() * 172, 30, 'rgba(255,255,255,.5)');
    },
  };
  // bookshelves and other tall furniture (B), 64 x 80
  const SHELVES = {
    books(g, r) {
      g.fillStyle = '#3b2616'; g.fillRect(0, 0, 64, 80); const bc = ['#c92a2a', '#1971c2', '#e67700', '#2b8a3e', '#862e9c', '#e9d8a6', '#495057'];
      for (let row = 0; row < 3; row++) { let x = 4; while (x < 58) { const w = 3 + r() * 4, h = 15 + r() * 6; g.fillStyle = bc[r() * bc.length | 0]; g.fillRect(x, row * 25 + 24 - h, w, h); g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(x, row * 25 + 26 - h, w, 1); x += w + .7; } g.fillStyle = '#5a3a20'; g.fillRect(0, row * 25 + 24, 64, 4); }
      g.strokeStyle = '#24160b'; g.lineWidth = 4; g.strokeRect(0, 0, 64, 80);
    },
    cabinet(g) { g.fillStyle = '#8d98a7'; g.fillRect(0, 0, 64, 80); for (let i = 0; i < 4; i++) { g.fillStyle = '#a5afbd'; g.fillRect(4, 4 + i * 19, 56, 16); g.fillStyle = '#4b5563'; g.fillRect(24, 10 + i * 19, 16, 3); g.fillStyle = '#fff'; g.fillRect(8, 8 + i * 19, 10, 6); } },
    vault(g) {
      const gr = g.createLinearGradient(0, 0, 64, 80); gr.addColorStop(0, '#c9ced6'); gr.addColorStop(1, '#6b737f'); g.fillStyle = gr; g.fillRect(0, 0, 64, 80);
      g.strokeStyle = '#3d434c'; g.lineWidth = 3; g.strokeRect(4, 4, 56, 72); g.beginPath(); g.arc(32, 40, 15, 0, 7); g.stroke();
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; g.beginPath(); g.moveTo(32, 40); g.lineTo(32 + Math.cos(a) * 15, 40 + Math.sin(a) * 15); g.stroke(); }
      g.fillStyle = '#ffd43b'; g.beginPath(); g.arc(32, 40, 4, 0, 7); g.fill();
    },
    medcab(g) {
      g.fillStyle = '#f1f5f6'; g.fillRect(0, 0, 64, 80); g.fillStyle = '#bcd9e3'; g.fillRect(5, 5, 25, 70); g.fillRect(34, 5, 25, 70);
      g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(8, 8, 4, 40); g.fillRect(37, 8, 4, 40);
      for (const [x, y, c] of [[10, 20, '#e03131'], [18, 22, '#1c7ed6'], [42, 40, '#f59f00'], [50, 38, '#2f9e44'], [12, 58, '#e03131']]) { g.fillStyle = c; g.fillRect(x, y, 5, 9); }
      g.fillStyle = '#e03131'; g.fillRect(28, 33, 8, 22); g.fillRect(21, 40, 22, 8);
    },
    crates(g, r) {
      for (let i = 0; i < 2; i++) { const y = i * 40; g.fillStyle = shade('#a87a46', .9 + r() * .2); g.fillRect(0, y, 64, 40); g.fillStyle = '#6e4a24'; g.fillRect(0, y, 64, 5); g.fillRect(0, y + 35, 64, 5); g.fillRect(0, y, 5, 40); g.fillRect(59, y, 5, 40); g.strokeStyle = '#6e4a24'; g.lineWidth = 5; g.beginPath(); g.moveTo(5, y + 5); g.lineTo(59, y + 35); g.stroke(); }
      g.fillStyle = '#1a1a1a'; g.font = 'bold 9px sans-serif'; g.fillText('FRAGILE', 12, 26);
    },
    iceblock(g, r) { WALLS.iceblock(g, r, '#8fc6ea', '#d8f2ff'); },
  };
  // wall art, 64 x 48
  const ART = {
    paint(g, r, k) {
      g.fillStyle = '#b8862e'; g.fillRect(0, 0, 64, 48); g.fillStyle = '#e8c36a'; g.fillRect(2, 2, 60, 2);
      if (k === 1) { g.fillStyle = '#3b2a3f'; g.fillRect(6, 6, 52, 36); g.fillStyle = '#e0b48a'; g.beginPath(); g.arc(32, 20, 8, 0, 7); g.fill(); g.fillStyle = '#20304a'; g.fillRect(20, 30, 24, 12); g.fillStyle = '#3a2210'; g.fillRect(24, 11, 16, 5); return; }
      const sky = g.createLinearGradient(0, 6, 0, 30); sky.addColorStop(0, k ? '#ff9a5c' : '#6fb7ff'); sky.addColorStop(1, k ? '#ffd27a' : '#cfe9ff'); g.fillStyle = sky; g.fillRect(6, 6, 52, 36);
      g.fillStyle = k ? '#ffefa0' : '#fff7c2'; g.beginPath(); g.arc(44, 16, 5, 0, 7); g.fill();
      g.fillStyle = '#3f7a3a'; g.beginPath(); g.moveTo(6, 42); g.lineTo(6, 30); g.quadraticCurveTo(22, 18, 36, 32); g.quadraticCurveTo(48, 24, 58, 30); g.lineTo(58, 42); g.fill();
      g.fillStyle = '#2b5a29'; g.fillRect(6, 36, 52, 6);
    },
    board(g, r, k) {
      g.fillStyle = '#9aa3ad'; g.fillRect(0, 0, 64, 48); g.fillStyle = '#fbfdff'; g.fillRect(3, 3, 58, 40); g.fillStyle = '#5c6675'; g.fillRect(8, 43, 48, 3);
      const c = ['#1c7ed6', '#e03131', '#2f9e44'];
      if (k === 1) { g.fillStyle = c[0]; for (let i = 0; i < 5; i++) { const h = 6 + r() * 26; g.fillRect(10 + i * 9, 38 - h, 6, h); } return; }
      g.lineWidth = 1.5; for (let i = 0; i < 4; i++) { g.strokeStyle = c[(i + k) % 3]; g.beginPath(); g.moveTo(8, 10 + i * 8); for (let x = 8; x < 50; x += 6) g.lineTo(x, 10 + i * 8 + r() * 3); g.stroke(); }
    },
    poster(g, r, k) {
      g.fillStyle = '#d0dbe0'; g.fillRect(0, 0, 64, 48); g.fillStyle = '#ffffff'; g.fillRect(3, 3, 58, 42);
      if (k === 1) { g.strokeStyle = '#2f9e44'; g.lineWidth = 2; g.beginPath(); g.moveTo(6, 26); g.lineTo(20, 26); g.lineTo(25, 12); g.lineTo(31, 38); g.lineTo(36, 20); g.lineTo(40, 26); g.lineTo(58, 26); g.stroke(); return; }
      g.fillStyle = '#e03131'; g.fillRect(27, 9, 10, 28); g.fillRect(18, 18, 28, 10); g.fillStyle = '#868e96'; g.fillRect(14, 40, 36, 2);
    },
    hazard(g, r, k) {
      g.fillStyle = k === 1 ? '#1971c2' : '#ffd43b'; g.fillRect(0, 0, 64, 48); g.fillStyle = '#16181c';
      if (k === 1) { g.fillStyle = '#fff'; g.font = 'bold 11px sans-serif'; g.fillText('SAFETY', 11, 22); g.fillText('FIRST', 15, 36); return; }
      g.beginPath(); g.moveTo(32, 6); g.lineTo(54, 42); g.lineTo(10, 42); g.closePath(); g.fill(); g.fillStyle = '#ffd43b'; g.fillRect(30, 18, 4, 13); g.fillRect(30, 34, 4, 4);
    },
    creepy(g, r, k) {
      g.fillStyle = '#3d2b1a'; g.fillRect(0, 0, 64, 48); g.fillStyle = '#5c4326'; g.fillRect(2, 2, 60, 2);
      g.fillStyle = '#120d18'; g.fillRect(6, 6, 52, 36); g.fillStyle = '#2a2433'; g.beginPath(); g.arc(32, 22, 10, 0, 7); g.fill(); g.fillRect(18, 32, 28, 10);
      g.fillStyle = k === 1 ? '#7cff9a' : '#ff3b3b'; g.fillRect(27, 19, 3, 2); g.fillRect(34, 19, 3, 2);
      g.strokeStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.moveTo(40, 6); g.lineTo(58, 30); g.stroke();
    },
  };
  // every map gets its own look. lo: lights for 'high' (phones), where there are no glows
  const THEMES = {
    'Mansion': {
      sky: ['#463270', '#1c1334', '#07050d'], fog: ['#17112b', 18, 42], hemi: [0xfff1dc, 0x4a3a52, .5], sun: [0xffdcae, .62],
      floor: ['wood', '#a8774a', '#8f6139', 25], wall: ['wallpaper', '#6b2f3a', '#7d3a47', '#3b2618'], ground: ['grass', '#3d6b2c', '#2f5a23'],
      outside: ['trees', 'lamps', 'fence'], table: ['#7a4a2a', '#4e2f19'], prop: 'vase', shelf: 'books', plant: 'pot', rug: ['#7a1f2b', '#d9b45a'], window: '#ffd58a', sconce: '#ffc46b', art: 'paint', moon: 1,
    },
    'Office': {
      sky: ['#25406a', '#101d34', '#05080f'], fog: ['#0e1828', 18, 44], hemi: [0xf2f6ff, 0x34405a, .55], sun: [0xe9f1ff, .62],
      floor: ['carpettile', '#55627a', '#3e4a5e', 0], wall: ['panel', '#c9d1da', '#aeb8c4', '#5c6675'], ground: ['asphalt', '#2c2f35', '#1f2226'],
      outside: ['city', 'cars', 'lamps'], table: ['#e9edf2', '#8a94a3'], prop: 'computer', shelf: 'cabinet', plant: 'pot', rug: null, window: '#a8d8ff', art: 'board',
    },
    'Hotel': {
      sky: ['#4a2a5c', '#1d1030', '#08050d'], fog: ['#1a1024', 18, 42], hemi: [0xffefd8, 0x4a3040, .52], sun: [0xffd9a8, .6],
      floor: ['carpet', '#8e3b46', '#6e2a34', 0], wall: ['wallpaper', '#b08d4f', '#9a7840', '#3a2129'], ground: ['sidewalk', '#8d8a86', '#6f6c69'],
      outside: ['city', 'lamps', 'trees'], table: ['#5a3a2a', '#3a2418'], prop: 'lamp', shelf: 'books', plant: 'pot', rug: ['#22386b', '#e0c070'], window: '#ffcf7a', sconce: '#ffcc70', art: 'paint',
    },
    'Bank': {
      sky: ['#2f3f6a', '#141b33', '#05070d'], fog: ['#121a2c', 18, 44], hemi: [0xfff6e4, 0x4d4a40, .55], sun: [0xfff0d0, .64],
      floor: ['marble', '#ece6d6', '#9c8f70', 70], wall: ['stone', '#cdbd92', '#b9a77a', '#6e5f42'], ground: ['sidewalk', '#9a968e', '#7a766f'],
      outside: ['city', 'lamps', 'cars', 'fence'], table: ['#3b2a1c', '#24180f'], prop: 'gold', shelf: 'vault', plant: 'pot', rug: ['#1f5a3a', '#d9b45a'], window: '#ffe9a8', sconce: '#ffd77a', art: 'paint',
    },
    'Hospital': {
      sky: ['#2a4a66', '#11202e', '#05090d'], fog: ['#0f1c26', 18, 44], hemi: [0xf4fbff, 0x3f5560, .58], sun: [0xf0f8ff, .64],
      floor: ['tile', '#e6f0f2', '#a9bcc2', 60], wall: ['tiles', '#e4edf0', '#4fa3b5', '#5f7d86'], ground: ['asphalt', '#33363c', '#24272b'],
      outside: ['cars', 'lamps', 'trees'], table: ['#f4f7f8', '#9aa7ad'], prop: 'medkit', shelf: 'medcab', plant: 'pot', rug: null, window: '#d6f3ff', art: 'poster',
    },
    'Factory': {
      sky: ['#5a3a2a', '#21160f', '#080504'], fog: ['#1e1510', 16, 40], hemi: [0xffe9d0, 0x3a332c, .52], sun: [0xffcf9a, .6],
      floor: ['concrete', '#8d8f94', '#6a6c70', 10], wall: ['metal', '#5a6069', '#454a52', '#f2c200'], ground: ['concrete', '#5d5f63', '#46484c'],
      outside: ['barrels', 'lamps', 'stacks'], table: ['#5b6068', '#2f3238'], prop: 'toolbox', shelf: 'crates', plant: 'barrel', rug: null, window: '#ffb35c', sconce: '#ffb347', art: 'hazard',
    },
    'Ice Castle': {
      sky: ['#3a6aa8', '#16305a', '#060d1c'], fog: ['#1a2c4a', 18, 44], hemi: [0xeaf6ff, 0x4a6a8a, .56], sun: [0xdff2ff, .66],
      floor: ['ice', '#cfeeff', '#9fd2f2', 90], wall: ['iceblock', '#6fa8d2', '#b9e2fa', '#4a7fa8'], ground: ['snow', '#eef6fb', '#c9dceb'],
      outside: ['pines', 'crystals'], table: ['#bfe6ff', '#7fb3d9'], prop: 'crystal', shelf: 'iceblock', plant: 'crystal', rug: ['#3b6fb0', '#e6f6ff'], window: '#bfeaff', sconce: '#9fe8ff', art: null, weather: 'snow', moon: 1,
    },
    'Haunted Manor': {
      sky: ['#1f1236', '#0b0814', '#030205'], fog: ['#120b1f', 11, 28], hemi: [0xd8ccff, 0x2a1f3a, .36], sun: [0xb9b0ff, .42], lo: [.64, .62],
      floor: ['stone', '#5c5070', '#221b2c', 15], wall: ['stone', '#3a3048', '#4a3d5e', '#140f1c'], ground: ['deadgrass', '#3a3324', '#2a2418'],
      outside: ['deadtrees', 'graves', 'fence'], table: ['#3a2a22', '#22180f'], prop: 'candle', shelf: 'books', plant: 'pot', rug: ['#3a1030', '#7a5a2a'], window: '#8cff9f', sconce: '#ffb347', art: 'creepy', weather: 'rain', moon: 1,
    },
  };
  const texCache = new Map(); // textures are kept between maps: drawing them takes a moment
  const cached = (k, make) => { if (!texCache.has(k)) texCache.set(k, make()); return texCache.get(k); };
  function skyTex(c) {
    return cached('sky' + c, () => { const t = canvasTex(4, 256, g => { const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, c[0]); gr.addColorStop(.55, c[1]); gr.addColorStop(1, c[2]); g.fillStyle = gr; g.fillRect(0, 0, 4, 256); }); t.anisotropy = 1; return t; });
  }
  // stars and a moon, far away in the sky
  const STARS = 600, starPos = new Float32Array(STARS * 3);
  for (let i = 0; i < STARS; i++) { const a = Math.random() * Math.PI * 2, e = .15 + Math.random() * 1.3, r = 90; starPos.set([Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r], i * 3); }
  const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: .45, transparent: true, opacity: .85, fog: false, depthWrite: false }));
  stars.frustumCulled = false; scene.add(stars);
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ fog: false, depthWrite: false, map: canvasTex(128, 128, (g, r) => {
    const gl = g.createRadialGradient(64, 64, 20, 64, 64, 64); gl.addColorStop(0, 'rgba(255,250,230,.5)'); gl.addColorStop(1, 'rgba(255,250,230,0)'); g.fillStyle = gl; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#fff8e0'; g.beginPath(); g.arc(64, 64, 26, 0, 7); g.fill(); g.fillStyle = 'rgba(180,170,150,.45)';
    for (const [x, y, s] of [[56, 56, 6], [72, 70, 4], [66, 50, 3], [54, 74, 3]]) { g.beginPath(); g.arc(x, y, s, 0, 7); g.fill(); }
  }) }));
  moon.scale.set(16, 16, 1); scene.add(moon);

  function instanced(geo, material, cells, place) {
    const m = new THREE.InstancedMesh(geo, material, Math.max(1, cells.length));
    const o = new THREE.Object3D();
    cells.forEach((c, i) => { o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); const col = place(o, c[0], c[1], c, i); o.updateMatrix(); m.setMatrixAt(i, o.matrix); if (col) m.setColorAt(i, new THREE.Color(col)); });
    m.count = cells.length; return m;
  }
  const tint = () => new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const tm = (map, extra) => new THREE.MeshLambertMaterial({ map, ...extra });
  function buildMap(M) {
    if (mapGroup) { scene.remove(mapGroup); mapGroup.traverse(o => { if (o.geometry && o.geometry !== G.unit) o.geometry.dispose(); }); }
    mapGroup = new THREE.Group(); mapIdx = M.idx;
    const th = theme = THEMES[M.name] || THEMES.Mansion, add = o => { mapGroup.add(o); return o; }, cx = M.W / 2, cz = M.H / 2;
    const at = (x, y) => (M.grid[y] || [])[x], open = (x, y) => { const c = at(x, y); return c !== undefined && c !== '#' && c !== 'B'; };
    mapGlows = [];
    scene.background = skyTex(th.sky);
    scene.fog.color.set(th.fog[0]); scene.fog.near = th.fog[1]; scene.fog.far = th.fog[2];
    hemi.color.set(th.hemi[0]); hemi.groundColor.set(th.hemi[1]); sun.color.set(th.sun[0]);
    stars.position.set(cx, 0, cz); moon.visible = !!th.moon; moon.position.set(cx - 45, 40, cz - 60);
    // floor
    const [fk, fa, fb, shine] = th.floor;
    const floorTex = cached('f' + th.floor, () => canvasTex(128, 128, (g, r) => SURF[fk](g, r, fa, fb), true, 7)).clone();
    floorTex.needsUpdate = true; floorTex.repeat.set(M.W, M.H);
    const floor = add(new THREE.Mesh(new THREE.PlaneGeometry(M.W, M.H), new THREE.MeshPhongMaterial({ map: floorTex, shininess: shine, specular: shine > 40 ? 0x3a3a44 : 0x141418 })));
    floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0, cz); floor.receiveShadow = true;
    // the ground all around the building
    const [gk, ga, gb] = th.ground, GS = 140;
    const groundTex = cached('g' + th.ground, () => canvasTex(128, 128, (g, r) => SURF[gk](g, r, ga, gb), true, 11)).clone();
    groundTex.needsUpdate = true; groundTex.repeat.set(GS / 2, GS / 2);
    const ground = add(new THREE.Mesh(new THREE.PlaneGeometry(GS, GS), new THREE.MeshLambertMaterial({ map: groundTex })));
    ground.rotation.x = -Math.PI / 2; ground.position.set(cx, -.03, cz); ground.receiveShadow = true;
    const cells = { '#': [], T: [], P: [], B: [] };
    for (let y = 0; y < M.H; y++) for (let x = 0; x < M.W; x++) { const c = M.grid[y][x]; if (cells[c]) cells[c].push([x, y]); }
    // walls
    const WH = 1.35, [wk, wa, wb, wt] = th.wall;
    const wallMat = tm(cached('w' + th.wall, () => canvasTex(128, 172, (g, r) => WALLS[wk](g, r, wa, wb, wt), false, 3)));
    add(instanced(G.unit, wallMat, cells['#'], (o, x, y) => { o.position.set(x + .5, WH / 2, y + .5); o.scale.set(1, WH, 1); }));
    add(instanced(G.unit, mat(M.wallTop), cells['#'], (o, x, y) => { o.position.set(x + .5, WH + .03, y + .5); o.scale.set(1.02, .06, 1.02); }));
    // the faces of walls you can see from a room: [x, y, dx, dy] (dx/dy points into the room)
    const faces = [];
    for (const [x, y] of cells['#']) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (at(x + dx, y + dy) === '.') faces.push([x, y, dx, dy]);
    const onFace = (o, f, h, out = .51) => { o.position.set(f[0] + .5 + f[2] * out, h, f[1] + .5 + f[3] * out); o.rotation.y = Math.atan2(f[2], f[3]); };
    const edgeWall = (x, y) => x === 0 || y === 0 || x === M.W - 1 || y === M.H - 1;
    // windows: in the outside walls, lit from both sides
    const winTex = cached('win', () => canvasTex(64, 64, g => { g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#2a2a2a'; g.fillRect(0, 0, 64, 5); g.fillRect(0, 59, 64, 5); g.fillRect(0, 0, 5, 64); g.fillRect(59, 0, 5, 64); g.fillRect(30, 0, 4, 64); g.fillRect(0, 30, 64, 4); g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(8, 8, 6, 18); }));
    const wins = faces.filter(([x, y, dx, dy]) => edgeWall(x, y) && (x + y) % 3 === 0 && hash(x, y, 1) < .8);
    const winMat = new THREE.MeshBasicMaterial({ map: winTex, color: th.window });
    const winGeo = new THREE.PlaneGeometry(.58, .62);
    add(instanced(winGeo, winMat, wins, (o, x, y, f) => onFace(o, f, .8)));
    add(instanced(winGeo, winMat, wins, (o, x, y, f) => onFace(o, [x, y, -f[2], -f[3]], .8))); // the same window seen from outside
    add(instanced(box(.68, .06, .14), mat(wt), wins, (o, x, y, f) => onFace(o, f, .47, .55))); // sill
    // pictures, boards or signs on the walls inside
    if (th.art) for (let k = 0; k < 2; k++) {
      const spots = faces.filter(([x, y, dx, dy]) => !(edgeWall(x, y) && (x + y) % 3 === 0) && hash(x, y, dx * 3 + dy + 7) < .16 && (hash(x, y, 9) < .5) === !!k);
      const t = cached('art' + th.art + k, () => canvasTex(64, 48, (g, r) => ART[th.art](g, r, k), false, 5 + k));
      add(instanced(new THREE.PlaneGeometry(.62, .46), th.art === 'creepy' ? new THREE.MeshBasicMaterial({ map: t, color: '#8a7f99' }) : tm(t), spots, (o, x, y, f) => onFace(o, f, .9)));
    }
    // wall lamps (sconces)
    if (th.sconce) {
      const sc = faces.filter(([x, y, dx, dy]) => hash(x, y, dx * 5 + dy * 2 + 31) < .07);
      add(instanced(box(.1, .16, .06), mat('#c9a24a'), sc, (o, x, y, f) => onFace(o, f, .98, .53)));
      add(instanced(new THREE.SphereGeometry(.06, 8, 6), new THREE.MeshBasicMaterial({ color: th.sconce }), sc, (o, x, y, f) => onFace(o, f, 1.1, .56)));
      for (const f of sc) mapGlows.push([f[0] + .5 + f[2] * .58, 1.1, f[1] + .5 + f[3] * .58, .9, th.sconce, 1]);
    }
    // door frames, with wall above the doorway
    for (const [x, y] of M.doors || []) {
      const alongX = at(x - 1, y) === '#' || at(x + 1, y) === '#';
      const post = (px, pz) => { const p = add(new THREE.Mesh(G.unit, mat(wt))); p.scale.set(alongX ? .1 : 1.04, 1.2, alongX ? 1.04 : .1); p.position.set(px, .6, pz); };
      if (alongX) { post(x + .05, y + .5); post(x + .95, y + .5); } else { post(x + .5, y + .05); post(x + .5, y + .95); }
      const top = add(new THREE.Mesh(G.unit, wallMat)); top.scale.set(1, WH - 1.2, 1); top.position.set(x + .5, (WH + 1.2) / 2, y + .5);
      const cap = add(new THREE.Mesh(G.unit, mat(M.wallTop))); cap.scale.set(1.02, .06, 1.02); cap.position.set(x + .5, WH + .03, y + .5);
      const trim = add(new THREE.Mesh(G.unit, mat(wt))); trim.scale.set(alongX ? 1 : 1.06, .08, alongX ? 1.06 : 1); trim.position.set(x + .5, 1.2, y + .5);
    }
    // tables, and something on them
    add(instanced(G.unit, mat(th.table[0]), cells.T, (o, x, y) => { o.position.set(x + .5, .42, y + .5); o.scale.set(.98, .08, .98); }));
    add(instanced(G.unit, mat(th.table[1]), cells.T, (o, x, y) => { o.position.set(x + .5, .19, y + .5); o.scale.set(.8, .38, .8); }));
    const tops = cells.T.filter(([x, y]) => hash(x, y, 3) < (th.prop === 'candle' ? 1 : .55)).map(([x, y]) => [x + .5 + (hash(x, y, 4) - .5) * .4, y + .5 + (hash(x, y, 5) - .5) * .4, hash(x, y, 6)]);
    buildProps(th, tops, add);
    // bookshelves and the like
    add(instanced(G.unit, tm(cached('s' + th.shelf, () => canvasTex(64, 80, (g, r) => SHELVES[th.shelf](g, r), false, 9))), cells.B, (o, x, y) => { o.position.set(x + .5, .6, y + .5); o.scale.set(.96, 1.2, .96); }));
    // plants
    if (th.plant === 'barrel') add(instanced(new THREE.CylinderGeometry(.26, .26, .62, 14), tint(), cells.P, (o, x, y) => { o.position.set(x + .5, .31, y + .5); return ['#c92a2a', '#1971c2', '#f08c00', '#2b8a3e'][hash(x, y, 2) * 4 | 0]; }));
    else if (th.plant === 'crystal') {
      add(instanced(new THREE.OctahedronGeometry(.3, 0), mat('#9fe8ff', { emissive: '#1d5f80', transparent: true, opacity: .85 }), cells.P, (o, x, y) => { o.position.set(x + .5, .4, y + .5); o.scale.set(.7, 1.5, .7); o.rotation.y = hash(x, y) * 3; }));
      add(instanced(new THREE.OctahedronGeometry(.16, 0), mat('#d8f6ff', { emissive: '#2a6f90' }), cells.P, (o, x, y) => { o.position.set(x + .3, .2, y + .65); o.scale.set(.7, 1.6, .7); o.rotation.z = .4; }));
      for (const [x, y] of cells.P) mapGlows.push([x + .5, .5, y + .5, 1.1, '#7fdcff', 0]);
    } else {
      add(instanced(new THREE.CylinderGeometry(.18, .13, .32, 12), mat('#9a5432'), cells.P, (o, x, y) => { o.position.set(x + .5, .16, y + .5); }));
      add(instanced(new THREE.IcosahedronGeometry(.26, 1), tint(), cells.P, (o, x, y) => { o.position.set(x + .5, .52, y + .5); return M.plant || '#2f9e44'; }));
      add(instanced(new THREE.IcosahedronGeometry(.18, 1), tint(), cells.P, (o, x, y) => { o.position.set(x + .5 + (hash(x, y) - .5) * .2, .74, y + .5 + .08); return shade(M.plant || '#2f9e44', 1.25); }));
    }
    // rugs
    if (th.rug) {
      const rugTex = cached('rug' + th.rug, () => canvasTex(96, 64, g => {
        const [a, b] = th.rug; g.fillStyle = b; g.fillRect(0, 0, 96, 64); g.fillStyle = a; g.fillRect(5, 5, 86, 54); g.strokeStyle = b; g.lineWidth = 2; g.strokeRect(10, 10, 76, 44);
        g.fillStyle = b; g.beginPath(); g.moveTo(48, 18); g.lineTo(64, 32); g.lineTo(48, 46); g.lineTo(32, 32); g.fill(); g.fillStyle = a; g.beginPath(); g.arc(48, 32, 5, 0, 7); g.fill();
        g.fillStyle = 'rgba(0,0,0,.15)'; for (let x = 0; x < 96; x += 4) g.fillRect(x, 0, 1, 64);
      }));
      const rugs = [], free = (x, y) => { for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) if (at(x + i, y + j) !== '.') return false; return true; };
      for (let y = 1; y < M.H - 3; y += 3) for (let x = 1; x < M.W - 4; x += 5) if (free(x, y) && hash(x, y, 8) < .45) rugs.push([x, y]);
      add(instanced(new THREE.PlaneGeometry(3, 2), new THREE.MeshLambertMaterial({ map: rugTex, polygonOffset: true, polygonOffsetFactor: -1 }), rugs, (o, x, y) => { o.position.set(x + 2, .006, y + 1.5); o.rotation.x = -Math.PI / 2; }));
    }
    buildOutside(M, th, add);
    mapGroup.traverse(o => { if (o.isMesh && o !== floor && o !== ground && !(o.material && o.material.isMeshBasicMaterial)) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(mapGroup);
  }
  // things on tables: tops = [x, z, random]
  function buildProps(th, tops, add) {
    const P = (geo, m, place) => add(instanced(geo, m, tops, place));
    switch (th.prop) {
      case 'vase':
        P(new THREE.CylinderGeometry(.06, .09, .2, 10), mat('#3a6ea5'), (o, x, z) => { o.position.set(x, .56, z); });
        P(new THREE.IcosahedronGeometry(.1, 0), tint(), (o, x, z, t) => { o.position.set(x, .72, z); return ['#e64980', '#fab005', '#f8f9fa', '#ff6b6b'][t[2] * 4 | 0]; });
        break;
      case 'computer':
        P(box(.36, .24, .03), mat('#1f2329'), (o, x, z, t) => { o.position.set(x, .62, z); o.rotation.y = (t[2] * 4 | 0) * Math.PI / 2; });
        P(new THREE.PlaneGeometry(.32, .2), new THREE.MeshBasicMaterial({ color: '#4dabf7' }), (o, x, z, t) => { const a = (t[2] * 4 | 0) * Math.PI / 2; o.position.set(x + Math.sin(a) * .016, .62, z + Math.cos(a) * .016); o.rotation.y = a; });
        P(box(.3, .02, .1), mat('#343a40'), (o, x, z, t) => { const a = (t[2] * 4 | 0) * Math.PI / 2; o.position.set(x + Math.sin(a) * .18, .47, z + Math.cos(a) * .18); o.rotation.y = a; });
        break;
      case 'lamp':
        P(new THREE.CylinderGeometry(.02, .06, .26, 8), mat('#c9a24a'), (o, x, z) => { o.position.set(x, .59, z); });
        P(new THREE.CylinderGeometry(.08, .14, .14, 12, 1, true), new THREE.MeshBasicMaterial({ color: '#ffe3a3', side: THREE.DoubleSide }), (o, x, z) => { o.position.set(x, .76, z); });
        for (const [x, z] of tops) mapGlows.push([x, .76, z, .9, '#ffcf70', 0]);
        break;
      case 'gold':
        P(box(.16, .07, .08), mat('#ffd43b', { emissive: '#5c4300' }), (o, x, z, t) => { o.position.set(x, .5, z); o.rotation.y = t[2] * 3; });
        P(box(.16, .07, .08), mat('#ffd43b', { emissive: '#5c4300' }), (o, x, z, t) => { o.position.set(x + .05, .57, z + .02); o.rotation.y = t[2] * 3 + .3; });
        P(new THREE.CylinderGeometry(.06, .06, .1, 12), mat('#ffe066', { emissive: '#5c4300' }), (o, x, z) => { o.position.set(x - .18, .51, z + .1); });
        for (const [x, z] of tops) mapGlows.push([x, .6, z, .55, '#ffd43b', 0]);
        break;
      case 'medkit':
        P(box(.26, .14, .18), mat('#f8f9fa'), (o, x, z, t) => { o.position.set(x, .53, z); o.rotation.y = t[2] * 3; });
        P(box(.07, .005, .16), mat('#e03131'), (o, x, z, t) => { o.position.set(x, .6, z); o.rotation.y = t[2] * 3; });
        P(box(.07, .005, .16), mat('#e03131'), (o, x, z, t) => { o.position.set(x, .6, z); o.rotation.y = t[2] * 3 + Math.PI / 2; o.scale.set(1, 1, .9); });
        break;
      case 'toolbox':
        P(box(.32, .14, .16), mat('#c92a2a'), (o, x, z, t) => { o.position.set(x, .53, z); o.rotation.y = t[2] * 3; });
        P(box(.2, .03, .03), mat('#343a40'), (o, x, z, t) => { o.position.set(x, .63, z); o.rotation.y = t[2] * 3; });
        P(new THREE.CylinderGeometry(.015, .015, .26, 6), mat('#adb5bd'), (o, x, z, t) => { o.position.set(x + .2, .47, z - .12); o.rotation.set(Math.PI / 2, 0, t[2] * 3); });
        break;
      case 'crystal':
        P(new THREE.OctahedronGeometry(.1, 0), mat('#b197fc', { emissive: '#3b1f8a' }), (o, x, z, t) => { o.position.set(x, .6, z); o.scale.set(.8, 1.6, .8); o.rotation.y = t[2] * 3; });
        for (const [x, z] of tops) mapGlows.push([x, .6, z, .6, '#b197fc', 0]);
        break;
      case 'candle':
        P(new THREE.CylinderGeometry(.035, .04, .14, 8), mat('#efe6d2'), (o, x, z) => { o.position.set(x, .53, z); });
        P(new THREE.SphereGeometry(.025, 6, 5), new THREE.MeshBasicMaterial({ color: '#ffcc66' }), (o, x, z) => { o.position.set(x, .62, z); o.scale.set(1, 1.6, 1); });
        for (const [x, z] of tops) mapGlows.push([x, .64, z, .5, '#ffb347', 1]);
        break;
    }
  }
  // the world outside the walls: trees, lamps, cars, a skyline...
  function buildOutside(M, th, add) {
    const r = rng(M.idx * 977 + 13), cx = M.W / 2, cz = M.H / 2, kinds = th.outside, GS_ROAD = 140;
    // spots in a ring around the building
    const ring = (n, near, far) => { const out = []; let tries = 0; while (out.length < n && tries++ < n * 20) { const x = -far + r() * (M.W + far * 2), z = -far + r() * (M.H + far * 2); if (x > -near && x < M.W + near && z > -near && z < M.H + near) continue; out.push([x, z, r()]); } return out; };
    const perim = (off, step) => { const out = []; for (let x = -off; x <= M.W + off; x += step) out.push([x, -off], [x, M.H + off]); for (let z = -off + step; z < M.H + off; z += step) out.push([-off, z], [M.W + off, z]); return out; };
    if (kinds.includes('trees')) {
      const t = ring(60, 3, 16);
      add(instanced(new THREE.CylinderGeometry(.12, .17, 1.2, 7), mat('#5c3b22'), t, (o, x, z, p) => { o.position.set(x, .6, z); o.scale.setScalar(.8 + p[2] * .7); }));
      add(instanced(new THREE.IcosahedronGeometry(.85, 1), tint(), t, (o, x, z, p) => { const s = .8 + p[2] * .7; o.position.set(x, 1.5 * s, z); o.scale.setScalar(s); return shade('#3f8a35', .8 + p[2] * .4); }));
      add(instanced(new THREE.IcosahedronGeometry(.6, 1), tint(), t, (o, x, z, p) => { const s = .8 + p[2] * .7; o.position.set(x + .3 * s, 2.1 * s, z - .2 * s); o.scale.setScalar(s); return shade('#4fa043', .8 + p[2] * .4); }));
    }
    if (kinds.includes('pines')) {
      const t = ring(80, 3, 18);
      add(instanced(new THREE.CylinderGeometry(.1, .14, .7, 6), mat('#4a3020'), t, (o, x, z, p) => { o.position.set(x, .35, z); o.scale.setScalar(.8 + p[2]); }));
      for (const [y, rad, h] of [[1, .9, 1.2], [1.7, .7, 1], [2.3, .45, .8]]) {
        add(instanced(new THREE.ConeGeometry(rad, h, 8), tint(), t, (o, x, z, p) => { const s = .8 + p[2]; o.position.set(x, y * s, z); o.scale.setScalar(s); return y > 2 ? '#e9f4fb' : shade('#2d6a4f', .8 + p[2] * .3); }));
      }
    }
    if (kinds.includes('crystals')) {
      const t = ring(26, 2.5, 12);
      add(instanced(new THREE.OctahedronGeometry(.5, 0), mat('#9fe8ff', { emissive: '#1d5f80', transparent: true, opacity: .8 }), t, (o, x, z, p) => { o.position.set(x, .6, z); o.scale.set(.6, 1.8 + p[2], .6); o.rotation.set(p[2] - .5, p[2] * 6, 0); }));
      t.slice(0, 10).forEach(([x, z]) => mapGlows.push([x, .8, z, 2.2, '#7fdcff', 0]));
    }
    if (kinds.includes('deadtrees')) {
      const t = ring(40, 3, 15);
      const bark = mat('#2b2230');
      add(instanced(new THREE.CylinderGeometry(.06, .16, 2.4, 6), bark, t, (o, x, z, p) => { o.position.set(x, 1.2, z); o.rotation.z = (p[2] - .5) * .25; }));
      for (const [y, a, l] of [[1.4, .9, 1], [1.9, -1, .8], [1.1, 2.4, .7]]) add(instanced(new THREE.CylinderGeometry(.025, .06, l, 5), bark, t, (o, x, z, p) => { const d = a + p[2] * 2; o.position.set(x + Math.cos(d) * l * .35, y + l * .3, z + Math.sin(d) * l * .35); o.rotation.set(Math.sin(d) * .9, 0, -Math.cos(d) * .9); }));
    }
    if (kinds.includes('graves')) {
      const t = ring(46, 2.2, 10);
      const stone = (o, p, tilt) => { o.rotation.order = 'YXZ'; o.rotation.set(tilt + (p[2] - .5) * .25, (p[2] - .5) * .6, 0); };
      add(instanced(box(.5, .7, .14), mat('#6b6676'), t, (o, x, z, p) => { o.position.set(x, .33, z); stone(o, p, 0); }));
      add(instanced(new THREE.CylinderGeometry(.25, .25, .14, 14), mat('#6b6676'), t, (o, x, z, p) => { o.position.set(x, .68, z); stone(o, p, Math.PI / 2); }));
      add(instanced(box(.6, .04, 1), mat('#3a2e24'), t, (o, x, z, p) => { o.position.set(x, -.01, z + .55); o.rotation.y = (p[2] - .5) * .6; }));
    }
    if (kinds.includes('fence')) {
      const posts = perim(1.6, .45);
      add(instanced(box(.05, .9, .05), mat('#1d1b22'), posts, (o, x, z) => { o.position.set(x, .45, z); }));
      add(instanced(new THREE.ConeGeometry(.04, .12, 4), mat('#1d1b22'), posts, (o, x, z) => { o.position.set(x, .96, z); }));
      for (const y of [.25, .8]) for (const [x, z, w, d] of [[cx, -1.6, M.W + 3.2, .04], [cx, M.H + 1.6, M.W + 3.2, .04], [-1.6, cz, .04, M.H + 3.2], [M.W + 1.6, cz, .04, M.H + 3.2]]) { const b = add(new THREE.Mesh(G.unit, mat('#1d1b22'))); b.scale.set(w, .04, d); b.position.set(x, y, z); }
    }
    if (kinds.includes('lamps')) {
      const lamps = perim(th.outside.includes('fence') ? 2.4 : 1.6, 5);
      add(instanced(new THREE.CylinderGeometry(.04, .06, 2.2, 8), mat('#2b2d33'), lamps, (o, x, z) => { o.position.set(x, 1.1, z); }));
      add(instanced(box(.22, .22, .22), new THREE.MeshBasicMaterial({ color: '#ffe8a8' }), lamps, (o, x, z) => { o.position.set(x, 2.25, z); }));
      add(instanced(new THREE.ConeGeometry(.2, .14, 4), mat('#2b2d33'), lamps, (o, x, z) => { o.position.set(x, 2.43, z); o.rotation.y = Math.PI / 4; }));
      for (const [x, z] of lamps) mapGlows.push([x, 2.25, z, 1.6, '#ffd98a', 0]);
    }
    if (kinds.includes('cars')) {
      // a road along one side, with cars parked by it
      const roadZ = M.H + 5.2, road = add(new THREE.Mesh(new THREE.PlaneGeometry(GS_ROAD, 3), new THREE.MeshLambertMaterial({ color: '#202226' })));
      road.rotation.x = -Math.PI / 2; road.position.set(cx, -.015, roadZ); road.receiveShadow = true;
      const dashes = []; for (let x = cx - GS_ROAD / 2; x < cx + GS_ROAD / 2; x += 2) dashes.push([x, roadZ]);
      add(instanced(new THREE.PlaneGeometry(.9, .1), new THREE.MeshBasicMaterial({ color: '#e8c547' }), dashes, (o, x, z) => { o.position.set(x, -.01, z); o.rotation.x = -Math.PI / 2; }));
      const cars = []; for (let x = -6; x < M.W + 6; x += 2.6) if (r() < .6) cars.push([x, roadZ - .75, r()]);
      for (let x = -4; x < M.W + 4; x += 3.1) if (r() < .35) cars.push([x, -3.5, r()]);
      const carCol = ['#c92a2a', '#1971c2', '#f8f9fa', '#212529', '#f59f00', '#2b8a3e', '#868e96'];
      add(instanced(box(1.5, .4, .72), tint(), cars, (o, x, z, p) => { o.position.set(x, .32, z); return carCol[p[2] * carCol.length | 0]; }));
      add(instanced(box(.8, .32, .66), tint(), cars, (o, x, z, p) => { o.position.set(x - .05, .66, z); return shade(carCol[p[2] * carCol.length | 0], .85); }));
      add(instanced(box(.82, .2, .68), new THREE.MeshBasicMaterial({ color: '#2d4a66' }), cars, (o, x, z) => { o.position.set(x - .05, .68, z); }));
      for (const dx of [-.48, .48]) for (const dz of [-.36, .36]) add(instanced(new THREE.CylinderGeometry(.15, .15, .1, 12), mat('#16181c'), cars, (o, x, z) => { o.position.set(x + dx, .15, z + dz); o.rotation.x = Math.PI / 2; }));
    }
    if (kinds.includes('barrels')) {
      const t = ring(36, 2.2, 10), bc = ['#c92a2a', '#1971c2', '#f08c00', '#495057'];
      add(instanced(new THREE.CylinderGeometry(.28, .28, .7, 12), tint(), t, (o, x, z, p) => { o.position.set(x, .35, z); return bc[p[2] * 4 | 0]; }));
      add(instanced(box(.9, .9, .9), tm(cached('scrates', () => canvasTex(64, 80, (g, rr) => SHELVES.crates(g, rr), false, 9))), t.slice(0, 14), (o, x, z, p) => { o.position.set(x + 1, .45, z + .4); o.rotation.y = p[2]; }));
    }
    if (kinds.includes('stacks')) {
      // smokestacks behind the factory
      const t = [[-10, -14], [M.W + 9, -15], [M.W * .5, -18]];
      add(instanced(new THREE.CylinderGeometry(.7, 1, 9, 14), mat('#6b4a3a'), t, (o, x, z) => { o.position.set(x, 4.5, z); }));
      add(instanced(new THREE.CylinderGeometry(.75, .75, .3, 14), mat('#e8e8e8'), t, (o, x, z) => { o.position.set(x, 7.5, z); }));
      t.forEach(([x, z]) => mapGlows.push([x, 9.2, z, 3, '#ff8c3a', 1]));
    }
    if (kinds.includes('city')) {
      // a skyline in the fog
      const winTex = cached('city', () => { const t = canvasTex(32, 64, (g, rr) => { g.fillStyle = '#15171f'; g.fillRect(0, 0, 32, 64); for (let y = 2; y < 64; y += 5) for (let x = 2; x < 32; x += 5) if (rr() < .45) { g.fillStyle = rr() < .8 ? '#ffd98a' : '#9fd3ff'; g.fillRect(x, y, 3, 3); } }, true, 21); return t; });
      const b = ring(34, 20, 34);
      const m = new THREE.MeshBasicMaterial({ map: winTex, color: '#b8b8c8' });
      add(instanced(G.unit, m, b, (o, x, z, p) => { const h = 6 + p[2] * 14; o.position.set(x, h / 2, z); o.scale.set(2.5 + p[2] * 2, h, 2.5 + p[2] * 2); }));
    }
  }

  // ---------------- pools ----------------
  function pool(make) {
    const items = []; let used = 0;
    return {
      reset() { used = 0; },
      get() { if (used >= items.length) { const o = make(); items.push(o); scene.add(o); } const o = items[used++]; o.visible = true; return o; },
      hideRest() { for (let i = used; i < items.length; i++) items[i].visible = false; },
    };
  }
  const coinGeo = new THREE.CylinderGeometry(.2, .2, .06, 16);
  const coins = pool(() => { const m = new THREE.Mesh(coinGeo, mat('#ffd43b', { emissive: '#6a4d00' })); m.rotation.z = Math.PI / 2; return m; });
  const shadowGeo = new THREE.CircleGeometry(.3, 16), shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .28, depthWrite: false });
  const shadows = pool(() => { const m = new THREE.Mesh(shadowGeo, shadowMat); m.rotation.x = -Math.PI / 2; m.position.y = .01; return m; });
  const bloodMat = mat('#c8001a'), bloodGeo = box(.06, .06, .06);
  const blood = pool(() => new THREE.Mesh(bloodGeo, bloodMat));
  const bulletGeo = box(.45, .05, .05);
  const bullets = pool(() => new THREE.Mesh(bulletGeo, new THREE.MeshBasicMaterial({ color: '#fff6a0' })));
  const booms = pool(() => new THREE.Mesh(new THREE.SphereGeometry(.5, 16, 12), new THREE.MeshBasicMaterial({ color: '#ff8c1a', transparent: true, opacity: .7, depthWrite: false })));
  const flashes = pool(() => new THREE.Mesh(new THREE.SphereGeometry(.14, 8, 8), new THREE.MeshBasicMaterial({ color: '#fff3a0' })));
  const puffs = pool(() => new THREE.Mesh(new THREE.SphereGeometry(.18, 10, 8), new THREE.MeshBasicMaterial({ color: '#e6ecff', transparent: true, opacity: .6, depthWrite: false })));
  const knifeMeshes = pool(() => makeKnife());
  // soft round glow (additive) used for muzzle flashes, tracers, embers, coins and rare weapons
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
  })();
  const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
  const glows = pool(() => new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, ...add, fog: false })));
  function glow(x, y, z, size, color, op = 1) { const g = glows.get(); g.position.set(x, y, z); g.scale.set(size, size, 1); g.material.color.set(color); g.material.opacity = op; return g; }
  // bullet tracers: a flat streak that fades out toward the tail
  const tracerTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 8; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 8); return new THREE.CanvasTexture(c);
  })();
  const tracerGeo = new THREE.PlaneGeometry(1, 1); tracerGeo.rotateX(-Math.PI / 2);
  const tracers = pool(() => new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ map: tracerTex, ...add, side: THREE.DoubleSide })));
  // knife slash: a glowing crescent in front of the murderer
  const slashGeo = new THREE.RingGeometry(.3, .62, 24, 1, -1.15, 2.3); slashGeo.rotateX(-Math.PI / 2);
  const slashes = pool(() => new THREE.Mesh(slashGeo, new THREE.MeshBasicMaterial({ ...add, side: THREE.DoubleSide })));
  // shockwave ring on the floor (bomb jumps, landings)
  const waveGeo = new THREE.RingGeometry(.82, 1, 40); waveGeo.rotateX(-Math.PI / 2);
  const waves = pool(() => new THREE.Mesh(waveGeo, new THREE.MeshBasicMaterial({ ...add, side: THREE.DoubleSide })));
  // blood on the floor, stays for the round
  const decalGeo = new THREE.CircleGeometry(.5, 18); decalGeo.rotateX(-Math.PI / 2);
  const decalMat = new THREE.MeshLambertMaterial({ color: '#7a0010', transparent: true, opacity: .85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const decals = pool(() => { const m = new THREE.Mesh(decalGeo, decalMat); m.receiveShadow = true; return m; });
  // see-through figure: souls floating up from bodies, and after-images when someone jukes
  function figure() {
    const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
    const part = (w, h, d, y) => { const p = new THREE.Mesh(box(w, h, d), m); p.position.y = y; g.add(p); };
    part(.2, .38, .34, .55); part(.26, .26, .26, .88); part(.14, .36, .28, .18); part(.1, .3, .5, .6);
    g.userData.m = m; g.scale.setScalar(1.1); return g;
  }
  const ghosts = pool(figure), echoes = pool(figure);
  const pools = [coins, shadows, blood, bullets, flashes, booms, puffs, knifeMeshes, glows, tracers, slashes, waves, decals, ghosts, echoes];
  // dust floating in the air around the camera
  const DUST = 240, dustPos = new Float32Array(DUST * 3), dustSeed = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) { dustPos[i * 3] = Math.random() * 28 - 14; dustPos[i * 3 + 1] = Math.random() * 3.2; dustPos[i * 3 + 2] = Math.random() * 28 - 14; dustSeed[i] = Math.random() * 100; }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: '#ffe6c2', size: .05, map: glowTex, ...add, opacity: .55 }));
  dust.frustumCulled = false; scene.add(dust);

  // ---------------- weapons + characters ----------------
  // ---------------- weapon models ----------------
  // Every skin gets a model by type (dagger, serrated, cleaver, scythe, energy / pistol, revolver, blaster, sniper, water).
  // Models are built once per skin and cloned; +X points forward, +Y up (flat blade faces the camera).
  const chromaMats = [];
  function skinMat(item, opts = {}) {
    const m = new THREE.MeshStandardMaterial({ color: item.col === 'chroma' ? '#ff0000' : item.col, metalness: opts.metal ?? .45, roughness: opts.rough ?? .35, emissive: opts.glow ? (item.col === 'chroma' ? '#ff0000' : item.col) : '#000000', emissiveIntensity: opts.glow ? .8 : 1, transparent: !!opts.alpha, opacity: opts.alpha || 1 });
    if (item.col === 'chroma') chromaMats.push([m, !!opts.glow]);
    return m;
  }
  const steel = new THREE.MeshStandardMaterial({ color: '#b9bec7', metalness: .7, roughness: .25 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: '#2c2d33', metalness: .6, roughness: .45 });
  const wood = mat('#6b3f22'), woodDark = mat('#3b2616'), black = mat('#141418');
  const mesh = (geo, m, x = 0, y = 0, z = 0, parent) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); if (parent) parent.add(o); return o; };
  function flatShape(draw, depth = .018) {
    const sh = new THREE.Shape(); draw(sh);
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: .005, bevelSize: .005, bevelSegments: 1 });
    g.translate(0, 0, -depth / 2); g.rotateX(-Math.PI / 2); return g;
  }
  const blades = {
    dagger: L => flatShape(s => { s.moveTo(0, -.045); s.lineTo(L * .72, -.05); s.quadraticCurveTo(L * .93, -.035, L, .012); s.lineTo(L * .7, .04); s.lineTo(0, .04); }),
    serrated: L => flatShape(s => { s.moveTo(0, -.045); s.lineTo(L * .75, -.05); s.quadraticCurveTo(L * .95, -.03, L, .015); const n = 7; for (let i = 0; i <= n; i++) s.lineTo(L * (.8 - i * .8 / n), i % 2 ? .07 : .045); s.lineTo(0, .045); }),
    cleaver: L => flatShape(s => { s.moveTo(0, -.03); s.lineTo(L * .85, -.09); s.lineTo(L, -.07); s.lineTo(L * .97, .045); s.lineTo(0, .045); }),
    curved: L => flatShape(s => { s.moveTo(0, -.04); s.quadraticCurveTo(L * .6, -.1, L, .07); s.quadraticCurveTo(L * .55, -.02, 0, .045); }),
  };
  function hilt(g, item, gemGlow) {
    mesh(box(.035, .04, .19), darkMetal, .01, 0, 0, g);                                   // crossguard
    mesh(new THREE.SphereGeometry(.025, 8, 6), skinMat(item, { glow: gemGlow }), .01, .02, 0, g); // gem in the guard
    const grip = new THREE.CylinderGeometry(.027, .031, .15, 8); grip.rotateZ(Math.PI / 2);
    mesh(grip, woodDark, -.075, 0, 0, g);
    const wrap = new THREE.CylinderGeometry(.034, .034, .014, 8); wrap.rotateZ(Math.PI / 2);
    for (const x of [-.04, -.075, -.11]) mesh(wrap, darkMetal, x, 0, 0, g);            // grip wraps
    mesh(new THREE.SphereGeometry(.038, 8, 6), darkMetal, -.16, 0, 0, g);                 // pommel
  }
  function knifeStyle(item) {
    const n = item.name.toLowerCase();
    if (/void/.test(n)) return 'void';
    if (/scythe|reaper|duskblade/.test(n)) return 'scythe';
    if (/ray blade|galaxy|stardust|neon|sussy|chroma venom|glacier|star blade|saber|no life|death itself/.test(n)) return 'energy';
    if (/butter|kitchen|rusty|sunburn|machete|box cutter/.test(n)) return 'cleaver';
    if (/frost|toxic|thunder|blood|death|scorch|inferno/.test(n)) return 'serrated';
    return 'dagger';
  }
  function buildKnife(item) {
    const g = new THREE.Group(), L = item.long ? .58 : .36, style = knifeStyle(item);
    if (style === 'scythe') {
      // long pole with a curved blade hooking sideways at the end
      const pole = new THREE.CylinderGeometry(.022, .022, .6, 8); pole.rotateZ(Math.PI / 2);
      mesh(pole, woodDark, .12, 0, 0, g);
      for (const x of [-.12, .38]) { const c = new THREE.CylinderGeometry(.03, .03, .03, 8); c.rotateZ(Math.PI / 2); mesh(c, darkMetal, x, 0, 0, g); }
      const b = mesh(blades.curved(L * .9), skinMat(item, { metal: .6 }), .4, 0, 0, g); b.rotation.y = Math.PI / 2;
      mesh(new THREE.SphereGeometry(.03, 8, 6), skinMat(item, { glow: true }), .4, .02, 0, g);
      return g;
    }
    if (style === 'void') {
      // black blade with a glowing purple edge and a rift down the middle
      mesh(blades.serrated(L), new THREE.MeshStandardMaterial({ color: '#0b0614', metalness: .8, roughness: .2 }), .02, 0, 0, g);
      mesh(blades.dagger(L * .92), skinMat(item, { glow: true, alpha: .55 }), .03, .004, 0, g);
      mesh(box(L * .7, .006, .01), new THREE.MeshBasicMaterial({ color: '#e0c8ff' }), .04 + L * .35, .012, 0, g);
      hilt(g, item, true);
      return g;
    }
    if (style === 'energy') {
      mesh(blades.dagger(L), skinMat(item, { glow: true, alpha: .9 }), .03, 0, 0, g);
      mesh(blades.dagger(L * .8), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .55 }), .05, .006, 0, g); // bright core
      hilt(g, item, true);
      return g;
    }
    mesh(blades[style](L), skinMat(item, { metal: .6, rough: .25 }), .02, 0, 0, g);
    if (style === 'dagger' || style === 'serrated') mesh(box(L * .6, .004, .012), darkMetal, .02 + L * .32, .016, .005, g); // fuller groove
    hilt(g, item, false);
    return g;
  }
  function gunStyle(item) {
    const n = item.name.toLowerCase();
    if (/void scope/.test(n)) return 'voidscope';
    if (/void/.test(n)) return 'void';
    if (item.long) return 'sniper';
    if (/water|splash/.test(n)) return 'water';
    if (/revolver|golden six|ranger|champion's pistol|death gun/.test(n)) return 'revolver';
    if (/raygun|zapper/.test(n)) return 'blaster';        // the sci-fi raygun look is only for ray guns
    if (/radiant/.test(n)) return 'winged';
    if (/candy swirl/.test(n)) return 'swirl';
    if (/cap gun|bruh|retro/.test(n)) return 'toy';
    if (/blaster|money|jackpot/.test(n)) return 'heavy';
    return 'pistol';
  }
  const cyl = (r, len, seg = 10) => { const c = new THREE.CylinderGeometry(r, r, len, seg); c.rotateZ(Math.PI / 2); return c; };
  function buildGun(item) {
    const g = new THREE.Group(), style = gunStyle(item), main = skinMat(item), glow = skinMat(item, { glow: true });
    const grip = (x, m = darkMetal) => { const gr = mesh(box(.07, .15, .055), m, x, -.085, 0, g); gr.rotation.z = -.35; };
    const trigger = x => { const t = new THREE.TorusGeometry(.03, .008, 4, 8, Math.PI); t.rotateX(Math.PI); mesh(t, darkMetal, x, -.035, 0, g); mesh(box(.01, .03, .01), black, x, -.03, 0, g); };
    if (style === 'pistol') {
      mesh(box(.28, .065, .06), main, .09, .015, 0, g);                 // slide
      mesh(box(.24, .04, .05), darkMetal, .08, -.03, 0, g);             // frame
      mesh(cyl(.016, .06), black, .25, .015, 0, g);                     // muzzle
      mesh(box(.014, .02, .012), black, .21, .055, 0, g); mesh(box(.02, .02, .03), black, -.03, .055, 0, g); // sights
      for (let i = 0; i < 4; i++) mesh(box(.006, .05, .062), darkMetal, -.02 + i * .016, .015, 0, g); // slide grooves
      mesh(box(.12, .008, .062), glow, .12, .049, 0, g);                // accent stripe
      grip(-.01, main); trigger(.04);
    } else if (style === 'revolver') {
      mesh(cyl(.03, .3), main, .2, .025, 0, g);                         // long barrel
      mesh(box(.28, .012, .02), darkMetal, .2, .05, 0, g);              // top rib
      const drum = mesh(cyl(.045, .08, 6), darkMetal, .03, .01, 0, g);   // cylinder
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; mesh(cyl(.01, .082, 6), black, .03, .01 + Math.cos(a) * .03, Math.sin(a) * .03, g); }
      mesh(box(.04, .04, .02), darkMetal, -.03, .045, 0, g);            // hammer
      grip(-.04, wood); trigger(.02);
      mesh(box(.02, .025, .012), main, .34, .05, 0, g);                 // front sight
      drum.rotation.x = .3;
    } else if (style === 'winged') {
      // Radiant: chunky pistol with golden wings sweeping back off the slide
      mesh(box(.3, .08, .07), main, .09, .02, 0, g);
      mesh(box(.26, .04, .055), darkMetal, .08, -.03, 0, g);
      mesh(cyl(.02, .06), black, .26, .02, 0, g);
      const gold = new THREE.MeshStandardMaterial({ color: '#ffcf3a', metalness: .8, roughness: .25, emissive: '#6a4a00' });
      for (const z of [-1, 1]) for (let k = 0; k < 3; k++) {
        const f = mesh(box(.16 - k * .035, .02, .035), gold, -.02 - k * .03, .07 + k * .03, z * (.05 + k * .018), g);
        f.rotation.z = .5 + k * .25; f.rotation.y = z * .35;
      }
      mesh(new THREE.SphereGeometry(.02, 8, 6), skinMat(item, { glow: true }), .06, .065, 0, g); // gem
      grip(-.01, mat('#f2ead0')); trigger(.04);
    } else if (style === 'swirl') {
      // candy-cane barrel: alternating colored and white rings
      mesh(box(.14, .08, .07), main, .0, .02, 0, g);
      for (let k = 0; k < 7; k++) mesh(cyl(.034, .026), k % 2 ? tint() : main, .1 + k * .027, .02, 0, g);
      mesh(new THREE.SphereGeometry(.035, 10, 8), tint(), .3, .02, 0, g);
      grip(-.03, main); trigger(.02);
    } else if (style === 'toy') {
      // toy blaster: chunky rounded body, bright stripes, orange safety tip
      mesh(box(.24, .1, .08), main, .06, .02, 0, g);
      mesh(box(.24, .025, .082), tint(), .06, .045, 0, g);
      mesh(cyl(.03, .08), main, .21, .015, 0, g);
      mesh(cyl(.034, .03), mat('#ff7a1a'), .26, .015, 0, g);                 // orange tip
      mesh(box(.05, .03, .085), mat('#ffd23f'), -.02, .075, 0, g);         // hammer bump
      grip(-.03, mat('#ffd23f')); trigger(.03);
    } else if (style === 'heavy') {
      // boxy SMG: long receiver, short barrel with shroud, top rail, magazine
      mesh(box(.32, .09, .07), main, .07, .02, 0, g);
      mesh(box(.3, .02, .03), darkMetal, .07, .075, 0, g);                 // top rail
      for (let k = 0; k < 5; k++) mesh(box(.012, .02, .036), black, -.04 + k * .055, .088, 0, g);
      mesh(cyl(.028, .1), darkMetal, .27, .02, 0, g);                        // shroud
      mesh(cyl(.014, .04), black, .33, .02, 0, g);                           // muzzle
      mesh(box(.05, .13, .045), darkMetal, .1, -.08, 0, g).rotation.z = .1; // magazine
      mesh(box(.1, .05, .05), darkMetal, -.13, -.005, 0, g);                 // stock stub
      mesh(box(.14, .01, .072), glow, .07, .005, 0, g);                      // accent line
      grip(-.03, darkMetal); trigger(.03);
    } else if (style === 'blaster') {
      mesh(new THREE.SphereGeometry(.07, 12, 10), main, .02, .02, 0, g).scale.set(1.6, 1, 1); // rounded body
      mesh(cyl(.028, .2), darkMetal, .17, .02, 0, g);                   // emitter
      for (const x of [.1, .15, .2]) { const r = new THREE.TorusGeometry(.036, .008, 6, 14); r.rotateY(Math.PI / 2); mesh(r, glow, x, .02, 0, g); } // glowing coils
      mesh(new THREE.SphereGeometry(.03, 10, 8), glow, .28, .02, 0, g); // muzzle orb
      for (const z of [-.06, .06]) { const f = mesh(box(.08, .01, .05), main, -.03, .06, z, g); f.rotation.x = z > 0 ? .5 : -.5; } // fins
      grip(-.02, darkMetal); trigger(.03);
    } else if (style === 'void' || style === 'voidscope') {
      // void weapons: black body cracked with glowing purple rifts, a void orb hovering in a ring
      const dark = new THREE.MeshStandardMaterial({ color: '#0c0716', metalness: .75, roughness: .25 });
      const rift = new THREE.MeshBasicMaterial({ color: '#b27bff' });
      const long = style === 'voidscope';
      mesh(box(long ? .36 : .26, .075, .065), dark, .07, .015, 0, g);                       // body
      if (long) {
        mesh(cyl(.022, .42), dark, .44, .02, 0, g);                                          // long barrel
        for (const x of [.3, .42, .54]) { const rr = new THREE.TorusGeometry(.04, .007, 6, 16); rr.rotateY(Math.PI / 2); mesh(rr, glow, x, .02, 0, g); } // charge rings
        mesh(box(.2, .06, .05), dark, -.18, -.02, 0, g).rotation.z = .12;                    // stock
        mesh(cyl(.026, .22), black, .08, .085, 0, g);                                        // scope
        mesh(new THREE.CircleGeometry(.024, 14).rotateY(Math.PI / 2), rift, .195, .085, 0, g); // purple lens
        mesh(new THREE.SphereGeometry(.03, 12, 10), glow, .67, .02, 0, g);                   // muzzle orb
      } else {
        mesh(cyl(.024, .14), dark, .25, .02, 0, g);                                          // barrel
        mesh(new THREE.SphereGeometry(.026, 12, 10), glow, .33, .02, 0, g);                  // muzzle orb
      }
      for (let k = 0; k < 4; k++) mesh(box(.05, .006, .068), rift, -.03 + k * .07, .02 + (k % 2 ? .02 : -.015), 0, g).rotation.z = k % 2 ? .6 : -.6; // rifts
      const orb = mesh(new THREE.SphereGeometry(.035, 14, 10), new THREE.MeshBasicMaterial({ color: '#05020a' }), .05, .11, 0, g); // the void itself
      const halo = new THREE.TorusGeometry(.05, .008, 6, 20); halo.rotateX(Math.PI / 2); mesh(halo, glow, .05, .11, 0, g);
      orb.scale.setScalar(1);
      grip(-.02, dark); trigger(.03);
    } else if (style === 'sniper') {
      mesh(cyl(.02, .44), darkMetal, .38, .02, 0, g);                   // barrel
      mesh(cyl(.03, .05), black, .6, .02, 0, g);                        // muzzle brake
      mesh(box(.3, .07, .06), main, .08, .01, 0, g);                    // receiver
      mesh(box(.2, .06, .05), main, -.16, -.02, 0, g).rotation.z = .12;  // stock
      mesh(box(.03, .08, .055), black, -.27, -.03, 0, g);               // butt pad
      mesh(cyl(.025, .2), black, .1, .075, 0, g);                       // scope
      for (const x of [0, .2]) mesh(cyl(.032, .025), darkMetal, x, .075, 0, g); // scope rings/caps
      mesh(new THREE.CircleGeometry(.022, 12).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#7ee8ff' }), .214, .075, 0, g); // lens
      mesh(box(.05, .08, .04), darkMetal, .12, -.06, 0, g);             // magazine
      grip(.0, darkMetal); trigger(.05);
    } else { // water
      mesh(box(.22, .08, .07), main, .06, .01, 0, g);                   // body
      mesh(cyl(.014, .1), mat('#ff8c1a'), .22, .01, 0, g);              // nozzle
      const tank = mesh(cyl(.045, .14), new THREE.MeshStandardMaterial({ color: '#7fd8ff', transparent: true, opacity: .6, roughness: .1 }), .04, .08, 0, g);
      mesh(cyl(.03, .12), new THREE.MeshBasicMaterial({ color: '#2e9bff', transparent: true, opacity: .7 }), .04, .075, 0, g); // water inside
      mesh(box(.03, .04, .075), mat('#ff8c1a'), -.05, .045, 0, g);      // pump
      grip(-.02, mat('#ff8c1a')); trigger(.03); tank.scale.y = 1;
    }
    return g;
  }
  // ---------------- pet models ----------------
  // Blocky pets about knee high, facing +X. Parts named 'wing' flap, and 'squish' parts squash, while they move.
  function buildPet(item) {
    const g = new THREE.Group(), main = skinMat(item, { metal: .1, rough: .6 }), glow = skinMat(item, { glow: true });
    const dark = mat('#1b1b22'), white = tint(), pink = mat('#ff9fb3');
    const eyes = (x, y, z, sz = .03, m = dark) => { for (const s of [-1, 1]) mesh(box(sz * .6, sz, sz), m, x, y, s * z, g); };
    const wing = (x, y, len, w, m) => { for (const s of [-1, 1]) { const wg = new THREE.Group(); wg.name = 'wing'; wg.userData.side = s; wg.position.set(x, y, s * .06); mesh(box(w, .015, len), m, 0, 0, s * len / 2, wg); g.add(wg); } };
    const legs = (m, y = .05) => { for (const [x, z] of [[.08, .05], [.08, -.05], [-.08, .05], [-.08, -.05]]) mesh(box(.045, .1, .045), m, x, y, z, g); };
    switch (item.pet) {
      case 'dog':
        mesh(box(.28, .14, .15), main, 0, .16, 0, g); legs(main); mesh(box(.15, .14, .15), main, .17, .26, 0, g);
        mesh(box(.07, .06, .08), mat('#e8c9a0'), .26, .23, 0, g); mesh(box(.03, .03, .04), dark, .3, .25, 0, g); // snout + nose
        for (const s of [-1, 1]) mesh(box(.05, .09, .03), mat('#5a3a1e'), .15, .33, s * .08, g).rotation.x = s * .3; // floppy ears
        eyes(.245, .29, .04); mesh(box(.12, .03, .03), main, -.18, .22, 0, g).rotation.z = .7; // tail up
        break;
      case 'cat':
        mesh(box(.26, .12, .13), main, 0, .15, 0, g); legs(main); mesh(box(.14, .13, .15), main, .16, .25, 0, g);
        for (const s of [-1, 1]) { const e = mesh(new THREE.ConeGeometry(.035, .07, 4), main, .15, .345, s * .05, g); e.rotation.y = Math.PI / 4; }
        eyes(.235, .27, .04, .03, mat('#7bd88f')); mesh(box(.02, .02, .03), pink, .24, .23, 0, g);
        mesh(box(.03, .18, .03), main, -.15, .25, 0, g).rotation.z = -.35; // tail
        break;
      case 'bunny':
        mesh(box(.2, .16, .16), main, 0, .12, 0, g).name = 'squish'; mesh(box(.15, .14, .14), main, .12, .24, 0, g);
        for (const s of [-1, 1]) { mesh(box(.04, .17, .05), main, .1, .39, s * .04, g); mesh(box(.02, .12, .03), pink, .115, .39, s * .04, g); }
        eyes(.2, .26, .04); mesh(box(.02, .02, .03), pink, .2, .22, 0, g); mesh(new THREE.SphereGeometry(.05, 8, 6), white, -.12, .16, 0, g); // tail puff
        break;
      case 'slime': {
        const body = mesh(box(.24, .2, .24), skinMat(item, { alpha: .75, rough: .1 }), 0, .1, 0, g); body.name = 'squish';
        mesh(box(.12, .1, .12), glow, 0, .09, 0, g); eyes(.12, .15, .05, .04);
        break;
      }
      case 'pumpkin': {
        const pk = mesh(new THREE.SphereGeometry(.15, 14, 10), main, 0, .15, 0, g); pk.scale.set(1, .82, 1); pk.name = 'squish';
        for (let k = 0; k < 6; k++) { const rib = mesh(new THREE.TorusGeometry(.15, .012, 4, 18, Math.PI), mat('#d96b00'), 0, .15, 0, g); rib.rotation.set(Math.PI / 2, 0, k * Math.PI / 6); rib.scale.set(1, 1, .82); }
        mesh(cyl(.02, .07), mat('#3d6b22'), 0, .29, 0, g).rotation.z = Math.PI / 2; // stem
        const face = new THREE.MeshBasicMaterial({ color: '#ffe066' });
        for (const s of [-1, 1]) mesh(new THREE.ConeGeometry(.03, .04, 3), face, .135, .19, s * .05, g).rotation.z = -Math.PI / 2;
        mesh(box(.02, .03, .1), face, .14, .1, 0, g); // grin
        break;
      }
      case 'bat':
        mesh(new THREE.SphereGeometry(.07, 10, 8), main, 0, .1, 0, g);
        for (const s of [-1, 1]) mesh(new THREE.ConeGeometry(.025, .06, 4), main, .02, .19, s * .035, g);
        wing(0, .11, .2, .12, mat('#2a2038')); eyes(.06, .12, .025, .025, mat('#ff4d5e'));
        break;
      case 'ghost': {
        const gm = new THREE.MeshStandardMaterial({ color: '#eef6ff', emissive: '#6d8bb0', emissiveIntensity: .4, transparent: true, opacity: .82, roughness: .4 });
        mesh(new THREE.SphereGeometry(.13, 14, 10), gm, 0, .2, 0, g).scale.set(1, 1.15, 1);
        mesh(new THREE.ConeGeometry(.13, .2, 10, 1, true), gm, 0, .05, 0, g).rotation.x = Math.PI; // wavy bottom
        eyes(.11, .24, .045, .045); mesh(box(.02, .05, .04), dark, .12, .16, 0, g); // "o" mouth
        for (const s of [-1, 1]) mesh(box(.05, .03, .1), gm, 0, .17, s * .15, g).name = 'wing';
        break;
      }
      case 'bird':
        mesh(box(.2, .12, .12), main, 0, .12, 0, g); mesh(box(.1, .1, .1), main, .13, .19, 0, g);
        mesh(new THREE.ConeGeometry(.025, .07, 4), mat('#ffd23f'), .21, .19, 0, g).rotation.z = -Math.PI / 2; // beak
        wing(0, .15, .2, .12, glow); eyes(.17, .22, .035);
        for (let k = 0; k < 3; k++) mesh(box(.16, .012, .04), glow, -.17, .12 + k * .02, (k - 1) * .035, g).rotation.z = .3; // flame tail
        mesh(box(.04, .08, .02), glow, .12, .27, 0, g); // crest
        break;
      case 'wisp': {
        mesh(new THREE.SphereGeometry(.07, 14, 10), new THREE.MeshBasicMaterial({ color: '#05020a' }), 0, .18, 0, g);
        mesh(new THREE.SphereGeometry(.11, 14, 10), new THREE.MeshBasicMaterial({ color: '#9d4dff', transparent: true, opacity: .25, depthWrite: false }), 0, .18, 0, g);
        for (const [rx, rz] of [[Math.PI / 2, 0], [Math.PI / 2.6, .9], [Math.PI / 1.7, -.9]]) { const ring = mesh(new THREE.TorusGeometry(.14, .008, 6, 28), glow, 0, .18, 0, g); ring.rotation.set(rx, 0, rz); ring.name = 'spin'; }
        eyes(.065, .2, .025, .025, mat('#e0c8ff'));
        break;
      }
      default: { // dragon
        mesh(box(.26, .13, .13), main, 0, .14, 0, g); mesh(box(.13, .11, .11), main, .18, .22, 0, g);
        mesh(box(.08, .05, .08), main, .27, .2, 0, g); // snout
        for (const s of [-1, 1]) mesh(new THREE.ConeGeometry(.018, .08, 4), mat('#f2ead0'), .15, .3, s * .04, g).rotation.z = -.4; // horns
        wing(-.02, .2, .22, .14, glow); eyes(.23, .25, .04, .03, mat('#ffe066'));
        for (let k = 0; k < 3; k++) mesh(box(.08, .06 - k * .015, .06 - k * .015), main, -.17 - k * .07, .13 - k * .01, 0, g); // tail
        legs(main, .06);
      }
    }
    return g;
  }
  const templates = new Map();
  function modelFor(item, type) {
    const k = type + item.id;
    if (!templates.has(k)) templates.set(k, type === 'knife' ? buildKnife(item) : type === 'pet' ? buildPet(item) : buildGun(item));
    return templates.get(k).clone();
  }
  function colorOf(item, T) { return item.col === 'chroma' ? new THREE.Color().setHSL(((T * 140) % 360) / 360, .95, .62) : new THREE.Color(item.col); }
  function tickChroma(T) { const c = colorOf({ col: 'chroma' }, T); for (const [m, glow] of chromaMats) { m.color.copy(c); if (glow) m.emissive.copy(c); } }
  // containers keep the old API: make*() gives a holder, style*() swaps in the right model for a skin
  function holder() { const g = new THREE.Group(); g.userData.id = null; return g; }
  function setModel(h, item, type) {
    if (h.userData.id === item.id) return;
    while (h.children.length) h.remove(h.children[0]);
    const m = modelFor(item, type); m.traverse(o => { if (o.isMesh) o.castShadow = true; });
    h.add(m); h.userData.id = item.id;
    h.userData.anim = { wings: [], squish: [], spin: [] };
    m.traverse(o => { if (o.name === 'wing') h.userData.anim.wings.push(o); else if (o.name === 'squish') h.userData.anim.squish.push(o); else if (o.name === 'spin') h.userData.anim.spin.push(o); });
  }
  const makeKnife = holder, makeGun = holder;
  const styleKnife = (h, item) => setModel(h, item, 'knife');
  const styleGun = (h, item) => setModel(h, item, 'gun');
  const people = new Map(); // ent id → rig
  // /esp colors: red murderer, green innocent, blue sheriff, gold hero. No depth test, so they show through walls
  const espMats = Object.fromEntries(Object.entries({ murderer: '#ff2a3d', innocent: '#2fe04a', sheriff: '#2f8cff', hero: '#ffc233' })
    .map(([k, c]) => [k, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: .6, depthTest: false, depthWrite: false })]));
  function setEsp(rig, role) {
    if (rig.espRole === role) return;
    rig.espRole = role;
    for (const o of rig.esp) { o.visible = !!role; if (role) o.material = espMats[role] || espMats.innocent; }
  }
  // ---------------- avatars ----------------
  // faces are drawn onto the front of the head (+X), on the avatar's skin color
  const faceCache = new Map();
  function faceMatFor(face, skinCol) {
    const k = face + skinCol;
    if (!faceCache.has(k)) {
      const t = canvasTex(64, 64, g => {
        g.fillStyle = skinCol; g.fillRect(0, 0, 64, 64);
        const ink = '#1b1b1b'; g.fillStyle = ink; g.strokeStyle = ink; g.lineCap = 'round'; g.lineJoin = 'round';
        const eyes = (ry = 7) => { for (const x of [22, 42]) { g.beginPath(); g.ellipse(x, 24, 3.6, ry, 0, 0, 7); g.fill(); } };
        const smile = (r = 15, w = 3.5) => { g.lineWidth = w; g.beginPath(); g.arc(32, 32, r, .35, Math.PI - .35); g.stroke(); };
        if (face === 'grin') {
          eyes(); g.beginPath(); g.moveTo(16, 38); g.quadraticCurveTo(32, 62, 48, 38); g.closePath(); g.fill();
          g.fillStyle = '#ffffff'; g.fillRect(19, 38, 26, 5);
        } else if (face === 'cool') {
          g.beginPath(); g.roundRect ? g.roundRect(10, 17, 44, 13, 4) : g.rect(10, 17, 44, 13); g.fill();
          g.fillStyle = '#5a6a8a'; g.fillRect(14, 19, 8, 3); g.fillRect(38, 19, 8, 3); // shine
          g.lineWidth = 3.5; g.beginPath(); g.moveTo(24, 46); g.quadraticCurveTo(36, 50, 44, 42); g.stroke(); // smirk
        } else if (face === 'angry') {
          eyes(6); g.lineWidth = 4; g.beginPath(); g.moveTo(14, 12); g.lineTo(28, 18); g.moveTo(50, 12); g.lineTo(36, 18); g.stroke();
          g.lineWidth = 3.5; g.beginPath(); g.arc(32, 56, 13, Math.PI + .5, -.5); g.stroke(); // frown
        } else if (face === 'wink') {
          g.beginPath(); g.ellipse(22, 24, 3.6, 7, 0, 0, 7); g.fill();
          g.lineWidth = 3.5; g.beginPath(); g.moveTo(36, 26); g.quadraticCurveTo(42, 18, 48, 26); g.stroke(); smile();
        } else if (face === 'surprised') {
          for (const x of [22, 42]) { g.beginPath(); g.arc(x, 24, 6, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(x + 1.5, 22, 2, 0, 7); g.fill(); g.fillStyle = ink; }
          g.lineWidth = 3.5; g.beginPath(); g.ellipse(32, 46, 6, 8, 0, 0, 7); g.stroke();
        } else { eyes(); smile(); } // classic smile
      });
      t.magFilter = THREE.LinearFilter;
      faceCache.set(k, new THREE.MeshLambertMaterial({ map: t }));
    }
    return faceCache.get(k);
  }
  const gold = () => mat('#ffcf3a', { emissive: '#5a3c00' });
  // hats sit on a head whose top is at y 1.01
  function addHat(body, hat, shirt) {
    const m = (geo, material, x, y, z) => { const o = new THREE.Mesh(geo, material); o.position.set(x, y, z); body.add(o); return o; };
    const cy = (r1, r2, h, seg = 16, open = false) => new THREE.CylinderGeometry(r1, r2, h, seg, 1, open);
    if (hat === 'cap') { m(box(.28, .08, .28), shirt, -.01, 1.03, 0); m(box(.14, .02, .26), shirt, .17, 1.0, 0); }
    else if (hat === 'hair') {
      const h = mat('#3b2416'); m(box(.29, .1, .29), h, -.01, 1.03, 0); m(box(.07, .2, .29), h, -.13, .94, 0);
      for (const z of [-.08, 0, .08]) m(box(.05, .05, .07), h, .12, .98, z).rotation.z = -.3; // fringe
    } else if (hat === 'tophat') {
      m(cy(.19, .19, .02, 24), mat('#111116'), 0, 1.02, 0); m(cy(.11, .11, .24), mat('#111116'), 0, 1.15, 0); m(cy(.113, .113, .04), mat('#c41d2f'), 0, 1.06, 0);
    } else if (hat === 'crown') {
      const g = gold(); m(cy(.14, .14, .07, 20, true), g, 0, 1.05, 0);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; m(new THREE.ConeGeometry(.035, .09, 6), g, Math.cos(a) * .13, 1.12, Math.sin(a) * .13); }
      for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + .5; m(new THREE.SphereGeometry(.018, 8, 6), new THREE.MeshBasicMaterial({ color: ['#ff3b5c', '#3bb0ff', '#5bd46a'][i] }), Math.cos(a) * .142, 1.05, Math.sin(a) * .142); }
    } else if (hat === 'beanie') {
      m(new THREE.SphereGeometry(.15, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), shirt, 0, 1.0, 0).scale.set(1, .9, 1);
      m(cy(.152, .152, .05, 18), mat('#e8e8e8'), 0, 1.01, 0); m(new THREE.SphereGeometry(.04, 10, 8), mat('#e8e8e8'), 0, 1.15, 0);
    } else if (hat === 'headphones') {
      const t = new THREE.TorusGeometry(.155, .016, 6, 20, Math.PI); t.rotateY(Math.PI / 2);
      m(t, mat('#222228'), 0, .88, 0);
      for (const z of [-.15, .15]) { m(box(.09, .11, .05), mat('#222228'), 0, .87, z); m(box(.06, .07, .02), shirt, 0, .87, z * 1.2); }
    } else if (hat === 'horns') {
      for (const z of [-.08, .08]) { const h = m(new THREE.ConeGeometry(.03, .12, 8), mat('#c41d2f', { emissive: '#3a0008' }), 0, 1.07, z); h.rotation.x = z > 0 ? .4 : -.4; }
    } else if (hat === 'halo') {
      const t = new THREE.TorusGeometry(.12, .016, 8, 28); t.rotateX(Math.PI / 2);
      m(t, new THREE.MeshBasicMaterial({ color: '#fff3a0' }), 0, 1.18, 0);
    }
  }
  function makeRig(av, target = scene) {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const color = av.shirt, shirt = mat(av.shirt), skin = mat(av.skin), pants = mat(av.pants);
    const parts = [];
    const part = (w, h, d, m, x, y, z, parent = body) => { const p = new THREE.Mesh(box(w, h, d), m); p.position.set(x, y, z); parent.add(p); parts.push(p); return p; };
    const legL = new THREE.Group(), legR = new THREE.Group(); legL.position.set(0, .36, -.08); legR.position.set(0, .36, .08); body.add(legL, legR);
    part(.14, .36, .13, pants, 0, -.18, 0, legL); part(.14, .36, .13, pants, 0, -.18, 0, legR);
    part(.2, .38, .34, shirt, 0, .55, 0);
    const armL = new THREE.Group(), armR = new THREE.Group(); armL.position.set(0, .72, -.23); armR.position.set(0, .72, .23); body.add(armL, armR);
    part(.12, .34, .12, skin, 0, -.16, 0, armL); part(.12, .34, .12, skin, 0, -.16, 0, armR);
    part(.26, .26, .26, [faceMatFor(av.face, av.skin), skin, skin, skin, skin, skin], 0, .88, 0); // face on the front (+X)
    addHat(body, av.hat, shirt);
    // knife sits in a grip at the hand; rolled so the blade's flat side faces sideways when it's held up
    const knifeGrip = new THREE.Group(); knifeGrip.position.set(0, -.34, 0); armR.add(knifeGrip);
    const knife = makeKnife(); knife.rotation.x = Math.PI / 2; knife.position.x = .06; knife.scale.setScalar(1.4); knife.visible = false; knifeGrip.add(knife);
    const gun = makeGun(); gun.position.set(0, -.36, 0); gun.scale.setScalar(1.6); gun.visible = false; armR.add(gun);
    const ring = new THREE.Mesh(new THREE.RingGeometry(.36, .42, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .7, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .02; ring.visible = false; root.add(ring);
    root.scale.setScalar(1.1);
    root.traverse(o => { if (o.isMesh && o !== ring) o.castShadow = true; });
    // /esp: a see-through colored shell over every body part, drawn on top of walls (hidden until ESP is on)
    const esp = parts.map(p => { const o = new THREE.Mesh(p.geometry, espMats.innocent); o.scale.setScalar(1.1); o.renderOrder = 10; o.visible = false; p.add(o); return o; });
    target.add(root);
    const pet = holder(); pet.scale.setScalar(1.25); pet.visible = false; target.add(pet); // follows its owner, positioned separately
    return { root, body, legL, legR, armL, armR, knife, knifeGrip, gun, ring, color, key: JSON.stringify(av), deadAt: 0, trail: [], pet, esp, espRole: null };
  }
  function rigFor(id, av) {
    let r = people.get(id);
    const key = JSON.stringify(av);
    if (!r || r.key !== key) { if (r) scene.remove(r.root, r.pet); r = makeRig(av); people.set(id, r); }
    return r;
  }
  // Avatar tab: a spinning preview in its own little renderer (drag to turn it)
  let pv = null;
  api.previewStart = (canvas, getAvatar) => {
    try {
      if (!pv || pv.canvas !== canvas) {
        const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        r.setPixelRatio(Math.min(2, devicePixelRatio || 1));
        const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(28, 1, .1, 50);
        sc.add(new THREE.HemisphereLight(0xffffff, 0x4a4060, .9));
        const key = new THREE.DirectionalLight(0xffffff, .7); key.position.set(4, 5, 3); sc.add(key);
        const floor = new THREE.Mesh(new THREE.CircleGeometry(.75, 40), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: .25 }));
        floor.rotation.x = -Math.PI / 2; sc.add(floor);
        pv = { canvas, r, sc, cam, rig: null, key: '', yaw: .25, spin: true, raf: 0, w: 0, h: 0 };
        let drag = null;
        canvas.addEventListener('pointerdown', e => { drag = e.clientX; pv.spin = false; canvas.setPointerCapture(e.pointerId); });
        canvas.addEventListener('pointermove', e => { if (drag !== null) { pv.yaw += (e.clientX - drag) * .012; drag = e.clientX; } });
        canvas.addEventListener('pointerup', () => { drag = null; });
      }
      cancelAnimationFrame(pv.raf);
      const t0 = performance.now();
      const loop = () => {
        if (!canvas.isConnected || canvas.offsetParent === null) { pv.raf = 0; return; } // tab closed: stop drawing
        pv.raf = requestAnimationFrame(loop);
        const w = canvas.clientWidth, h = canvas.clientHeight;
        if (w !== pv.w || h !== pv.h) { pv.w = w; pv.h = h; pv.r.setSize(w, h, false); pv.cam.aspect = w / h; pv.cam.updateProjectionMatrix(); }
        const av = getAvatar(), key = JSON.stringify(av);
        if (key !== pv.key) { if (pv.rig) pv.sc.remove(pv.rig.root, pv.rig.pet); pv.rig = makeRig(av, pv.sc); pv.key = key; }
        const T = (performance.now() - t0) / 1000;
        if (pv.spin) pv.yaw = .25 + Math.sin(T * .6) * .9; // sway side to side so the face stays mostly in view
        const rig = pv.rig; rig.root.rotation.y = pv.yaw; rig.root.position.y = 0;
        rig.armL.rotation.z = Math.sin(T * 2) * .12; rig.armR.rotation.z = -Math.sin(T * 2) * .12; rig.body.position.y = Math.sin(T * 2) * .01; // idle sway
        pv.cam.position.set(4.6, 1.25, 0); pv.cam.lookAt(0, .7, 0);
        pv.r.render(pv.sc, pv.cam);
      };
      loop();
      return true;
    } catch (e) { return false; }
  };
  function poseRig(r, d, w, item, T, isMe, dead) {
    r.root.visible = true;
    r.root.position.set(d.x * S, dead ? 0 : (d.z || 0), d.y * S);
    r.root.rotation.set(0, -d.a, 0);
    r.ring.visible = isMe && !dead;
    if (dead !== false) { // falls over, bounces a little, then lies on the floor
      const p = dead, e = p < 1 ? 1 - Math.pow(1 - p, 3) * Math.cos(p * 5) : 1;
      r.body.scale.set(1, 1, 1);
      r.body.rotation.set(Math.PI / 2 * Math.min(1.08, e), 0, 0); r.body.position.set(0, .14 * Math.min(1, p * 1.5), 0);
      r.legL.rotation.z = r.legR.rotation.z = r.armL.rotation.z = r.armR.rotation.z = 0;
      r.knife.visible = r.gun.visible = false; return;
    }
    r.body.rotation.set(0, 0, 0); r.body.position.set(0, Math.abs(Math.sin(d.walk)) * .04, 0);
    r.body.scale.set(1, d.cr ? .72 : 1, 1); // crouching
    const swing = Math.sin(d.walk) * .6;
    r.legL.rotation.z = swing; r.legR.rotation.z = -swing; r.armL.rotation.z = -swing * .8;
    r.knife.visible = w === 'k'; r.gun.visible = w === 'g';
    if (w === 'k') {
      // knife held up in front of the chest, blade pointing at the sky; a stab swings it forward and down
      const stab = d.sw > 0 ? Math.sin((1 - d.sw / .15) * Math.PI) : 0;
      r.armR.rotation.set(0, 0, .6 + stab * .9);
      r.knifeGrip.rotation.set(0, 0, Math.PI / 2 - .45 - .6 - stab * 1.9); // up, leaning a little forward so the camera can see it
      styleKnife(r.knife, item, T);
    } else if (w === 'g') {
      r.armR.rotation.set(0, 0, Math.PI / 2 - .15); // gun aimed straight ahead
      r.gun.rotation.set(0, 0, -Math.PI / 2);
      styleGun(r.gun, item, T);
    } else r.armR.rotation.set(0, 0, swing * .8);
  }

  const dropGun = makeGun(); dropGun.scale.setScalar(1.8); scene.add(dropGun); dropGun.visible = false;
  const dropRing = new THREE.Mesh(new THREE.TorusGeometry(.35, .04, 8, 32), new THREE.MeshBasicMaterial({ color: '#4da3ff' }));
  dropRing.rotation.x = Math.PI / 2; scene.add(dropRing); dropRing.visible = false;

  // ---------------- camera ----------------
  let W = 1, H = 1, camH = 0, lastT = 0;
  api.resize = (w, h) => { W = w; H = h; renderer.setSize(w, h, false); renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px'; camera.aspect = w / h; camera.updateProjectionMatrix(); };
  // Roblox-style orbit camera: hold right mouse to turn it, scroll to zoom. yaw 0 = looking north (like the old view)
  const cam = (() => { try { const c = JSON.parse(localStorage.getItem('mm_cam')); if (c && isFinite(c.yaw) && isFinite(c.pitch) && isFinite(c.dist)) return c; } catch (e) { } return { yaw: 0, pitch: .82, dist: 11 }; })();
  let saveCamT = 0;
  const saveCam = () => { clearTimeout(saveCamT); saveCamT = setTimeout(() => { try { localStorage.setItem('mm_cam', JSON.stringify(cam)); } catch (e) { } }, 400); };
  api.cam = cam;
  api.rotateCam = (dx, dy) => { cam.yaw = (cam.yaw - dx * .006) % (Math.PI * 2); cam.pitch = Math.max(.22, Math.min(1.45, cam.pitch + dy * .005)); saveCam(); };
  api.zoomCam = d => { cam.dist = Math.max(3.5, Math.min(22, cam.dist * Math.exp(d * .0012))); saveCam(); };
  // Shift Lock: the camera sits over your right shoulder (eased in and out)
  let shoulder = 0, shoulderWant = 0;
  api.setShoulder = on => { shoulderWant = on ? 1 : 0; };
  api.resetCam = () => { cam.yaw = 0; cam.pitch = .82; cam.dist = 11; saveCam(); };
  let camDist = 11; // the distance actually used this frame (pulled in when a wall is in the way)
  // walk from the player toward the camera and stop in front of the first wall or bookshelf (so walls never block the view)
  function wallClamp(M, x, y, z, dx, dy, dz, max) {
    for (let t = .6; t < max; t += .15) {
      const px = x + dx * t, py = y + dy * t, pz = z + dz * t, row = M.grid[Math.floor(pz)];
      const c = row && row[Math.floor(px)];
      if (c === undefined) break; // past the edge of the map: open sky
      if ((c === '#' && py < 1.42) || (c === 'B' && py < 1.25)) return Math.max(1.4, t - .35);
    }
    return max;
  }
  function placeCamera(M, cx, cy, h = 0, zoom = 1, sx = 0, sy = 0, dt = .016) {
    // phones sit a bit farther back; zoom < 1 moves in (final kill cam)
    const k = Math.max(1, Math.min(1.7, 760 / Math.min(W, H))) * (W < H ? 1.25 : 1) * zoom;
    shoulder += (shoulderWant - shoulder) * Math.min(1, dt * 8);
    const sh = shoulder * .55; // over the right shoulder: shift the target along the camera's right
    const tx = cx * S + Math.cos(cam.yaw) * sh, tz = cy * S - Math.sin(cam.yaw) * sh, ty = h + .7 + shoulder * .15, ox = sx * S, oz = sy * S; // sx/sy: screen shake, in game px
    const cp = Math.cos(cam.pitch), dx = Math.sin(cam.yaw) * cp, dy = Math.sin(cam.pitch), dz = Math.cos(cam.yaw) * cp;
    const want = wallClamp(M, tx, ty, tz, dx, dy, dz, cam.dist * k);
    camDist = want < camDist ? want : camDist + (want - camDist) * Math.min(1, dt * 4); // snap in, ease back out
    camera.position.set(tx + dx * camDist + ox, ty + dy * camDist, tz + dz * camDist + oz);
    camera.lookAt(tx + ox * .6, ty, tz + oz * .6); // h: follow the player up during a jump
    camera.updateMatrixWorld();
    // the sun's shadow box follows the camera (a directional light only cares about direction)
    sun.position.set(tx + 5, 12, tz + 7); sun.target.position.set(tx, 0, tz); sun.target.updateMatrixWorld();
  }
  const ray = new THREE.Raycaster(), aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -.55), hit = new THREE.Vector3(), tmp = new THREE.Vector3(), wp = new THREE.Vector3();
  api.screenToWorld = (x, y) => {
    ray.setFromCamera({ x: x / W * 2 - 1, y: -(y / H) * 2 + 1 }, camera);
    return ray.ray.intersectPlane(aimPlane, hit) ? { x: hit.x / S, y: hit.z / S } : null;
  };
  api.worldToScreen = (x, y, h = 0) => {
    tmp.set(x * S, h, y * S).project(camera);
    return { x: (tmp.x + 1) / 2 * W, y: (1 - tmp.y) / 2 * H, behind: tmp.z > 1 };
  };
  api.show = on => { renderer.domElement.style.display = on ? 'block' : 'none'; };
  // 'ultra': real shadows, lights, floating dust, glows. 'high': the same scene without the costly parts (phones)
  let qualitySet = false;
  api.setQuality = q => {
    q = q === 'ultra' ? 'ultra' : 'high';
    if (qualitySet && q === quality) return;
    qualitySet = true; quality = q;
    const hi = ultra();
    renderer.shadowMap.enabled = hi; sun.castShadow = hi; dust.visible = hi;
    fxLights.forEach(l => { l.visible = hi; l.intensity = 0; });
    renderer.setPixelRatio(Math.min(hi ? 2 : 1.5, devicePixelRatio || 1));
    const touch = m => { m.needsUpdate = true; };
    scene.traverse(o => { if (o.material) [].concat(o.material).forEach(touch); });
    matCache.forEach(touch);
    if (W > 1) api.resize(W, H);
  };
  function stepDust(tx, tz, T, dt) {
    const f = dt * 60;
    for (let i = 0; i < DUST; i++) {
      const j = i * 3, sd = dustSeed[i];
      let x = dustPos[j] + Math.sin(T * .3 + sd) * .004 * f, y = dustPos[j + 1] + (.002 + Math.sin(T + sd) * .0015) * f, z = dustPos[j + 2] + Math.cos(T * .25 + sd) * .004 * f;
      x = tx + (((x - tx + 14) % 28) + 28) % 28 - 14; z = tz + (((z - tz + 14) % 28) + 28) % 28 - 14; if (y > 3.2) y = 0;
      dustPos[j] = x; dustPos[j + 1] = y; dustPos[j + 2] = z;
    }
    dustGeo.attributes.position.needsUpdate = true;
  }
  const RARE = { Godly: 1, Ancient: 1, Chroma: 1 };
  // rain: short falling streaks around the camera (haunted map, Ultra only)
  const DROPS = 420, rainPos = new Float32Array(DROPS * 6);
  for (let i = 0; i < DROPS; i++) { const x = Math.random() * 26 - 13, y = Math.random() * 7, z = Math.random() * 26 - 13; rainPos.set([x, y, z, x - .03, y + .35, z - .02], i * 6); }
  const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: '#9fb0d9', transparent: true, opacity: .35, depthWrite: false }));
  rain.frustumCulled = false; rain.visible = false; scene.add(rain);
  function stepRain(tx, tz, dt) {
    for (let i = 0; i < DROPS; i++) {
      const j = i * 6; let x = rainPos[j], y = rainPos[j + 1] - dt * 14, z = rainPos[j + 2];
      if (y < 0) { y += 7; x = tx + Math.random() * 26 - 13; z = tz + Math.random() * 26 - 13; }
      x = tx + (((x - tx + 13) % 26) + 26) % 26 - 13; z = tz + (((z - tz + 13) % 26) + 26) % 26 - 13;
      rainPos[j] = x; rainPos[j + 1] = y; rainPos[j + 2] = z; rainPos[j + 3] = x - .03; rainPos[j + 4] = y + .35; rainPos[j + 5] = z - .02;
    }
    rainGeo.attributes.position.needsUpdate = true;
  }

  // snow: soft flakes drifting down around the camera (Ice Castle)
  const FLAKES = 500, snowPos = new Float32Array(FLAKES * 3), snowSeed = new Float32Array(FLAKES);
  for (let i = 0; i < FLAKES; i++) { snowPos.set([Math.random() * 26 - 13, Math.random() * 7, Math.random() * 26 - 13], i * 3); snowSeed[i] = Math.random() * 100; }
  const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: '#ffffff', size: .09, map: glowTex, transparent: true, depthWrite: false, opacity: .9 }));
  snow.frustumCulled = false; snow.visible = false; scene.add(snow);
  function stepSnow(tx, tz, T, dt) {
    for (let i = 0; i < FLAKES; i++) {
      const j = i * 3, sd = snowSeed[i]; let x = snowPos[j] + Math.sin(T * .8 + sd) * dt * .4, y = snowPos[j + 1] - dt * (.6 + (sd % 1) * .5), z = snowPos[j + 2] + Math.cos(T * .6 + sd) * dt * .4;
      if (y < 0) y += 7;
      x = tx + (((x - tx + 13) % 26) + 26) % 26 - 13; z = tz + (((z - tz + 13) % 26) + 26) % 26 - 13;
      snowPos[j] = x; snowPos[j + 1] = y; snowPos[j + 2] = z;
    }
    snowGeo.attributes.position.needsUpdate = true;
  }

  // ---------------- per frame ----------------
  // V: the client's view of the round. ITEM: item table. myW: our own weapon state.
  api.draw = (V, ITEM, T, myW) => {
    const M = V.M, s = V.snap, hi = ultra();
    const dt = Math.min(.05, lastT ? Math.max(0, T - lastT) : .016); lastT = T;
    // the page can change size without us hearing about it (app frames, rotation): always match the window
    if (innerWidth !== W || innerHeight !== H || renderer.domElement.width === 0) api.resize(innerWidth, innerHeight);
    if (M.idx !== mapIdx) { buildMap(M); for (const r of people.values()) scene.remove(r.root, r.pet); people.clear(); }
    const fz = V.me && V.me.alive && V.disp.get(V.you) ? V.disp.get(V.you).z || 0 : 0;
    camH += (fz * .85 - camH) * .25; placeCamera(M, V.cam.x, V.cam.y, camH, V.zoom || 1, V.shakeX || 0, V.shakeY || 0, dt);
    tickChroma(T);
    pools.forEach(p => p.reset());
    let li = 0;
    const light = (x, y, z, color, intensity, dist = 6) => { if (!hi || li >= fxLights.length) return; const l = fxLights[li++]; l.position.set(x, y, z); l.color.set(color); l.intensity = intensity; l.distance = dist; };
    if (hi) stepDust(V.cam.x * S, V.cam.y * S, T, dt);
    // blood on the floor
    (V.decals || []).forEach((dc, i) => { const m = decals.get(); m.position.set(dc.x * S, .004 + (i % 10) * .0005, dc.y * S); m.scale.set(dc.r, 1, dc.r * .75); m.rotation.y = dc.a; });
    // coins
    for (const [x, y] of s.c) {
      const m = coins.get(); const b = (x * 7 + y * 13) % 6, cy = .28 + Math.sin(T * 4 + b) * .04; m.position.set(x * S, cy, y * S); m.rotation.y = T * 3 + b;
      if (hi) glow(x * S, cy, y * S, .75, '#ffcc33', .3 + Math.sin(T * 5 + b) * .1);
    }
    // people (alive and dead)
    const seen = new Set(), bodies = new Map(s.b.map(b => [b.id, b])), espRoles = s.esp ? new Map(s.esp) : null;
    for (const [id, d] of V.disp) {
      const r = V.roster.get(id); if (!r) continue;
      const body = !d.alive && bodies.get(id);
      if (!d.alive && !body) continue;
      const rig = rigFor(id, r.avatar || { skin: '#f7d154', shirt: r.color, pants: '#34304a', hat: 'cap', face: 'smile' }); seen.add(id);
      const isMe = id === V.you, w = isMe && myW !== undefined ? myW : d.w;
      const item = w === 'k' ? (ITEM[r.knife] || ITEM.k0) : (ITEM[r.gun] || ITEM.g0);
      if (body) {
        if (!rig.deadAt) rig.deadAt = T;
        const g = T - rig.deadAt;
        poseRig(rig, { x: body.x, y: body.y, a: body.a, walk: 0, sw: 0 }, 0, item, T, isMe, Math.min(1, g / .55));
        if (g < 1.8) { // their soul drifts up and fades out
          const k = g / 1.8, f = ghosts.get();
          f.position.set(body.x * S + Math.sin(g * 6) * .08, .15 + k * 2.4, body.y * S); f.rotation.set(0, -body.a, 0);
          f.userData.m.color.set('#dff3ff'); f.userData.m.opacity = .5 * (1 - k);
          if (hi && g < .5) glow(body.x * S, .5 + k * 2.4, body.y * S, 1.4, '#9fd8ff', .5 * (1 - g * 2));
        }
        rig.trail.length = 0; rig.pet.visible = false; setEsp(rig, null);
        continue;
      }
      rig.deadAt = 0;
      poseRig(rig, d, w, item, T, isMe, false);
      setEsp(rig, espRoles && !isMe ? espRoles.get(id) || null : null);
      if (isMe && camDist < 2.6) rig.root.visible = false; // camera squeezed right behind you (wall at your back): hide yourself like Roblox does
      // pet
      const petItem = r.pet && ITEM[r.pet];
      rig.pet.visible = !!petItem && d.petX !== undefined;
      if (rig.pet.visible) {
        setModel(rig.pet, petItem, 'pet');
        const moving = d.petMv > 20, an = rig.pet.userData.anim, ph = T + id * .7;
        const py = petItem.fly ? .7 + Math.sin(ph * 3) * .08 + (d.z || 0) * .5 : moving ? Math.abs(Math.sin(ph * 9)) * .07 : 0;
        rig.pet.position.set(d.petX * S, py, d.petY * S); rig.pet.rotation.set(0, -(d.petA === undefined ? d.a : d.petA), 0);
        for (const wg of an.wings) wg.rotation.x = (wg.userData.side || (wg.position.z > 0 ? 1 : -1)) * Math.sin(ph * (petItem.fly ? 14 : 6)) * .55;
        for (const o of an.squish) { if (o.userData.sy === undefined) o.userData.sy = o.scale.y; o.scale.y = o.userData.sy * (1 - (moving ? Math.abs(Math.sin(ph * 9)) * .16 : (Math.sin(ph * 2) + 1) * .03)); }
        for (const o of an.spin) o.rotation.z += dt * 2.2;
        const psh = shadows.get(); psh.position.set(d.petX * S, .012, d.petY * S); psh.scale.setScalar(petItem.fly ? .45 : .65);
        if (hi && (RARE[petItem.r] || petItem.pet === 'wisp' || petItem.pet === 'ghost')) glow(d.petX * S, py + .25, d.petY * S, .9, colorOf(petItem, T), .35 + Math.sin(ph * 4) * .1);
      }
      const sh = shadows.get(); sh.position.set(d.x * S, .01, d.y * S); sh.scale.setScalar(1 / (1 + (d.z || 0) * .35));
      // after-images while juking
      if (d.dashT > 0) rig.trail.push({ x: d.x, y: d.y, z: d.z || 0, a: d.a, t: T });
      while (rig.trail.length && (T - rig.trail[0].t > .26 || rig.trail.length > 16)) rig.trail.shift();
      for (const e of rig.trail) {
        const k = (T - e.t) / .26, f = echoes.get();
        f.position.set(e.x * S, e.z, e.y * S); f.rotation.set(0, -e.a, 0); f.userData.m.color.set(r.color); f.userData.m.opacity = .4 * (1 - k);
      }
      // knife slash
      const swinging = w === 'k' && d.sw > 0;
      if (swinging && !rig.swung) rig.slashAt = T;
      rig.swung = swinging;
      if (w === 'k' && rig.slashAt && T - rig.slashAt < .22) {
        const k = (T - rig.slashAt) / .22, m = slashes.get();
        m.position.set(d.x * S + Math.cos(d.a) * .18, .62 + (d.z || 0), d.y * S + Math.sin(d.a) * .18); m.rotation.set(0, -d.a + (k - .5) * .6, 0);
        m.scale.setScalar(1 + k * .35); m.material.color.copy(colorOf(item, T)); m.material.opacity = .85 * (1 - k);
      }
      // rare weapons glow in your hand
      if (hi && w && (RARE[item.r] || item.sound)) {
        (w === 'k' ? rig.knife : rig.gun).getWorldPosition(wp);
        glow(wp.x, wp.y, wp.z, .95, colorOf(item, T), .5 + Math.sin(T * 6) * .12);
      }
    }
    for (const [id, r] of people) if (!seen.has(id)) r.root.visible = r.pet.visible = false;
    // the map's lights: lamps and candles glow, rain or snow falls, lightning lights everything up
    const th = theme, flash = V.flash || 0, lo = !hi && th.lo;
    hemi.intensity = (lo ? th.lo[0] : th.hemi[2]) + flash * 1.5; sun.intensity = (lo ? th.lo[1] : th.sun[1]) + flash * .8; // phones get no glows, so night maps are a bit brighter there
    if (hi) for (const [gx, gy, gz, size, color, flick] of mapGlows) {
      const f = flick ? Math.sin(T * 13 + gx * 3) * .06 + Math.sin(T * 7.3 + gz) * .05 : Math.sin(T * 1.5 + gx + gz) * .03;
      glow(gx, gy, gz, size * (1 + f), color, flick ? .55 : .45);
    }
    rain.visible = hi && th.weather === 'rain';
    snow.visible = th.weather === 'snow';
    if (snow.visible) stepSnow(V.cam.x * S, V.cam.y * S, T, dt);
    if (rain.visible) stepRain(V.cam.x * S, V.cam.y * S, dt);
    // dropped gun
    dropGun.visible = dropRing.visible = !!s.g;
    if (s.g) {
      dropGun.position.set(s.g.x * S, .35 + Math.sin(T * 3) * .06, s.g.y * S); dropGun.rotation.y = T * 1.5; styleGun(dropGun, ITEM.g0, T);
      dropRing.position.set(s.g.x * S, .05, s.g.y * S); dropRing.scale.setScalar(1 + Math.sin(T * 5) * .12);
      glow(s.g.x * S, .4, s.g.y * S, 1.6 + Math.sin(T * 5) * .2, '#4da3ff', .55);
      light(s.g.x * S, .8, s.g.y * S, '#4da3ff', 1.3 + Math.sin(T * 5) * .3, 4);
    }
    // projectiles (extrapolated from the last snapshot)
    const age = Math.min(.1, (performance.now() - V.snapT) / 1000);
    for (const [k, x, y, vx, vy, skin] of s.p) {
      const px = (x + vx * age) * S, pz = (y + vy * age) * S;
      if (k === 'k') { const m = knifeMeshes.get(); styleKnife(m, ITEM[skin] || ITEM.k0, T); m.position.set(px, .6, pz); m.rotation.set(0, T * 25, 0); continue; }
      const it = ITEM[skin], rayGun = it && (it.sound === 'ray' || it.sound === 'void'), col = rayGun ? colorOf(it, T) : new THREE.Color('#ffe98a');
      const m = bullets.get(); m.material.color.copy(rayGun ? col : new THREE.Color('#fff6a0')); m.scale.set(rayGun ? 1.4 : 1, rayGun ? 2 : 1, rayGun ? 2 : 1);
      const a = Math.atan2(vy, vx); m.position.set(px, .6, pz); m.rotation.set(0, -a, 0);
      const len = rayGun ? 1.7 : 1.3, t = tracers.get();
      t.position.set(px - Math.cos(a) * len / 2, .6, pz - Math.sin(a) * len / 2); t.rotation.set(0, -a, 0); t.scale.set(len, 1, rayGun ? .16 : .08);
      t.material.color.copy(col); t.material.opacity = .9;
      glow(px, .6, pz, rayGun ? 1 : .6, col, .9);
      light(px, .7, pz, col, 1.2, 4);
    }
    // effects
    for (const f of V.fx) {
      if (f.type === 'blood') { const m = blood.get(); m.position.set(f.x * S, .1 + f.t * .8, f.y * S); }
      else if (f.type === 'boom') {
        const m = booms.get(), k = 1 - f.t / .45; m.position.set(f.x * S, .2, f.y * S); m.scale.setScalar(.4 + k * 2.2); m.material.opacity = .75 * (1 - k);
        const wv = waves.get(); wv.position.set(f.x * S, .04, f.y * S); wv.scale.setScalar(.4 + k * 2.8); wv.material.color.set('#ff9a3c'); wv.material.opacity = .9 * (1 - k);
        glow(f.x * S, .4, f.y * S, 2.6 * (1 - k * .4), '#ff7a1a', .45 * (1 - k));
        light(f.x * S, 1.2, f.y * S, '#ff8c1a', 2.5 * (1 - k), 6);
      }
      else if (f.type === 'dash') { const k = 1 - f.t / .35; for (let i = 0; i < 5; i++) { const m = puffs.get(); m.position.set((f.x + Math.cos(i * 1.3) * k * 26) * S, .2 + k * .2, (f.y + Math.sin(i * 1.3) * k * 26) * S); m.scale.setScalar(1 - k * .6); m.material.color.set('#e6ecff'); m.material.opacity = .6 * (1 - k); } }
      else if (f.type === 'step') { const k = 1 - f.t / .4, m = puffs.get(); m.position.set(f.x * S, .06 + k * .12, f.y * S); m.scale.setScalar(.45 + k * .5); m.material.color.set('#cfc6b8'); m.material.opacity = .3 * (1 - k); }
      else if (f.type === 'land') { const k = 1 - f.t / .35, wv = waves.get(); wv.position.set(f.x * S, .03, f.y * S); wv.scale.setScalar(.25 + k * .75); wv.material.color.set('#ffffff'); wv.material.opacity = .5 * (1 - k); }
      else if (f.type === 'ember') glow(f.x * S, Math.max(.05, f.z || 0), f.y * S, .3, f.c || '#ffb347', Math.min(1, f.t * 2));
      else if (f.type === 'flash') { const m = flashes.get(); m.position.set(f.x * S, .6, f.y * S); glow(f.x * S, .6, f.y * S, 1.4, '#fff1a0', 1); light(f.x * S, .9, f.y * S, '#ffd27a', 4, 6); }
      else if (f.type === 'stuck') { const m = knifeMeshes.get(); styleKnife(m, ITEM[f.skin] || ITEM.k0, T); m.position.set(f.x * S, .6, f.y * S); m.rotation.set(0, -f.ang, 0); }
    }
    for (let i = li; i < fxLights.length; i++) fxLights[i].intensity = 0;
    pools.forEach(p => p.hideRest());
    renderer.render(scene, camera);
  };
  // ---------------- item pictures for the menus ----------------
  // Renders a skin's 3D model once into a small transparent image (cached), like Roblox inventory icons.
  let thumbR = null, thumbScene, thumbCam;
  const thumbCache = new Map();
  api.thumbCached = id => thumbCache.get(id);
  api.thumb = item => {
    if (thumbCache.has(item.id)) return thumbCache.get(item.id);
    let url = null;
    try {
      if (!thumbR) {
        thumbR = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
        thumbR.setPixelRatio(1); thumbR.setSize(192, 192, false); thumbR.setClearColor(0x000000, 0);
        thumbScene = new THREE.Scene();
        thumbScene.add(new THREE.HemisphereLight(0xffffff, 0x3a3550, 1.05));
        const key = new THREE.DirectionalLight(0xffffff, .9); key.position.set(-2, 3, 4); thumbScene.add(key);
        const rim = new THREE.DirectionalLight(0x9fd8ff, .5); rim.position.set(3, -1, -2); thumbScene.add(rim);
        thumbCam = new THREE.PerspectiveCamera(28, 1, .01, 50);
      }
      tickChroma(1.1); // chroma skins get a fixed pink for the picture (the menu animates the hue)
      const g = new THREE.Group(), m = modelFor(item, item.type);
      if (item.type === 'knife') { m.rotation.x = Math.PI / 2; g.rotation.set(0, -.25, Math.PI / 4); } // blade face to camera, tip up-right
      else if (item.type === 'pet') { g.rotation.set(.2, -.75, 0); }                                  // pet: 3/4 view, facing the camera
      else { g.rotation.set(0, -.45, .12); }                                                              // gun side-on, slight turn
      g.add(m); thumbScene.add(g); g.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(g), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      g.position.sub(c);
      const r = Math.max(size.x, size.y) * .6 + size.z * .2;
      thumbCam.position.set(0, 0, r / Math.tan(THREE.MathUtils.degToRad(14)) + size.z);
      thumbCam.lookAt(0, 0, 0);
      thumbR.render(thumbScene, thumbCam);
      url = thumbR.domElement.toDataURL('image/png');
      thumbScene.remove(g);
    } catch (e) { url = null; }
    thumbCache.set(item.id, url);
    return url;
  };
  return api;
})();
