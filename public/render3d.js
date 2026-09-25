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
  function colorOf(item, T) { return item.col === 'chroma' ? new THREE.Color().setHSL(((T * 140) % 360) / 360, .95, .62) : new THREE.Color(item.col); }
  function makeKnife() {
    const g = new THREE.Group();
    const handle = new THREE.Mesh(box(.14, .05, .05), mat('#3b2616')); handle.position.x = -.07; g.add(handle);
    const blade = new THREE.Mesh(box(.3, .03, .07), new THREE.MeshLambertMaterial({ color: '#ccc' })); blade.position.x = .15; g.add(blade);
    g.userData.blade = blade; return g;
  }
  function styleKnife(k, item, T) {
    const b = k.userData.blade; const L = item.long ? .52 : .3;
    b.scale.x = L / .3; b.position.x = L / 2; b.material.color.copy(colorOf(item, T));
  }
  function makeGun() {
    const g = new THREE.Group();
    const barrel = new THREE.Mesh(box(.3, .07, .06), new THREE.MeshLambertMaterial({ color: '#888' })); barrel.position.x = .1; g.add(barrel);
    const grip = new THREE.Mesh(box(.07, .14, .05), mat('#2a2a2a')); grip.position.set(-.02, -.08, 0); g.add(grip);
    const scope = new THREE.Mesh(box(.18, .06, .05), mat('#222')); scope.position.set(.14, .07, 0); g.add(scope);
    g.userData = { barrel, scope }; return g;
  }
  function styleGun(gm, item, T) {
    const { barrel, scope } = gm.userData, L = item.long ? .62 : .3;
    barrel.scale.x = L / .3; barrel.position.x = L / 2 - .05; barrel.material.color.copy(colorOf(item, T));
    scope.visible = !!item.long;
  }
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
    const knife = makeKnife(); knife.position.set(.06, -.3, 0); knife.visible = false; armR.add(knife);
    const gun = makeGun(); gun.position.set(.08, -.3, 0); gun.visible = false; armR.add(gun);
    const ring = new THREE.Mesh(new THREE.RingGeometry(.36, .42, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .7, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .02; ring.visible = false; root.add(ring);
    root.scale.setScalar(1.1);
    scene.add(root);
    return { root, body, legL, legR, armL, armR, knife, gun, ring, color };
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
    if (w) {
      const slash = d.sw > 0 ? Math.sin((1 - d.sw / .2) * Math.PI) * 1.3 : 0;
      r.armR.rotation.set(-slash * .6, 0, Math.PI / 2 - .15); // arm held forward
      if (w === 'k') styleKnife(r.knife, item, T); else styleGun(r.gun, item, T);
      r.knife.rotation.set(0, 0, -Math.PI / 2); r.gun.rotation.set(0, 0, -Math.PI / 2);
    } else r.armR.rotation.set(0, 0, swing * .8);
  }

  const dropGun = makeGun(); scene.add(dropGun); dropGun.visible = false;
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
    if (M.idx !== mapIdx) { buildMap(M); for (const r of people.values()) scene.remove(r.root); people.clear(); }
    placeCamera(V.cam.x, V.cam.y);
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
