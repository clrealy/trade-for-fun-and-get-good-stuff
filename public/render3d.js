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
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0d0b12');
  const camera = new THREE.PerspectiveCamera(45, 1, .1, 200);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x4a4060, .85));
  const sun = new THREE.DirectionalLight(0xffffff, .55); sun.position.set(4, 10, 6); scene.add(sun);

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
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'));
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipMapLinearFilter; return t;
  }
  const bookTex = canvasTex(32, 32, g => {
    g.fillStyle = '#3b2616'; g.fillRect(0, 0, 32, 32);
    const bc = ['#c92a2a', '#1971c2', '#e67700', '#2b8a3e', '#862e9c'];
    for (let r = 0; r < 2; r++) for (let k = 0; k < 6; k++) { g.fillStyle = bc[(k * 2 + r) % 5]; g.fillRect(2 + k * 5, 3 + r * 15, 4, 12); }
  });
  function instanced(geo, material, cells, place) {
    const m = new THREE.InstancedMesh(geo, material, Math.max(1, cells.length));
    const o = new THREE.Object3D();
    cells.forEach(([x, y], i) => { place(o, x, y); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
    m.count = cells.length; return m;
  }
  function buildMap(M) {
    if (mapGroup) { scene.remove(mapGroup); mapGroup.traverse(o => { if (o.geometry && o.geometry !== G.unit) o.geometry.dispose(); }); }
    mapGroup = new THREE.Group(); mapIdx = M.idx;
    // floor: one plane with a checker texture
    const floorTex = canvasTex(M.W * 8, M.H * 8, g => { for (let y = 0; y < M.H; y++) for (let x = 0; x < M.W; x++) { g.fillStyle = M.floor[(x + y) & 1]; g.fillRect(x * 8, y * 8, 8, 8); } });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(M.W, M.H), new THREE.MeshLambertMaterial({ map: floorTex }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(M.W / 2, 0, M.H / 2); mapGroup.add(floor);
    const cells = { '#': [], T: [], P: [], B: [] };
    for (let y = 0; y < M.H; y++) for (let x = 0; x < M.W; x++) { const c = M.grid[y][x]; if (cells[c]) cells[c].push([x, y]); }
    const WH = 1.35;
    mapGroup.add(instanced(G.unit, mat(M.wall), cells['#'], (o, x, y) => { o.position.set(x + .5, WH / 2, y + .5); o.scale.set(1, WH, 1); }));
    mapGroup.add(instanced(G.unit, mat(M.wallTop), cells['#'], (o, x, y) => { o.position.set(x + .5, WH + .03, y + .5); o.scale.set(1, .06, 1); }));
    mapGroup.add(instanced(G.unit, mat('#a06b40'), cells.T, (o, x, y) => { o.position.set(x + .5, .42, y + .5); o.scale.set(.98, .08, .98); }));
    mapGroup.add(instanced(G.unit, mat('#6e4526'), cells.T, (o, x, y) => { o.position.set(x + .5, .19, y + .5); o.scale.set(.8, .38, .8); }));
    mapGroup.add(instanced(G.unit, new THREE.MeshLambertMaterial({ map: bookTex }), cells.B, (o, x, y) => { o.position.set(x + .5, .6, y + .5); o.scale.set(.96, 1.2, .96); }));
    mapGroup.add(instanced(new THREE.CylinderGeometry(.16, .12, .3, 10), mat('#8b4a2b'), cells.P, (o, x, y) => { o.position.set(x + .5, .15, y + .5); }));
    mapGroup.add(instanced(new THREE.IcosahedronGeometry(.3, 1), mat('#2f9e44'), cells.P, (o, x, y) => { o.position.set(x + .5, .55, y + .5); }));
    scene.add(mapGroup);
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
  const flashes = pool(() => new THREE.Mesh(new THREE.SphereGeometry(.14, 8, 8), new THREE.MeshBasicMaterial({ color: '#fff3a0' })));
  const knifeMeshes = pool(() => makeKnife());
  const pools = [coins, shadows, blood, bullets, flashes, knifeMeshes];

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
    if (/scythe|harvester|batwing/.test(n)) return 'scythe';
    if (/ray blade|galaxy|nebula|neon|sussy|chroma fang|icewing/.test(n)) return 'energy';
    if (/butter|kitchen|rusty|sunburn/.test(n)) return 'cleaver';
    if (/frost|toxic|thunder|blood|death|heat|inferno/.test(n)) return 'serrated';
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
    if (item.long) return 'sniper';
    if (/water|splash/.test(n)) return 'water';
    if (/revolver|golden six|luger|death gun/.test(n)) return 'revolver';
    if (/blaster|laser|raygun|lightbringer|swirly|cap gun/.test(n)) return 'blaster';
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
    } else if (style === 'blaster') {
      mesh(new THREE.SphereGeometry(.07, 12, 10), main, .02, .02, 0, g).scale.set(1.6, 1, 1); // rounded body
      mesh(cyl(.028, .2), darkMetal, .17, .02, 0, g);                   // emitter
      for (const x of [.1, .15, .2]) { const r = new THREE.TorusGeometry(.036, .008, 6, 14); r.rotateY(Math.PI / 2); mesh(r, glow, x, .02, 0, g); } // glowing coils
      mesh(new THREE.SphereGeometry(.03, 10, 8), glow, .28, .02, 0, g); // muzzle orb
      for (const z of [-.06, .06]) { const f = mesh(box(.08, .01, .05), main, -.03, .06, z, g); f.rotation.x = z > 0 ? .5 : -.5; } // fins
      grip(-.02, darkMetal); trigger(.03);
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
  const templates = new Map();
  function modelFor(item, type) {
    const k = type + item.id;
    if (!templates.has(k)) templates.set(k, type === 'knife' ? buildKnife(item) : buildGun(item));
    return templates.get(k).clone();
  }
  function colorOf(item, T) { return item.col === 'chroma' ? new THREE.Color().setHSL(((T * 140) % 360) / 360, .95, .62) : new THREE.Color(item.col); }
  function tickChroma(T) { const c = colorOf({ col: 'chroma' }, T); for (const [m, glow] of chromaMats) { m.color.copy(c); if (glow) m.emissive.copy(c); } }
  // containers keep the old API: make*() gives a holder, style*() swaps in the right model for a skin
  function holder() { const g = new THREE.Group(); g.userData.id = null; return g; }
  function setModel(h, item, type) {
    if (h.userData.id === item.id) return;
    while (h.children.length) h.remove(h.children[0]);
    h.add(modelFor(item, type)); h.userData.id = item.id;
  }
  const makeKnife = holder, makeGun = holder;
  const styleKnife = (h, item) => setModel(h, item, 'knife');
  const styleGun = (h, item) => setModel(h, item, 'gun');
  const people = new Map(); // ent id → rig
  function makeRig(color) {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const shirt = mat(color), skin = mat('#f7d154'), pants = mat('#34304a');
    const part = (w, h, d, m, x, y, z, parent = body) => { const p = new THREE.Mesh(box(w, h, d), m); p.position.set(x, y, z); parent.add(p); return p; };
    const legL = new THREE.Group(), legR = new THREE.Group(); legL.position.set(0, .36, -.08); legR.position.set(0, .36, .08); body.add(legL, legR);
    part(.14, .36, .13, pants, 0, -.18, 0, legL); part(.14, .36, .13, pants, 0, -.18, 0, legR);
    part(.2, .38, .34, shirt, 0, .55, 0);
    const armL = new THREE.Group(), armR = new THREE.Group(); armL.position.set(0, .72, -.23); armR.position.set(0, .72, .23); body.add(armL, armR);
    part(.12, .34, .12, skin, 0, -.16, 0, armL); part(.12, .34, .12, skin, 0, -.16, 0, armR);
    part(.26, .26, .26, skin, 0, .88, 0);
    part(.28, .08, .28, shirt, -.01, 1.03, 0); // hair/cap
    part(.02, .05, .04, mat('#222'), .13, .9, -.06); part(.02, .05, .04, mat('#222'), .13, .9, .06);
    // knife sits in a grip at the hand; rolled so the blade's flat side faces sideways when it's held up
    const knifeGrip = new THREE.Group(); knifeGrip.position.set(0, -.34, 0); armR.add(knifeGrip);
    const knife = makeKnife(); knife.rotation.x = Math.PI / 2; knife.position.x = .06; knife.scale.setScalar(1.4); knife.visible = false; knifeGrip.add(knife);
    const gun = makeGun(); gun.position.set(0, -.36, 0); gun.scale.setScalar(1.6); gun.visible = false; armR.add(gun);
    const ring = new THREE.Mesh(new THREE.RingGeometry(.36, .42, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .7, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .02; ring.visible = false; root.add(ring);
    root.scale.setScalar(1.1);
    scene.add(root);
    return { root, body, legL, legR, armL, armR, knife, knifeGrip, gun, ring, color };
  }
  function rigFor(id, color) {
    let r = people.get(id);
    if (!r || r.color !== color) { if (r) scene.remove(r.root); r = makeRig(color); people.set(id, r); }
    return r;
  }
  function poseRig(r, d, w, item, T, isMe, dead) {
    r.root.visible = true;
    r.root.position.set(d.x * S, 0, d.y * S);
    r.root.rotation.set(0, -d.a, 0);
    r.ring.visible = isMe && !dead;
    if (dead) { // lying on the floor
      r.body.rotation.set(Math.PI / 2, 0, 0); r.body.position.set(0, .14, 0);
      r.legL.rotation.z = r.legR.rotation.z = r.armL.rotation.z = r.armR.rotation.z = 0;
      r.knife.visible = r.gun.visible = false; return;
    }
    r.body.rotation.set(0, 0, 0); r.body.position.set(0, Math.abs(Math.sin(d.walk)) * .04, 0);
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
  let W = 1, H = 1;
  api.resize = (w, h) => { W = w; H = h; renderer.setSize(w, h, false); renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px'; camera.aspect = w / h; camera.updateProjectionMatrix(); };
  function placeCamera(cx, cy) {
    // tilted top-down camera that follows the player; phones sit a bit farther back
    const k = Math.max(1, Math.min(1.7, 760 / Math.min(W, H))) * (W < H ? 1.25 : 1);
    const tx = cx * S, tz = cy * S;
    camera.position.set(tx, 8.5 * k, tz + 6 * k);
    camera.lookAt(tx, 0, tz);
    camera.updateMatrixWorld();
  }
  const ray = new THREE.Raycaster(), aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -.55), hit = new THREE.Vector3(), tmp = new THREE.Vector3();
  api.screenToWorld = (x, y) => {
    ray.setFromCamera({ x: x / W * 2 - 1, y: -(y / H) * 2 + 1 }, camera);
    return ray.ray.intersectPlane(aimPlane, hit) ? { x: hit.x / S, y: hit.z / S } : null;
  };
  api.worldToScreen = (x, y, h = 0) => {
    tmp.set(x * S, h, y * S).project(camera);
    return { x: (tmp.x + 1) / 2 * W, y: (1 - tmp.y) / 2 * H, behind: tmp.z > 1 };
  };
  api.show = on => { renderer.domElement.style.display = on ? 'block' : 'none'; };

  // ---------------- per frame ----------------
  // V: the client's view of the round. ITEM: item table. myW: our own weapon state.
  api.draw = (V, ITEM, T, myW) => {
    const M = V.M, s = V.snap;
    // the page can change size without us hearing about it (app frames, rotation): always match the window
    if (innerWidth !== W || innerHeight !== H || renderer.domElement.width === 0) api.resize(innerWidth, innerHeight);
    if (M.idx !== mapIdx) { buildMap(M); for (const r of people.values()) scene.remove(r.root); people.clear(); }
    placeCamera(V.cam.x, V.cam.y);
    tickChroma(T);
    pools.forEach(p => p.reset());
    // coins
    for (const [x, y] of s.c) { const m = coins.get(); const b = (x * 7 + y * 13) % 6; m.position.set(x * S, .28 + Math.sin(T * 4 + b) * .04, y * S); m.rotation.y = T * 3 + b; }
    // people (alive and dead)
    const seen = new Set(), bodies = new Map(s.b.map(b => [b.id, b]));
    for (const [id, d] of V.disp) {
      const r = V.roster.get(id); if (!r) continue;
      const body = !d.alive && bodies.get(id);
      if (!d.alive && !body) continue;
      const rig = rigFor(id, r.color); seen.add(id);
      const isMe = id === V.you, w = isMe && myW !== undefined ? myW : d.w;
      const item = w === 'k' ? (ITEM[r.knife] || ITEM.k0) : (ITEM[r.gun] || ITEM.g0);
      if (body) poseRig(rig, { x: body.x, y: body.y, a: body.a, walk: 0, sw: 0 }, 0, item, T, isMe, true);
      else { poseRig(rig, d, w, item, T, isMe, false); const sh = shadows.get(); sh.position.set(d.x * S, .01, d.y * S); }
    }
    for (const [id, r] of people) if (!seen.has(id)) r.root.visible = false;
    // dropped gun
    dropGun.visible = dropRing.visible = !!s.g;
    if (s.g) {
      dropGun.position.set(s.g.x * S, .35 + Math.sin(T * 3) * .06, s.g.y * S); dropGun.rotation.y = T * 1.5; styleGun(dropGun, ITEM.g0, T);
      dropRing.position.set(s.g.x * S, .05, s.g.y * S); dropRing.scale.setScalar(1 + Math.sin(T * 5) * .12);
    }
    // projectiles (extrapolated from the last snapshot)
    const age = Math.min(.1, (performance.now() - V.snapT) / 1000);
    for (const [k, x, y, vx, vy, skin] of s.p) {
      const px = (x + vx * age) * S, pz = (y + vy * age) * S;
      if (k === 'k') { const m = knifeMeshes.get(); styleKnife(m, ITEM[skin] || ITEM.k0, T); m.position.set(px, .6, pz); m.rotation.set(0, T * 25, 0); }
      else {
        const m = bullets.get(), ray = ITEM[skin] && ITEM[skin].sound === 'ray';
        m.material.color.set(ray ? '#39ff14' : '#fff6a0'); m.scale.set(ray ? 1.4 : 1, ray ? 2 : 1, ray ? 2 : 1);
        m.position.set(px, .6, pz); m.rotation.set(0, -Math.atan2(vy, vx), 0);
      }
    }
    // effects
    for (const f of V.fx) {
      if (f.type === 'blood') { const m = blood.get(); m.position.set(f.x * S, .1 + f.t * .8, f.y * S); }
      else if (f.type === 'flash') { const m = flashes.get(); m.position.set(f.x * S, .6, f.y * S); }
      else if (f.type === 'stuck') { const m = knifeMeshes.get(); styleKnife(m, ITEM[f.skin] || ITEM.k0, T); m.position.set(f.x * S, .6, f.y * S); m.rotation.set(0, -f.ang, 0); }
    }
    pools.forEach(p => p.hideRest());
    renderer.render(scene, camera);
  };
  return api;
})();
