'use strict';
// Browser client: sign-in, lobby UI, rendering. Online rounds are run by the server;
// practice rounds run the same shared simulation (Sim) locally.
const $ = s => document.querySelector(s);
const cv = $('#game'), ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
  cv.width = W * DPR; cv.height = H * DPR; cv.style.width = W + 'px'; cv.style.height = H + 'px';
}
addEventListener('resize', resize); resize();

const { ITEM, RAR, RORDER, CRATES, TILE, BAG_MAX } = Sim;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const itemColor = (it, t = performance.now() / 1000) => it.col === 'chroma' ? `hsl(${(t * 140) % 360},95%,62%)` : it.col;
const rarColor = r => r === 'Chroma' ? '#fff' : RAR[r].c;
const show = (sel, on = true) => $(sel).classList.toggle('hide', !on);
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };

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

let toastT = 0;
function toast(text, ok) {
  const t = $('#toast'); t.textContent = text; t.classList.toggle('ok', !!ok); show('#toast');
  clearTimeout(toastT); toastT = setTimeout(() => show('#toast', false), 3500);
}

// ===================== Account + connection =====================
let CFG = null, fbAuth = null, ws = null, P = null, traders = [], screen = 'boot', reconnectT = 0, wantOnline = false;

function setScreen(s) {
  screen = s;
  show('#authScreen', s === 'auth'); show('#nameScreen', s === 'name'); show('#connecting', s === 'connecting');
  show('#lobby', s === 'lobby'); show('#roomScreen', s === 'room');
  if (s === 'lobby') renderLobby();
}
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); });
}
async function boot() {
  setScreen('connecting');
  try { CFG = await (await fetch('/config.json', { cache: 'no-store' })).json(); }
  catch (e) { $('#connText').textContent = 'Could not reach the game server.'; return; }
  if (CFG.auth === 'firebase') {
    const v = '10.14.1';
    await loadScript(`https://www.gstatic.com/firebasejs/${v}/firebase-app-compat.js`);
    await loadScript(`https://www.gstatic.com/firebasejs/${v}/firebase-auth-compat.js`);
    firebase.initializeApp(CFG.firebase);
    fbAuth = firebase.auth();
    fbAuth.onAuthStateChanged(u => { if (u) { wantOnline = true; connect(); } else { wantOnline = false; disconnect(); setScreen('auth'); } });
  } else {
    show('#authFirebase', false); show('#authDev', true);
    $('#devName').value = lsGet('mm_dev_name') || '';
    setScreen('auth');
  }
}
async function connect() {
  disconnect();
  setScreen('connecting'); $('#connText').textContent = 'Connecting…';
  let auth;
  try {
    if (CFG.auth === 'firebase') auth = { t: 'auth', token: await fbAuth.currentUser.getIdToken() };
    else auth = { t: 'auth', dev: lsGet('mm_dev_name') || $('#devName').value };
  } catch (e) { setScreen('auth'); $('#authErr').textContent = 'Sign-in expired. Log in again.'; return; }
  const sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws = sock;
  sock.onopen = () => sock.send(JSON.stringify(auth));
  sock.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (_) { return; } onMsg(m); };
  sock.onclose = () => {
    if (ws !== sock) return;
    ws = null;
    if (V && !V.offline) endGameView();
    if (wantOnline) { setScreen('connecting'); $('#connText').textContent = 'Lost connection. Reconnecting…'; clearTimeout(reconnectT); reconnectT = setTimeout(connect, 2000); }
  };
}
function disconnect() { clearTimeout(reconnectT); if (ws) { const s = ws; ws = null; s.close(); } }
function net(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }

function onMsg(m) {
  switch (m.t) {
    case 'hello': P = m.p; traders = m.traders; if (!V) setScreen('lobby'); break;
    case 'needName': setScreen('name'); $('#nameInput').focus(); break;
    case 'profile': P = m.p; if (screen === 'lobby') renderLobby(); break;
    case 'error':
      if (screen === 'name') $('#nameErr').textContent = m.msg;
      else if (screen === 'auth' || screen === 'connecting') { $('#authErr').textContent = m.msg; }
      else toast(m.msg);
      if (unboxPending) { unboxPending = false; show('#unbox', false); }
      break;
    case 'kicked': wantOnline = false; toast(m.msg); if (fbAuth) fbAuth.signOut(); else setScreen('auth'); break;
    case 'room': onRoom(m); break;
    case 'left': endGameView(); setScreen('lobby'); break;
    case 'round': startOnlineView(m); break;
    case 's': if (V && !V.offline) { if (m.s) applySnap(m.s); if (m.ev) m.ev.forEach(handleEvent); } break;
    case 'reward': showReward(m.r); break;
    case 'unboxed': playUnbox(m.crate, m.item); break;
    case 'traders': traders = m.traders; if (screen === 'lobby') renderLobby(); break;
    case 'tradeResult':
      traders = m.traders; offMine = []; offTheirs = [];
      $('#tradeChat').innerHTML = `<span class="muted">${esc(m.trader)}:</span> ${esc(m.line)}`;
      m.ok ? SFX.win() : tone(200, .25, 'sawtooth', .04);
      renderLobby(); break;
  }
}

// ---------- auth forms ----------
let signup = false;
function setSeg(s) {
  signup = s; $('#segLogin').classList.toggle('active', !s); $('#segSignup').classList.toggle('active', s);
  show('#pass2Row', s); $('#authSubmit').textContent = s ? 'Create account' : 'Log in';
  $('#authPass').autocomplete = s ? 'new-password' : 'current-password'; $('#authErr').textContent = '';
}
$('#segLogin').onclick = () => setSeg(false);
$('#segSignup').onclick = () => setSeg(true);
const FB_ERR = {
  'auth/invalid-email': 'That email doesn\'t look right.', 'auth/user-not-found': 'Wrong email or password.', 'auth/wrong-password': 'Wrong email or password.',
  'auth/invalid-credential': 'Wrong email or password.', 'auth/email-already-in-use': 'That email already has an account. Log in instead.',
  'auth/weak-password': 'Use at least 8 characters for your password.', 'auth/too-many-requests': 'Too many tries. Wait a minute and try again.',
  'auth/network-request-failed': 'No connection. Check your internet.',
};
$('#authForm').onsubmit = async e => {
  e.preventDefault();
  const email = $('#authEmail').value.trim(), pass = $('#authPass').value, err = $('#authErr');
  err.textContent = '';
  if (signup) {
    if (pass.length < 8) { err.textContent = 'Use at least 8 characters for your password.'; return; }
    if (pass !== $('#authPass2').value) { err.textContent = 'Passwords don\'t match.'; return; }
  }
  $('#authSubmit').disabled = true;
  try {
    if (signup) { const cred = await fbAuth.createUserWithEmailAndPassword(email, pass); cred.user.sendEmailVerification().catch(() => { }); }
    else await fbAuth.signInWithEmailAndPassword(email, pass);
  } catch (ex) { err.textContent = FB_ERR[ex.code] || 'Sign-in failed. Try again.'; }
  $('#authSubmit').disabled = false;
};
$('#forgotBtn').onclick = async () => {
  const email = $('#authEmail').value.trim();
  if (!email) { $('#authErr').textContent = 'Type your email first, then tap Forgot password.'; return; }
  try { await fbAuth.sendPasswordResetEmail(email); toast('Password reset email sent 📬', true); }
  catch (ex) { $('#authErr').textContent = FB_ERR[ex.code] || 'Could not send the reset email.'; }
};
$('#devForm').onsubmit = e => { e.preventDefault(); lsSet('mm_dev_name', $('#devName').value.trim()); $('#authErr').textContent = ''; wantOnline = true; connect(); };
$('#nameForm').onsubmit = e => { e.preventDefault(); $('#nameErr').textContent = ''; net({ t: 'setName', name: $('#nameInput').value.trim() }); };
$('#logoutBtn').onclick = () => { wantOnline = false; disconnect(); P = null; if (fbAuth) fbAuth.signOut(); else setScreen('auth'); };

// ---------- rooms ----------
function onRoom(m) {
  if (m.state === 'waiting') {
    if (V && !V.offline) endGameView();
    setScreen('room');
    $('#roomTitle').textContent = m.private ? 'Private room' : 'Public match';
    show('#roomCode', m.private); $('#roomCode').textContent = m.code;
    $('#roomTimer').textContent = `Round starts in ${m.timer}s`;
    $('#roomPlayers').innerHTML = m.players.map(n => `<span>${esc(n)}</span>`).join('');
  }
  if (V && !V.offline) V.roomCode = m.code;
}
$('#quickBtn').onclick = () => net({ t: 'quickplay' });
$('#privBtn').onclick = () => net({ t: 'createPrivate' });
$('#joinForm').onsubmit = e => { e.preventDefault(); const c = $('#codeInput').value.trim(); if (c) net({ t: 'joinCode', code: c }); };
$('#leaveRoomBtn').onclick = () => net({ t: 'leave' });

// ===================== Game view =====================
// V holds what this client knows about the current round (never other players' roles).
let V = null;
let keys = {}, mouse = { x: 0, y: 0, wx: 0, wy: 0, down: false };
let thrSeq = 0, togSeq = 0, sendT = 0;

function newView(mapIdx, roster, you, offline) {
  V = {
    offline, M: Sim.buildMap(mapIdx), roster: new Map(roster.map(r => [r.id, r])), you,
    disp: new Map(), snap: null, snapT: 0, lp: null, fx: [], cam: { x: 0, y: 0 }, spec: null, phase: 'intro',
    me: null, endInfo: null, endShownAt: 0, reward: null, introShown: false, R: null,
  };
  $('#msgs').innerHTML = ''; hudCache = {};
  show('#lobby', false); show('#roomScreen', false); show('#endScreen', false); show('#hud');
  screen = 'game';
}
function startOnlineView(m) {
  newView(m.map, m.roster, m.you, false);
  if (m.you === null) msg('Round in progress. You\'ll join the next one 👀', '#fff', 5);
}
function startPractice() {
  const R = Sim.createRound({ mapIdx: +$('#mapSel').value, players: [{ pid: 'me', name: P ? P.name : 'You', knife: equippedId('knife'), gun: equippedId('gun'), mT: 1, sT: 1 }] });
  newView(R.mapIdx, Sim.roster(R), R.ents[0].id, true);
  V.R = R;
  applySnap(Sim.snapshotFor(R, V.you));
}
function endGameView() {
  V = null; mouse.down = false;
  show('#hud', false); show('#intro', false); show('#endScreen', false);
}
function equippedId(type) {
  if (!P) return type === 'knife' ? 'k0' : 'g0';
  const inst = P.inv.find(i => i.u === P.equip[type]);
  return inst ? inst.id : (type === 'knife' ? 'k0' : 'g0');
}

function applySnap(s) {
  const first = !V.snap;
  V.snap = s; V.snapT = performance.now(); V.phase = s.ph;
  for (const [id, x, y, a, al, w, sw] of s.e) {
    let d = V.disp.get(id);
    if (!d) { d = { x, y, a, walk: 0 }; V.disp.set(id, d); }
    d.tx = x; d.ty = y; d.ta = a; d.alive = !!al; d.w = w; d.sw = sw;
    if (!d.alive) { d.x = x; d.y = y; }
  }
  V.me = s.me || null;
  if (V.me) {
    // client-side prediction for our own movement, corrected when the server disagrees
    if (!V.lp || s.ph !== 'play' || !V.me.alive || Math.hypot(V.lp.x - V.me.x, V.lp.y - V.me.y) > 60) V.lp = { x: V.me.x, y: V.me.y, r: 15 };
  }
  if (first) { const f = focusEnt(); if (f) { V.cam.x = f.x; V.cam.y = f.y; } }
  if (s.ph === 'intro' && V.me && !V.introShown) showIntro();
  if (s.end && !V.endInfo) onEnd(s.end);
}
function showIntro() {
  V.introShown = true;
  const R = { murderer: ['MURDERER', '#ff4d5e', 'Kill everyone. Don\'t get caught with your knife out 🔪'], sheriff: ['SHERIFF', '#4da3ff', 'Find the murderer and shoot them. Don\'t shoot innocents!'], innocent: ['INNOCENT', '#5bd46a', 'Hide, survive, and collect coins. Grab the gun if the sheriff dies.'] }[V.me.role] || ['INNOCENT', '#5bd46a', ''];
  $('#introRole').textContent = R[0]; $('#introRole').style.color = R[1]; $('#introSub').textContent = R[2];
  show('#intro');
  tone(220, .3, 'triangle', .06); setTimeout(() => tone(330, .4, 'triangle', .06), 300);
}
const nameOf = id => id === V.you ? 'You' : (V.roster.get(id) || {}).name || 'Someone';
function msg(text, color = '#fff', dur = 3.5) {
  const d = document.createElement('div'); d.textContent = text; d.style.color = color;
  $('#msgs').appendChild(d);
  setTimeout(() => d.style.opacity = 0, dur * 1000); setTimeout(() => d.remove(), dur * 1000 + 600);
  while ($('#msgs').children.length > 4) $('#msgs').firstChild.remove();
}
function handleEvent(ev) {
  if (!V) return;
  switch (ev.t) {
    case 'start':
      show('#intro', false);
      if (V.me) msg(V.me.role === 'murderer' ? 'You have your knife. Happy hunting 😈' : V.me.role === 'sheriff' ? 'You have the gun. Find the murderer 👀' : 'Round started. Stay alive!', '#fff', 3);
      break;
    case 'sfx': if (Math.hypot(ev.x - V.cam.x, ev.y - V.cam.y) < 900 && SFX[ev.s]) SFX[ev.s](); break;
    case 'fx':
      if (ev.k === 'blood') for (let i = 0; i < 14; i++) V.fx.push({ type: 'blood', x: ev.x, y: ev.y, vx: rand(-120, 120), vy: rand(-120, 120), t: rand(.3, .6) });
      else if (ev.k === 'stuck') V.fx.push({ type: 'stuck', x: ev.x, y: ev.y, ang: ev.a, skin: ev.skin, t: 1.2 });
      else if (ev.k === 'flash') V.fx.push({ type: 'flash', x: ev.x, y: ev.y, t: .08 });
      break;
    case 'coin': SFX.coin(); if (ev.full) msg('Coin bag full! 💰', '#ffc233'); break;
    case 'gunDrop': msg('The Sheriff has been killed! The gun has dropped 🔫', '#4da3ff', 5); SFX.gun(); break;
    case 'gunTaken': msg('Someone picked up the gun...', '#fff', 4); break;
    case 'hero': msg('You picked up the gun! You are the HERO 🦸', '#ffc233', 4); SFX.gun(); break;
    case 'badShot': msg(`${nameOf(ev.id)} shot an innocent! 💀`, '#ff4d5e', 4); break;
    case 'died':
      msg(ev.how === 'badShot' ? 'You shot an innocent and died.' : ev.how === 'murdered' ? `You were killed by ${ev.by}!` : ev.how === 'shot' ? `${ev.by} shot you!` : 'You died.', '#ff4d5e', 5);
      break;
    case 'murdererDown': msg(`${ev.byId ? nameOf(ev.byId) : 'Someone'} killed the Murderer! 🎉`, '#5bd46a', 5); break;
    case 'end': onEnd(ev); break;
  }
}
function onEnd(info) {
  if (V.endInfo) return;
  V.endInfo = info; V.endAt = performance.now();
  if (V.me) {
    const won = (info.w === 'murderer') === (startRoleOf(info) === 'murderer');
    won ? SFX.win() : SFX.lose();
  }
}
function startRoleOf(info) {
  // the hero started as innocent; the final role list is enough to tell murderer vs not
  const r = info.roles.find(([id]) => id === V.you); return r ? r[1] : null;
}
function showEnd() {
  const info = V.endInfo;
  $('#endTitle').textContent = info.w === 'murderer' ? 'Murderer Wins! 🔪' : 'Innocents Win! 🎉';
  $('#endTitle').style.color = info.w === 'murderer' ? '#ff4d5e' : '#5bd46a';
  $('#endRoles').innerHTML = `<div>🔪 Murderer: <b style="color:#ff4d5e">${esc(info.murderer)}</b></div><div>🔫 Sheriff: <b style="color:#4da3ff">${esc(info.sheriff)}</b></div>` +
    (info.hero ? `<div>🦸 Hero: <b style="color:#ffc233">${esc(info.hero)}</b></div>` : '');
  if (V.offline) { $('#endRewards').innerHTML = 'Practice round: no coins or XP.'; $('#endNext').textContent = ''; $('#endBtn').textContent = 'Back to lobby'; }
  else if (!V.me) { $('#endRewards').innerHTML = 'You were spectating this one.'; }
  else if (!V.reward) $('#endRewards').innerHTML = 'Counting your rewards…';
  if (!V.offline) { $('#endNext').textContent = 'Next round starts soon.'; $('#endBtn').textContent = 'Leave room'; }
  if (V.reward) showReward(V.reward);
  show('#endScreen');
}
function showReward(r) {
  if (!V) return;
  V.reward = r;
  $('#endRewards').innerHTML = `${r.won ? '<b style="color:#5bd46a">You won!</b>' : '<b style="color:#ff4d5e">You lost</b>'}<br>💰 +${r.coins} coins · ⭐ +${r.xp} XP` + (r.kills ? ` · ☠️ ${r.kills} kill${r.kills > 1 ? 's' : ''}` : '') + (r.levelUps ? `<br><b style="color:#ffc233">LEVEL UP! You're level ${P ? P.level : ''} 🎉</b>` : '');
}
$('#endBtn').onclick = () => {
  if (V && V.offline) { endGameView(); setScreen('lobby'); }
  else { net({ t: 'leave' }); }
};

function focusEnt() {
  if (V.me && V.me.alive && V.lp) return V.lp;
  if (V.me && V.me.alive) return V.disp.get(V.you);
  if (!V.spec || !V.disp.get(V.spec) || !V.disp.get(V.spec).alive) {
    const a = [...V.disp.entries()].find(([, d]) => d.alive); V.spec = a ? a[0] : null;
  }
  return V.spec ? V.disp.get(V.spec) : (V.disp.get(V.you) || { x: V.cam.x, y: V.cam.y });
}

// ===================== Update =====================
function update(dt) {
  const me = V.me;
  // offline: step the local simulation
  if (V.offline) {
    Sim.setInput(V.R, V.you, currentInput());
    Sim.step(V.R, dt);
    Sim.eventsFor(Sim.drain(V.R), V.you).forEach(handleEvent);
    applySnap(Sim.snapshotFor(V.R, V.you));
  }
  // own movement prediction
  if (me && me.alive && V.lp && V.phase === 'play') {
    let dx = 0, dy = 0;
    if (keys.KeyW || keys.ArrowUp) dy--; if (keys.KeyS || keys.ArrowDown) dy++;
    if (keys.KeyA || keys.ArrowLeft) dx--; if (keys.KeyD || keys.ArrowRight) dx++;
    const l = Math.hypot(dx, dy) || 1;
    Sim.moveEnt(V.M, V.lp, dx / l, dy / l, dt, Sim.PLAYER_SPEED);
    const d = V.disp.get(V.you); if (d && (dx || dy)) d.walk += dt * 12;
  }
  if (!V.offline) { sendT -= dt; if (sendT <= 0 && me) { sendT = 1 / 30; net({ t: 'in', ...currentInput() }); } }
  // smooth everyone else toward their latest server position
  const k = Math.min(1, dt * 15);
  for (const [id, d] of V.disp) {
    if (id === V.you && V.lp && me && me.alive) { d.x = V.lp.x; d.y = V.lp.y; d.a = myAngle(); continue; }
    const mx = d.tx - d.x, my = d.ty - d.y;
    if (Math.hypot(mx, my) > 200) { d.x = d.tx; d.y = d.ty; } else { d.x += mx * k; d.y += my * k; }
    if (Math.hypot(mx, my) > .5) d.walk += dt * 12;
    d.a = d.ta;
  }
  for (let i = V.fx.length - 1; i >= 0; i--) { const f = V.fx[i]; f.t -= dt; if (f.vx) { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= .9; f.vy *= .9; } if (f.t <= 0) V.fx.splice(i, 1); }
  if (V.endInfo && !V.endShown && performance.now() - V.endAt > 1400) { V.endShown = true; showEnd(); }
  const f = focusEnt();
  if (f) { V.cam.x += (f.x - V.cam.x) * Math.min(1, dt * 8); V.cam.y += (f.y - V.cam.y) * Math.min(1, dt * 8); }
  mouse.wx = mouse.x - W / 2 + V.cam.x; mouse.wy = mouse.y - H / 2 + V.cam.y;
  updateHUD();
}
function myAngle() { return V.lp ? Math.atan2(mouse.wy - V.lp.y, mouse.wx - V.lp.x) : 0; }
function currentInput() {
  const lp = V.lp || { x: 0, y: 0 };
  return { x: Math.round(lp.x * 10) / 10, y: Math.round(lp.y * 10) / 10, a: +myAngle().toFixed(3), atk: mouse.down, thr: thrSeq, tog: togSeq };
}

// ===================== HUD =====================
let hudCache = {};
function setText(id, t) { if (hudCache[id] !== t) { hudCache[id] = t; $('#' + id).textContent = t; } }
function setHTML(id, t) { if (hudCache[id] !== t) { hudCache[id] = t; $('#' + id).innerHTML = t; } }
function updateHUD() {
  const s = V.snap; if (!s) return;
  const me = V.me, t = Math.max(0, Math.ceil(s.tm));
  setText('timer', s.ph === 'intro' ? Math.max(1, Math.ceil(s.it)) + '' : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
  setText('alive', `👥 ${s.e.filter(e => e[4]).length} alive`);
  show('#bag', !!me); show('#roleBadge', !!me);
  if (me) {
    setText('bag', `💰 ${me.bag}/${BAG_MAX}`);
    const role = me.role === 'hero' ? ['HERO', '#ffc233'] : me.role === 'murderer' ? ['MURDERER', '#ff4d5e'] : me.role === 'sheriff' ? ['SHERIFF', '#4da3ff'] : ['INNOCENT', '#5bd46a'];
    const rb = $('#roleBadge'); if (hudCache.role !== role[0] + me.alive) { hudCache.role = role[0] + me.alive; rb.textContent = (me.alive ? '' : '💀 ') + role[0]; rb.style.background = role[1] + '55'; rb.style.color = role[1]; }
  }
  let cools = '';
  if (me && me.alive && me.role === 'murderer') cools = coolBar('Stab', 1 - me.atk / .5) + coolBar('Throw (Q)', 1 - me.thr / 3);
  else if (me && me.alive && me.gun) cools = coolBar('Gun', 1 - me.atk / 2.2);
  setHTML('cools', cools);
  const hint = !me ? 'Spectating · click to switch' : !me.alive ? 'Click to switch spectate' : me.role === 'murderer' ? 'Click stab · Q/Right-click throw · E hide knife' : me.gun ? 'Click shoot · E put away gun' : 'Collect coins · Stay alive · Grab the gun if it drops';
  setText('hint', hint);
  const spectating = (!me || !me.alive) && V.spec;
  show('#spec', !!spectating); if (spectating) setText('spec', `👁️ Spectating ${nameOf(V.spec)}`);
}
const coolBar = (n, f) => { f = clamp(f, 0, 1); return `<div class="cool"><i style="transform:scaleX(${f.toFixed(2)});background:${f >= 1 ? '#5bd46a' : '#b36bff'}"></i><span>${n}${f >= 1 ? ' ✓' : ''}</span></div>`; };

// ===================== Render =====================
function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#0d0b12'; ctx.fillRect(0, 0, W, H);
  if (!V || !V.snap) return;
  const M = V.M, s = V.snap;
  const cx = Math.round(V.cam.x - W / 2), cy = Math.round(V.cam.y - H / 2), T = performance.now() / 1000;
  ctx.save(); ctx.translate(-cx, -cy);
  const tx0 = Math.max(0, Math.floor(cx / TILE)), ty0 = Math.max(0, Math.floor(cy / TILE));
  const tx1 = Math.min(M.W - 1, Math.floor((cx + W) / TILE)), ty1 = Math.min(M.H - 1, Math.floor((cy + H) / TILE));
  for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
    if (M.grid[y][x] === '#') continue;
    ctx.fillStyle = M.floor[(x + y) & 1]; ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
  }
  for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
    const c = M.grid[y][x], X = x * TILE, Y = y * TILE;
    if (c === 'T') { ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(X + 3, Y + 7, TILE - 2, TILE - 4); ctx.fillStyle = '#8a5a34'; ctx.fillRect(X + 1, Y + 1, TILE - 2, TILE - 4); ctx.fillStyle = '#a06b40'; ctx.fillRect(X + 3, Y + 3, TILE - 6, TILE - 10); }
    else if (c === 'P') { ctx.fillStyle = '#8b4a2b'; ctx.fillRect(X + 16, Y + 26, 16, 16); ctx.fillStyle = '#2f9e44'; for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(X + 24 + Math.cos(k * 1.3) * 9, Y + 20 + Math.sin(k * 1.3) * 8, 9, 0, 7); ctx.fill(); } }
    else if (c === 'B') { ctx.fillStyle = '#3b2616'; ctx.fillRect(X, Y, TILE, TILE); const bc = ['#c92a2a', '#1971c2', '#e67700', '#2b8a3e', '#862e9c']; for (let k = 0; k < 6; k++) { ctx.fillStyle = bc[(x * 3 + y + k) % 5]; ctx.fillRect(X + 4 + k * 7, Y + 6, 5, 16); ctx.fillStyle = bc[(x + y * 2 + k) % 5]; ctx.fillRect(X + 4 + k * 7, Y + 26, 5, 16); } }
  }
  for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
    if (M.grid[y][x] !== '#') continue;
    ctx.fillStyle = M.wall; ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    ctx.fillStyle = M.wallTop; ctx.fillRect(x * TILE, y * TILE, TILE, TILE - 10);
    if (Sim.tileAt(M, x, y + 1) !== '#') { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x * TILE, (y + 1) * TILE, TILE, 8); }
  }
  // coins
  for (const [x, y] of s.c) {
    const b = (x * 7 + y * 13) % 6, sc = Math.abs(Math.cos(T * 3 + b)), yy = y + Math.sin(T * 4 + b) * 2;
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(x, y + 9, 7, 3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#e8a400'; ctx.beginPath(); ctx.ellipse(x, yy, 8 * sc + 1, 8, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd43b'; ctx.beginPath(); ctx.ellipse(x, yy, 6 * sc + .5, 6, 0, 0, 7); ctx.fill();
  }
  if (s.g) {
    const g = s.g, pulse = 18 + Math.sin(T * 5) * 5;
    const grd = ctx.createRadialGradient(g.x, g.y, 2, g.x, g.y, pulse * 2);
    grd.addColorStop(0, 'rgba(77,163,255,.8)'); grd.addColorStop(1, 'rgba(77,163,255,0)');
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(g.x, g.y, pulse * 2, 0, 7); ctx.fill();
    drawGunLocal(g.x - 8, g.y, '#8a8f99');
  }
  for (const f of V.fx) if (f.type === 'stuck') { ctx.globalAlpha = Math.min(1, f.t * 2); drawKnife(f.x, f.y, f.ang, ITEM[f.skin] || ITEM.k0, T); ctx.globalAlpha = 1; }
  for (const b of s.b) {
    const r = V.roster.get(b.id) || { color: '#999' };
    ctx.fillStyle = 'rgba(160,0,0,.35)'; ctx.beginPath(); ctx.ellipse(b.x + 4, b.y + 6, 22, 15, .3, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a);
    ctx.fillStyle = shade(r.color, -.35); ctx.beginPath(); ctx.ellipse(0, 0, 18, 13, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#222'; ctx.lineWidth = 2; ctx.beginPath();
    for (const o of [-5, 5]) { ctx.moveTo(6, o - 3); ctx.lineTo(12, o + 3); ctx.moveTo(12, o - 3); ctx.lineTo(6, o + 3); }
    ctx.stroke(); ctx.restore();
  }
  const al = [...V.disp.entries()].filter(([, d]) => d.alive).sort((a, b) => a[1].y - b[1].y);
  for (const [id, d] of al) drawEnt(id, d, T);
  ctx.font = '600 12px Fredoka, sans-serif'; ctx.textAlign = 'center';
  const endRoles = V.endInfo ? new Map(V.endInfo.roles) : null;
  for (const [id, d] of al) {
    const r = V.roster.get(id) || {}, lbl = id === V.you ? 'You' : r.name;
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillText(lbl, d.x + 1, d.y - 25);
    let nc = '#fff';
    if (endRoles && endRoles.get(id) === 'murderer') nc = '#ff4d5e';
    if (id === V.you && V.me) nc = roleColor(V.me.role);
    ctx.fillStyle = nc; ctx.fillText(lbl, d.x, d.y - 26);
  }
  // projectiles, extrapolated from the last snapshot
  const age = Math.min(.1, (performance.now() - V.snapT) / 1000);
  for (const [k, x, y, vx, vy, skin] of s.p) {
    const px = x + vx * age, py = y + vy * age;
    if (k === 'k') drawKnife(px, py, T * 25, ITEM[skin] || ITEM.k0, T);
    else { ctx.strokeStyle = '#fff6a0'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(px - vx * .02, py - vy * .02); ctx.lineTo(px, py); ctx.stroke(); }
  }
  for (const f of V.fx) {
    if (f.type === 'blood') { ctx.fillStyle = `rgba(200,0,20,${Math.min(1, f.t * 2)})`; ctx.fillRect(f.x - 2, f.y - 2, 4, 4); }
    if (f.type === 'flash') { ctx.fillStyle = 'rgba(255,240,150,.9)'; ctx.beginPath(); ctx.arc(f.x, f.y, 9, 0, 7); ctx.fill(); }
  }
  ctx.restore();

  const me = V.me;
  if (s.g && me && me.alive && me.role === 'innocent') {
    const gx = s.g.x - cx, gy = s.g.y - cy;
    if (gx < 0 || gy < 0 || gx > W || gy > H) {
      const a = Math.atan2(gy - H / 2, gx - W / 2), R = Math.min(W, H) / 2 - 40;
      const ax = W / 2 + Math.cos(a) * R, ay = H / 2 + Math.sin(a) * R;
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(a); ctx.fillStyle = '#4da3ff';
      ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-10, -12); ctx.lineTo(-10, 12); ctx.fill(); ctx.restore();
      ctx.font = '700 13px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText('GUN', ax, ay - 18);
    }
  }
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.max(W, H) * .75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)'); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  if (me && me.alive && (me.role === 'murderer' || me.gun) && V.phase === 'play') {
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 8, 0, 7);
    ctx.moveTo(mouse.x - 13, mouse.y); ctx.lineTo(mouse.x - 5, mouse.y); ctx.moveTo(mouse.x + 5, mouse.y); ctx.lineTo(mouse.x + 13, mouse.y); ctx.stroke();
  }
}
const roleColor = r => ({ murderer: '#ff4d5e', sheriff: '#4da3ff', hero: '#ffc233', innocent: '#5bd46a' })[r] || '#fff';
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const m = v => clamp(Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f), 0, 255);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
function drawEnt(id, d, T) {
  const r = V.roster.get(id) || { color: '#ccc', knife: 'k0', gun: 'g0' };
  const isMe = id === V.you;
  // our own weapon state comes from our snapshot so toggling feels instant enough
  const w = isMe && V.me ? (V.me.wo ? (V.me.role === 'murderer' ? 'k' : 'g') : 0) : d.w;
  const bob = Math.sin(d.walk) * 1.5;
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(d.x, d.y + 13, 14, 5, 0, 0, 7); ctx.fill();
  ctx.save(); ctx.translate(d.x, d.y + bob); ctx.rotate(d.a);
  if (w === 'k') {
    const sw = d.sw > 0 ? Math.sin((1 - d.sw / .2) * Math.PI) * 1.2 : 0;
    ctx.save(); ctx.rotate(.6 - sw); drawKnifeLocal(18, 0, 0, ITEM[r.knife] || ITEM.k0, T); ctx.restore();
  } else if (w === 'g') drawGunLocal(14, 6, itemColor(ITEM[r.gun] || ITEM.g0, T));
  ctx.fillStyle = shade(r.color, -.3); ctx.beginPath(); ctx.ellipse(0, 0, 11, 17, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#f2c89b'; ctx.beginPath(); ctx.arc(4, -14, 5, 0, 7); ctx.arc(4, 14, 5, 0, 7); ctx.fill();
  ctx.fillStyle = '#f7d154'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.fill();
  ctx.fillStyle = r.color; ctx.beginPath(); ctx.arc(-3, 0, 10, Math.PI / 2, Math.PI * 1.5); ctx.fill();
  ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(6, -4, 1.8, 0, 7); ctx.arc(6, 4, 1.8, 0, 7); ctx.fill();
  ctx.restore();
  if (isMe) { ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(d.x, d.y, 22, 0, 7); ctx.stroke(); }
}
function drawKnifeLocal(x, y, a, skin, T) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.fillStyle = '#3b2616'; ctx.fillRect(-8, -2.5, 9, 5);
  ctx.fillStyle = itemColor(skin, T); ctx.beginPath(); ctx.moveTo(1, -4); ctx.lineTo(20, -1); ctx.lineTo(22, 1); ctx.lineTo(1, 4); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
}
function drawKnife(x, y, a, skin, T) { ctx.save(); ctx.translate(x, y); ctx.rotate(a); drawKnifeLocal(-8, 0, 0, skin, T); ctx.restore(); }
function drawGunLocal(x, y, col) {
  ctx.fillStyle = col; ctx.fillRect(x, y - 3, 20, 6);
  ctx.fillStyle = shade(col.startsWith('#') ? col : '#888888', -.4); ctx.fillRect(x, y - 3, 6, 10);
}

// ===================== Input =====================
addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) return;
  keys[e.code] = true;
  if (!V || V.phase !== 'play' || !V.me || !V.me.alive) return;
  if (e.code === 'KeyQ' && V.me.role === 'murderer') thrSeq++;
  if ((e.code === 'KeyE' || e.code === 'Digit1') && (V.me.role === 'murderer' || V.me.gun)) togSeq++;
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { keys = {}; mouse.down = false; });
cv.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
cv.addEventListener('mousedown', e => {
  if (!V) return;
  if (!V.me || !V.me.alive) {
    const alive = [...V.disp.entries()].filter(([, d]) => d.alive).map(([id]) => id);
    if (alive.length) V.spec = alive[(alive.indexOf(V.spec) + 1) % alive.length];
    return;
  }
  if (e.button === 0) mouse.down = true;
  if (e.button === 2 && V.phase === 'play' && V.me.role === 'murderer') thrSeq++;
});
addEventListener('mouseup', e => { if (e.button === 0) mouse.down = false; });
cv.addEventListener('contextmenu', e => e.preventDefault());

// ===================== Lobby UI =====================
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
$('#mapSel').innerHTML = '<option value="-1">🎲 Random map</option>' + Sim.MAPS.map((m, i) => `<option value="${i}">${m.name}</option>`).join('');
$('#practiceBtn').onclick = () => { tone(600, .1); startPractice(); };

function sortedInv() { return P.inv.slice().sort((a, b) => ITEM[b.id].val - ITEM[a.id].val); }
function renderLobby() {
  if (!P) return;
  $('#namePill').textContent = P.name;
  $('#coinPill').textContent = `💰 ${P.coins}`;
  $('#lvlPill').textContent = `Lv ${P.level}`;
  $('#xpFill').style.width = (P.xp / P.xpNeed * 100) + '%';
  if (curTab === 'play') {
    const n = Sim.MAX_PLAYERS, pm = P.mT / (P.mT + n - 1), ps = (1 - pm) * (P.sT / (P.sT + n - 2));
    $('#mChance').textContent = Math.round(pm * 100) + '%';
    $('#sChance').textContent = Math.round(ps * 100) + '%';
    const st = P.stats;
    $('#statsBox').innerHTML = [['Rounds', st.rounds], ['Wins', st.wins], ['Kills', st.kills], ['Deaths', st.deaths], ['Coins earned', st.coins], ['Unboxed', st.unboxed], ['Trades', st.trades]].map(([a, b]) => `<div><b>${b}</b>${a}</div>`).join('');
  } else if (curTab === 'inv') {
    $('#eqKnife').innerHTML = itemCard(ITEM[equippedId('knife')], { noval: true });
    $('#eqGun').innerHTML = itemCard(ITEM[equippedId('gun')], { noval: true });
    $('#invCount').textContent = `(${P.inv.length})`;
    const inv = sortedInv();
    $('#invGrid').innerHTML = inv.length ? inv.map(i => itemCard(ITEM[i.id], { eq: P.equip[ITEM[i.id].type] === i.u, attr: `data-u="${i.u}"` })).join('') : '<div class="muted">No items yet. Go unbox some in the Shop 📦</div>';
    $('#invGrid').querySelectorAll('.item').forEach(el => el.onclick = () => { tone(800, .06); net({ t: 'equip', u: +el.dataset.u }); });
  } else if (curTab === 'shop') {
    $('#crates').innerHTML = CRATES.map(c => `<div class="crate"><div class="box">${c.icon}</div><h3>${c.name}</h3><p>${c.desc}</p><button class="btn" data-c="${c.id}" ${P.coins < c.price ? 'disabled' : ''}>💰 ${c.price}</button></div>`).join('');
    $('#crates').querySelectorAll('button').forEach(b => b.onclick = () => { if (unboxPending) return; unboxPending = true; net({ t: 'crate', id: b.dataset.c }); });
    const w = CRATES[0].w, tot = Object.values(w).reduce((a, b) => a + b, 0);
    $('#rates').innerHTML = RORDER.map(r => `<span style="color:${rarColor(r)}">${r} ${(w[r] / tot * 100).toFixed(1)}%</span>`).join('') + '<span class="muted">(Knife/Gun Box)</span>';
  } else if (curTab === 'trade') renderTrade();
}

// ---------- crates (the server rolls; we just animate the result) ----------
let unboxPending = false;
function playUnbox(crateId, winId) {
  unboxPending = false;
  const c = CRATES.find(x => x.id === crateId) || CRATES[0], win = ITEM[winId];
  const N = 45, WIN = 38, cards = [];
  for (let i = 0; i < N; i++) cards.push(i === WIN ? win : Sim.rollItem(c.w, c.type));
  const reel = $('#reel');
  reel.style.transition = 'none'; reel.style.transform = 'translateX(0)';
  reel.innerHTML = cards.map(it => itemCard(it, { noval: true })).join('');
  $('#unboxRes').textContent = ''; show('#unboxBtn', false); show('#unbox');
  const wrapW = $('.reelwrap').clientWidth, step = 108;
  const target = WIN * step + 50 - wrapW / 2 + rand(-35, 35);
  let ticks = 0; const tickI = setInterval(() => { SFX.roll(); if (++ticks > 30) clearInterval(tickI); }, 130);
  requestAnimationFrame(() => requestAnimationFrame(() => { reel.style.transition = 'transform 4.5s cubic-bezier(.12,.8,.2,1)'; reel.style.transform = `translateX(${-target}px)`; }));
  setTimeout(() => {
    clearInterval(tickI);
    const big = RORDER.indexOf(win.r) >= 4;
    $('#unboxRes').innerHTML = `${big ? '🔥 ' : ''}You unboxed <span style="color:${rarColor(win.r)}">${esc(win.name)}</span> (${win.r})!${big ? ' 🔥' : ''}`;
    big ? SFX.win() : tone(880, .2, 'triangle', .06);
    show('#unboxBtn');
  }, 4700);
}
$('#codeForm').onsubmit = e => {
  e.preventDefault();
  const code = $('#redeemInput').value.trim(); if (!code || unboxPending) return;
  unboxPending = true; net({ t: 'redeem', code }); $('#redeemInput').value = '';
};
$('#unboxBtn').onclick = () => { show('#unbox', false); renderLobby(); };

// ---------- trading ----------
let curTrader = 0, offMine = [], offTheirs = [];
const val = arr => arr.reduce((s, it) => s + ITEM[it.id].val, 0);
function renderTrade() {
  if (!traders.length) return;
  curTrader = Math.min(curTrader, traders.length - 1);
  const tr = traders[curTrader];
  // drop anything from the offer that no longer exists
  offMine = offMine.filter(o => P.inv.some(i => i.u === o.u)); offTheirs = offTheirs.filter(o => tr.inv.some(i => i.u === o.u));
  $('#traderTabs').innerHTML = traders.map((t, i) => `<button class="${i === curTrader ? 'active' : ''}" data-i="${i}">${esc(t.name)}</button>`).join('');
  $('#traderTabs').querySelectorAll('button').forEach(b => b.onclick = () => { curTrader = +b.dataset.i; offMine = []; offTheirs = []; $('#tradeChat').textContent = ''; renderTrade(); });
  $('#traderName').textContent = `${tr.name}'s items`;
  const mine = sortedInv(), selM = new Set(offMine.map(i => i.u)), selT = new Set(offTheirs.map(i => i.u));
  $('#trMine').innerHTML = mine.length ? mine.map(i => itemCard(ITEM[i.id], { sel: selM.has(i.u), attr: `data-u="${i.u}"` })).join('') : '<div class="muted">Nothing to trade yet</div>';
  $('#trTheirs').innerHTML = tr.inv.map(i => itemCard(ITEM[i.id], { sel: selT.has(i.u), attr: `data-u="${i.u}"` })).join('');
  $('#offMine').innerHTML = offMine.map(i => itemCard(ITEM[i.id], { attr: `data-u="${i.u}"` })).join('');
  $('#offTheirs').innerHTML = offTheirs.map(i => itemCard(ITEM[i.id], { attr: `data-u="${i.u}"` })).join('');
  const toggle = (list, inst) => { if (!inst) return; const k = list.findIndex(x => x.u === inst.u); if (k >= 0) list.splice(k, 1); else if (list.length < 4) list.push(inst); tone(700, .04); renderTrade(); };
  $('#trMine').querySelectorAll('.item').forEach(el => el.onclick = () => toggle(offMine, P.inv.find(i => i.u === +el.dataset.u)));
  $('#offMine').querySelectorAll('.item').forEach(el => el.onclick = () => toggle(offMine, offMine.find(i => i.u === +el.dataset.u)));
  $('#trTheirs').querySelectorAll('.item').forEach(el => el.onclick = () => toggle(offTheirs, tr.inv.find(i => i.u === +el.dataset.u)));
  $('#offTheirs').querySelectorAll('.item').forEach(el => el.onclick = () => toggle(offTheirs, offTheirs.find(i => i.u === +el.dataset.u)));
  const mv = val(offMine), tv = val(offTheirs);
  $('#myVal').textContent = `(value ${mv})`; $('#theirVal').textContent = `(value ${tv})`;
  const wfl = $('#wfl');
  if (!mv && !tv) wfl.textContent = '';
  else { const r = tv / Math.max(1, mv); wfl.textContent = r > 1.1 ? 'W 🟢' : r < .9 ? 'L 🔴' : 'FAIR 🟡'; wfl.style.color = r > 1.1 ? '#5bd46a' : r < .9 ? '#ff4d5e' : '#ffc233'; }
  $('#sendTrade').disabled = !offMine.length && !offTheirs.length;
}
$('#sendTrade').onclick = () => net({ t: 'trade', trader: curTrader, mine: offMine.map(i => i.u), theirs: offTheirs.map(i => i.u) });
$('#refreshTraders').onclick = () => { $('#tradeChat').textContent = ''; net({ t: 'traders', refresh: true }); };

// ===================== Loop =====================
let last = performance.now();
function frame(t) {
  const dt = Math.min(.05, (t - last) / 1000); last = t;
  if (V) update(dt);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
boot();
