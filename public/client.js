'use strict';
// Browser client: sign-in, lobby UI, rendering. Online rounds are run by the server;
// practice rounds run the same shared simulation (Sim) locally.
const $ = s => document.querySelector(s);
const cv = $('#game'), ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1;
let Z = 1; // world zoom: phones zoom out a bit so you can see more of the map
function resize() {
  DPR = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
  Z = Math.max(.55, Math.min(1, Math.min(W, H) / 720));
  if (typeof R3 !== 'undefined' && R3.ok) R3.resize(W, H); // after W/H are updated, so the 3D view never keeps a stale (or 0x0) size
  cv.width = W * DPR; cv.height = H * DPR; cv.style.width = W + 'px'; cv.style.height = H + 'px';
}
// 3D view (render3d.js). Falls back to the 2D canvas if WebGL or three.js isn't available.
const R3 = typeof R3D !== 'undefined' ? R3D : { ok: false };
// 'ultra' (shadows, lights, particles) on computers, plain '3d' on phones, or '2d'
const coarse = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
let viewPref = (() => { try { return localStorage.getItem('mm_view') || (coarse ? '3d' : 'ultra'); } catch (e) { return coarse ? '3d' : 'ultra'; } })();
const use3D = () => R3.ok && viewPref !== '2d';
const fancy = () => viewPref === 'ultra';
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches; // no screen shake for people who turned motion off
if (R3.ok && R3.setQuality) R3.setQuality(viewPref);
addEventListener('resize', resize); resize();

const { ITEM, RAR, RORDER, CRATES, TILE, BAG_MAX } = Sim;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const isLaser = it => !!it && (it.sound === 'ray' || it.sound === 'void');
const itemColor = (it, t = performance.now() / 1000) => it.col === 'chroma' ? `hsl(${(t * 140) % 360},95%,62%)` : it.col;
const rarColor = r => r === 'Chroma' ? '#fff' : RAR[r].c;
const show = (sel, on = true) => $(sel).classList.toggle('hide', !on);
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };

// ===================== Audio =====================
let AC = null, bus = null; // bus: where sounds go (a panner for sounds that happen somewhere on the map)
function ac() { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); return AC; }
function tone(f, d = .1, type = 'square', vol = .05, slide = 0, at = 0, dest = null) {
  try {
    ac();
    const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime + at;
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g).connect(dest || bus || AC.destination); o.start(t); o.stop(t + d);
  } catch (e) { }
}
function noise(d = .15, vol = .15, at = 0, dest = null, hp = 0) {
  try {
    ac();
    const n = AC.sampleRate * d, b = AC.createBuffer(1, n, AC.sampleRate), ch = b.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
    const s = AC.createBufferSource(), g = AC.createGain(); g.gain.value = vol; s.buffer = b;
    let out = s; if (hp) { const f = AC.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; s.connect(f); out = f; }
    out.connect(g).connect(dest || bus || AC.destination); s.start(AC.currentTime + at);
  } catch (e) { }
}
// play a sound from a spot on the map: quieter far away, panned left/right
function spatial(x, y, fn) {
  if (!V) return fn();
  const dx = x - V.cam.x, dy = y - V.cam.y, d = Math.hypot(dx, dy);
  if (d > 1100) return;
  try {
    ac(); const g = AC.createGain(); g.gain.value = Math.max(.12, 1 - d / 1100);
    if (AC.createStereoPanner) { const p = AC.createStereoPanner(); p.pan.value = clamp(dx / 600, -.85, .85); g.connect(p).connect(AC.destination); } else g.connect(AC.destination);
    const o = bus; bus = g; try { fn(); } finally { bus = o; }
  } catch (e) { fn(); }
}
const SFX = {
  coin: () => { tone(1200, .08, 'square', .03, 600); tone(1800, .1, 'sine', .02, 400, .05); },
  stab: () => { noise(.08, .12); tone(300, .1, 'sawtooth', .04, -200); },
  jump: () => tone(420, .12, 'square', .03, 380),
  land: () => { noise(.06, .08); tone(90, .08, 'sine', .06, -30); },
  whoosh: () => { noise(.18, .18, 0, null, 900); tone(900, .16, 'sine', .03, -700); },
  boom: () => { noise(.5, .4); tone(110, .5, 'sawtooth', .07, -70); tone(55, .6, 'sine', .14, -25); tone(620, .25, 'triangle', .04, 500, .06); },
  shoot: () => { noise(.25, .3); tone(160, .15, 'square', .05, -100); tone(60, .22, 'sine', .12, -30); noise(.4, .05, .06, null, 2000); },
  // Raygun: sci-fi pew (fast downward sweep + a sparkly overtone)
  ray: () => { tone(1800, .22, 'sawtooth', .045, -1500); tone(2600, .12, 'sine', .03, -2000); tone(900, .08, 'square', .02, 400, .06); },
  // Void Scope: a deep warping laser with a sub-bass thump and a sparkly tail
  void: () => { tone(1500, .3, 'sawtooth', .04, -1250); tone(95, .38, 'sine', .15, -45); tone(3000, .16, 'triangle', .02, -2600, .02); noise(.22, .07, 0, null, 3500); tone(220, .25, 'square', .018, 440, .08); },
  // its reload (1.2 s): click, charge-up whine, clack, ready ping. Quick, but you hear every step
  voidReload: () => { noise(.03, .14, .3, null, 2500); tone(1800, .03, 'square', .03, 0, .3); tone(260, .32, 'sawtooth', .025, 900, .45); noise(.04, .16, .85, null, 1800); tone(950, .05, 'square', .04, 0, .85); tone(1650, .09, 'sine', .035, 0, .98); },
  evolve: () => { [262, 330, 392, 523, 659, 784].forEach((f, i) => tone(f, .25, 'sawtooth', .035, 0, i * .08)); tone(60, 1, 'sine', .15, 60, .45); noise(.6, .12, .45, null, 1200); },
  throw: () => tone(700, .2, 'triangle', .05, -500),
  die: () => tone(400, .4, 'sawtooth', .05, -330),
  // murderer kill: blade swish + thud + a short scream-y drop
  kill: () => { noise(.12, .22); tone(260, .18, 'square', .06, -200); noise(.2, .18, .07); tone(90, .25, 'sine', .12, -40, .07); tone(900, .35, 'sawtooth', .035, -700, .04); },
  // extra sting only the killer hears
  killConfirm: () => { tone(1320, .09, 'square', .04); tone(1760, .14, 'square', .04, 0, .09); },
  gun: () => { tone(500, .12, 'square', .05); tone(750, .15, 'square', .05, 0, .11); },
  win: () => [523, 659, 784, 1046].forEach((f, i) => { tone(f, .18, 'square', .05, 0, i * .12); tone(f / 2, .22, 'triangle', .05, 0, i * .12); }),
  lose: () => [400, 330, 260].forEach((f, i) => tone(f, .25, 'triangle', .06, 0, i * .18)),
  roll: () => tone(900, .03, 'square', .02),
  heart: k => { tone(62, .12, 'sine', .16 + k * .12, -18); tone(56, .14, 'sine', .12 + k * .1, -16, .16); },
  tick: () => tone(1500, .04, 'square', .025),
  spin: i => tone(500 + i * 40, .04, 'square', .025),
  // role reveal stingers
  reveal: role => role === 'murderer' ? (tone(98, .9, 'sawtooth', .07, -40), tone(147, .9, 'sawtooth', .04, -60), noise(.5, .12))
    : role === 'sheriff' ? [392, 523, 659, 784].forEach((f, i) => tone(f, .2, 'square', .045, 0, i * .08))
    : [523, 659, 784].forEach((f, i) => tone(f, .18, 'triangle', .06, 0, i * .09)),
  streak: n => [0, 1, 2, 3].slice(0, Math.min(4, n)).forEach(i => tone(660 * Math.pow(1.26, i + n - 2), .16, 'square', .045, 0, i * .07)),
  go: () => { tone(880, .12, 'square', .05); tone(1320, .3, 'square', .05, 0, .12); },
};

// ===================== Music =====================
// A small synth loop that gets faster and heavier as the round gets tense. Off with the 🎵 switch.
const Music = (() => {
  let on = lsGetSafe('mm_music') !== '0', gain = null, timer = 0, next = 0, step = 0, level = 0;
  const bassNotes = [110, 87.31, 98, 82.41]; // A, F, G, E
  const chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7], [164.8, 207.7, 246.9]];
  function tick() {
    if (!AC || !gain) return;
    const bpm = 92 + level * 44, sp = 60 / bpm / 4; // 16th notes
    while (next < AC.currentTime + .15) {
      const at = next - AC.currentTime, bar = Math.floor(step / 16) % 4, i = step % 16;
      if (i % 2 === 0) tone(bassNotes[bar] * (i % 8 === 6 ? 2 : 1), sp * 1.8, 'triangle', .07, 0, at, gain);
      if (level > .15 && i % 4 === 0) tone(120, .12, 'sine', .22, -80, at, gain); // kick
      if (level > .35 && i % 4 === 2) noise(.04, .06, at, gain, 6000); // hats
      if (level > .6 && i % 2 === 1) tone(chords[bar][(i >> 1) % 3] * 2, sp * .9, 'square', .012, 0, at, gain); // arpeggio
      if (level > .85 && i === 8) noise(.12, .09, at, gain, 1500); // snare
      next += sp; step++;
    }
  }
  function start() {
    if (!on || timer) return;
    try { ac(); gain = AC.createGain(); gain.gain.value = .45; gain.connect(AC.destination); next = AC.currentTime + .05; step = 0; timer = setInterval(tick, 50); } catch (e) { }
  }
  function stop() {
    clearInterval(timer); timer = 0;
    if (gain) { const g = gain; gain = null; try { g.gain.setTargetAtTime(0, AC.currentTime, .3); setTimeout(() => g.disconnect(), 1500); } catch (e) { } }
  }
  return { start, stop, set level(v) { level = clamp(v, 0, 1); }, get on() { return on; }, toggle(v) { on = v; lsSetSafe('mm_music', v ? '1' : '0'); if (!v) stop(); } };
})();
function lsGetSafe(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSetSafe(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }

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
  // standalone build: everything runs in this browser (see public/local.js)
  if (window.LocalServer) { show('#logoutBtn', false); window.LocalServer.start(onMsg); return; }
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
function net(m) { if (window.LocalServer) window.LocalServer.send(m); else if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }

function onMsg(m) {
  switch (m.t) {
    case 'hello': P = m.p; traders = m.traders; if (!V) setScreen('lobby'); break;
    case 'needName': if (!V) openNameScreen(false); break;
    case 'account': {
      const a = $('#acctPill'); show('#acctPill');
      a.className = 'pill acct ' + m.state; a.title = m.note;
      a.innerHTML = m.state === 'cloud' ? `${m.avatar ? `<img src="${esc(m.avatar)}" alt="">` : ''}☁️ Saved` : m.state === 'local' ? '💾 This device' : '👤 Guest';
      if (m.state === 'cloud') { accountOn = true; toast(m.note, true); } else if (m.state === 'local') toast(m.note);
      break;
    }
    case 'board': boardRows = m.rows; if (screen === 'lobby' && curTab === 'trophies') renderBoard(); break;
    case 'profile': {
      const before = P && P.trophies ? new Set(P.trophies.filter(t => t.done).map(t => t.id)) : null;
      P = m.p;
      const fresh = before && P.trophies ? P.trophies.filter(t => t.done && !before.has(t.id)) : [];
      if (fresh.length) trophyPopup(fresh);
      if (screen === 'lobby') renderLobby(); break;
    }
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
    case 'codeAll': unboxPending = false; SFX.win(); toast(`Code redeemed: +${m.count} knives and guns you were missing 🔪🔫 You have every one now`, true); if (screen === 'lobby') renderLobby(); break;
    case 'codeItems': unboxPending = false; SFX.win(); toast(`${m.from === 'event' ? 'Unlocked' : m.from === 'bundle' ? 'Bought' : 'Code redeemed'}: ${m.items.map(id => ITEM[id].name).join(' + ')} 🔥`, true); if (screen === 'lobby') renderLobby(); break;
    case 'chat': addChat(m.name, m.text, m.sys); break;
    case 'codeAdmin': unboxPending = false; SFX.win(); toast('👑 You\'re an admin now: crown on your name and owner luck is on', true); if (screen === 'lobby') renderLobby(); break;
    case 'codeBulk': unboxPending = false; SFX.win(); toast(`Code redeemed: +${m.count.toLocaleString()} ${m.rarity}s 🔥🔥🔥`, true); if (screen === 'lobby') renderLobby(); break;
    case 'evolved': SFX.evolve(); toast(`🌌 EVOLVED! Your Void Gun is now the ${ITEM[m.item].name} 🔥`, true); if (screen === 'lobby') renderLobby(); break;
    case 'codeLuck': unboxPending = false; SFX.win(); toast('🍀 Owner luck on: 95% Death items from the Halloween Box 💀', true); if (screen === 'lobby') renderLobby(); break;
    case 'codeCoins': unboxPending = false; SFX.win(); toast(`Code redeemed: +${shortNum(m.coins)} coins 💰`, true); break;
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
let accountOn = false, boardRows = null;
// solo build only: rename yourself from the lobby (the online server sets the name once at sign-up)
function openNameScreen(cancel) {
  setScreen('name'); show('#nameCancel', cancel);
  $('#nameInput').value = P && P.name !== 'You' ? P.name : ''; $('#nameErr').textContent = ''; $('#nameInput').focus();
}
$('#nameCancel').onclick = () => setScreen('lobby');
$('#namePill').onclick = () => { if (window.LocalServer && !V) openNameScreen(true); };
if (window.LocalServer) { $('#namePill').title = 'Change your name'; $('#namePill').classList.add('click'); }
$('#acctPill').onclick = () => toast($('#acctPill').title);
function renderBoard() {
  show('#boardCard', !!boardRows);
  if (!boardRows) return;
  $('#board').innerHTML = boardRows.length ? `<div class="brow head"><span>#</span><span>Player</span><span>Kills</span><span>Wins</span><span>Lv</span></div>` + boardRows.map((r, i) =>
    `<div class="brow${r.me ? ' me' : ''}"><span>${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span><span class="bn">${esc(r.name || '???')}${r.me ? ' (you)' : ''}</span><span>${(r.kills | 0).toLocaleString()}</span><span>${(r.wins | 0).toLocaleString()}</span><span>${r.level | 0}</span></div>`).join('')
    : '<p class="muted">Nobody yet. Play a round to get on the board!</p>';
}
$('#nameForm').onsubmit = e => { e.preventDefault(); $('#nameErr').textContent = ''; net({ t: 'setName', name: $('#nameInput').value.trim() }); };
$('#logoutBtn').onclick = () => { wantOnline = false; disconnect(); P = null; if (fbAuth) fbAuth.signOut(); else setScreen('auth'); };

// ---------- rooms ----------
let lastRoom = null;
function onRoom(m) {
  lastRoom = m;
  if (m.state === 'waiting') {
    // stay on the results until the player clicks Continue
    if (V && !V.offline && V.endInfo) { $('#endNext').textContent = `Next round starts in ${m.timer}s`; return; }
    if (V && !V.offline) endGameView();
    setScreen('room');
    $('#roomTitle').textContent = m.mode === '1v1' ? '⚔️ 1v1 room' : m.private ? 'Private room' : 'Public match';
    show('#roomCode', m.private); $('#roomCode').textContent = m.code;
    $('#roomTimer').textContent = `Round starts in ${m.timer}s`;
    $('#roomPlayers').innerHTML = m.players.map(n => `<span>${esc(n)}</span>`).join('');
  }
  if (V && !V.offline) V.roomCode = m.code;
}
$('#quickBtn').onclick = () => net({ t: 'quickplay' });
$('#privBtn').onclick = () => net({ t: 'createPrivate' });
$('#duelBtn').onclick = () => net({ t: 'create1v1' });
$('#joinForm').onsubmit = e => { e.preventDefault(); const c = $('#codeInput').value.trim(); if (c) net({ t: 'joinCode', code: c }); };
$('#leaveRoomBtn').onclick = () => net({ t: 'leave' });

// ===================== Game view =====================
// V holds what this client knows about the current round (never other players' roles).
let V = null;
let keys = {}, mouse = { x: 0, y: 0, wx: 0, wy: 0, down: false };
let thrSeq = 0, togSeq = 0, jpSeq = 0, bjSeq = 0, djSeq = 0, dashT = 0, dashCd = 0, dashA = 0, crouchTouch = false, sendT = 0;

function newView(mapIdx, roster, you, offline) {
  V = {
    offline, M: Sim.buildMap(mapIdx), roster: new Map(roster.map(r => [r.id, r])), you,
    disp: new Map(), snap: null, snapT: 0, lp: null, fx: [], cam: { x: 0, y: 0 }, spec: null, phase: 'intro',
    me: null, endInfo: null, endShownAt: 0, reward: null, introShown: false, R: null,
    // eye candy
    shake: 0, shakeX: 0, shakeY: 0, zoom: 1, decals: [], pops: [], danger: 0, hbT: 0, hurt: 0, hitT: 0, streak: 0, streakT: 0, cine: null, lastBlood: null, lastSec: -1, slow: 1,
  };
  $('#msgs').innerHTML = ''; $('#chatLog').innerHTML = ''; $('#feed').innerHTML = ''; $('#banner').className = ''; closeChat(); hudCache = {};
  document.body.classList.remove('dead'); Music.level = 0; Music.start();
  show('#lobby', false); show('#roomScreen', false); show('#endScreen', false); show('#hud');
  screen = 'game';
}
function startOnlineView(m) {
  newView(m.map, m.roster, m.you, false);
  if (m.you === null) msg('Round in progress. You\'ll join the next one 👀', '#fff', 5);
}
function startPractice(mode) {
  const R = Sim.createRound({ mode, mapIdx: +$('#mapSel').value, players: [{ pid: 'me', name: P ? P.name : 'You', knife: equippedId('knife'), gun: equippedId('gun'), mT: 1, sT: 1 }] });
  newView(R.mapIdx, Sim.roster(R), R.ents[0].id, true);
  V.R = R;
  applySnap(Sim.snapshotFor(R, V.you));
}
function endGameView() {
  V = null; mouse.down = false; dashT = dashCd = 0;
  Music.stop(); document.body.classList.remove('dead'); clearTimeout(introJob);
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
  for (const [id, x, y, a, al, w, sw, z, cr] of s.e) {
    let d = V.disp.get(id);
    if (!d) { d = { x, y, a, walk: 0 }; V.disp.set(id, d); }
    d.tx = x; d.ty = y; d.ta = a; d.alive = !!al; d.w = w; d.sw = sw; d.z = z || 0; d.cr = !!cr;
    if (id === V.you && V.lp) V.lp.z = d.z; // so our own prediction hops over tables like the server does
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
  // MM2-style roulette: the role names flick past, slow down, and slam onto yours
  const roles = [['INNOCENT', '#5bd46a'], ['SHERIFF', '#4da3ff'], ['MURDERER', '#ff4d5e']];
  const el = $('#introRole'), intro = $('#intro'), view = V, myRole = V.me.role;
  $('#introSub').textContent = ''; intro.className = 'spin'; intro.style.setProperty('--rc', '#ffffff');
  let i = 0, wait = 55;
  const flick = () => {
    if (V !== view) return;
    if (wait > 260) {
      el.textContent = R[0]; el.style.color = R[1]; $('#introSub').textContent = R[2];
      intro.style.setProperty('--rc', R[1]); intro.className = 'landed ' + myRole;
      SFX.reveal(myRole); addShake(myRole === 'murderer' ? 14 : 8);
      return;
    }
    const [n, c] = roles[i++ % 3]; el.textContent = n; el.style.color = c; SFX.spin(i % 6);
    wait *= 1.17; introJob = setTimeout(flick, wait);
  };
  clearTimeout(introJob); flick();
  show('#intro');
}
let introJob = 0;
const nameOf = id => id === V.you ? 'You' : (V.roster.get(id) || {}).name || 'Someone';
function msg(text, color = '#fff', dur = 3.5) {
  const d = document.createElement('div'); d.textContent = text; d.style.color = color;
  $('#msgs').appendChild(d);
  setTimeout(() => d.style.opacity = 0, dur * 1000); setTimeout(() => d.remove(), dur * 1000 + 600);
  while ($('#msgs').children.length > 4) $('#msgs').firstChild.remove();
}
// ---------- juice ----------
function addShake(a, x, y, range = 600) {
  if (!V || calm) return;
  if (x !== undefined) { const d = Math.hypot(x - V.cam.x, y - V.cam.y); a *= Math.max(0, 1 - d / range); }
  V.shake = Math.min(26, V.shake + a);
}
let bannerT = 0;
function banner(main, sub = '', color = '#fff', big = false) {
  const b = $('#banner');
  b.innerHTML = `<div class="b1" style="color:${color}">${esc(main)}</div>${sub ? `<div class="b2">${esc(sub)}</div>` : ''}`;
  b.className = ''; void b.offsetWidth; b.className = 'show' + (big ? ' big' : '');
  clearTimeout(bannerT); bannerT = setTimeout(() => { b.className = ''; }, big ? 2600 : 1700);
}
function feed(html) {
  const f = $('#feed'), d = document.createElement('div'); d.innerHTML = html; f.prepend(d);
  while (f.children.length > 5) f.lastChild.remove();
  setTimeout(() => d.classList.add('out'), 5000); setTimeout(() => d.remove(), 5600);
}
function pop(x, y, text, color = '#ffd43b') { if (V) V.pops.push({ x, y, text, color, t: 1 }); }
const STREAKS = ['', '', 'DOUBLE KILL', 'TRIPLE KILL', 'QUAD KILL', 'RAMPAGE', 'UNSTOPPABLE', 'GODLIKE'];
function embers(x, y, n, colors, speed = 260) {
  if (!fancy()) return;
  for (let i = 0; i < n; i++) { const a = rand(0, 6.28), v = rand(.3, 1) * speed; V.fx.push({ type: 'ember', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, z: rand(.1, .6), vz: rand(1, 4), t: rand(.4, .9), c: colors[i % colors.length] }); }
}
function handleEvent(ev) {
  if (!V) return;
  switch (ev.t) {
    case 'start':
      show('#intro', false);
      banner('GO!', '', '#fff'); SFX.go();
      if (V.me) msg(V.me.role === 'murderer' ? 'You have your knife. Happy hunting 😈' : V.me.role === 'sheriff' ? 'You have the gun. Find the murderer 👀' : 'Round started. Stay alive!', '#fff', 3);
      break;
    case 'sfx': if (SFX[ev.s]) spatial(ev.x, ev.y, SFX[ev.s]); break;
    case 'fx':
      if (ev.k === 'blood') {
        for (let i = 0; i < 18; i++) V.fx.push({ type: 'blood', x: ev.x, y: ev.y, vx: rand(-150, 150), vy: rand(-150, 150), t: rand(.3, .7) });
        for (let i = 0; i < 3; i++) V.decals.push({ x: ev.x + rand(-14, 14), y: ev.y + rand(-14, 14), r: rand(.35, .8), a: rand(0, 6.28) });
        if (V.decals.length > 60) V.decals.splice(0, V.decals.length - 60);
        V.lastBlood = { x: ev.x, y: ev.y, at: performance.now() };
        addShake(6, ev.x, ev.y, 500);
      }
      else if (ev.k === 'stuck') V.fx.push({ type: 'stuck', x: ev.x, y: ev.y, ang: ev.a, skin: ev.skin, t: 1.2 });
      else if (ev.k === 'flash') {
        V.fx.push({ type: 'flash', x: ev.x, y: ev.y, t: .08 });
        const mine = V.lp && Math.hypot(ev.x - V.lp.x, ev.y - V.lp.y) < 80;
        addShake(mine ? 7 : 3, ev.x, ev.y, mine ? 1e9 : 500);
        embers(ev.x, ev.y, 5, ['#ffe08a', '#ffb347'], 180);
      }
      else if (ev.k === 'dash') {
        V.fx.push({ type: 'dash', x: ev.x, y: ev.y, t: .35 });
        let best = null, bd = 60; for (const d of V.disp.values()) { const dd = Math.hypot(d.x - ev.x, d.y - ev.y); if (d.alive && dd < bd) { bd = dd; best = d; } }
        if (best) best.dashT = .26;
      }
      else if (ev.k === 'boom') {
        V.fx.push({ type: 'boom', x: ev.x, y: ev.y, t: .45 });
        addShake(16, ev.x, ev.y, 800);
        embers(ev.x, ev.y, 22, ['#ffb347', '#ff6a1a', '#ffe08a']);
      }
      break;
    case 'killConfirm': {
      SFX.killConfirm(); V.hitT = .35; addShake(5);
      const now = performance.now();
      V.streak = now - V.streakT < 5000 ? V.streak + 1 : 1; V.streakT = now;
      if (V.streak >= 2) { banner(STREAKS[Math.min(V.streak, STREAKS.length - 1)], `${ev.name} eliminated`, '#ff4d5e', true); SFX.streak(V.streak); }
      else banner('ELIMINATED', ev.name, '#ff4d5e');
      break;
    }
    case 'coin':
      SFX.coin(); if (V.lp) pop(V.lp.x, V.lp.y, '+1 💰');
      if (ev.full) { msg('Coin bag full! 💰', '#ffc233'); if (V.lp) pop(V.lp.x, V.lp.y - 20, 'BAG FULL!', '#ffc233'); }
      break;
    case 'kf': {
      const icon = ev.k === 'knife' ? '🔪' : ev.k === 'shot' ? '🔫' : ev.k === 'bad' ? '⚠️' : '💀';
      const who = ev.v === V.you ? '<b class="me">You</b>' : `<b>${esc(nameOf(ev.v))}</b>`;
      feed(`<span class="ic">${icon}</span> ${who} ${ev.k === 'knife' ? 'got stabbed' : ev.k === 'shot' ? 'got shot' : ev.k === 'bad' ? 'shot an innocent' : 'died'}`);
      break;
    }
    case 'gunDrop': msg('The Sheriff has been killed! The gun has dropped 🔫', '#4da3ff', 5); SFX.gun(); break;
    case 'gunTaken': msg('Someone picked up the gun...', '#fff', 4); break;
    case 'hero': msg('You picked up the gun! You are the HERO 🦸', '#ffc233', 4); SFX.gun(); break;
    case 'badShot': msg(`${nameOf(ev.id)} shot an innocent! 💀`, '#ff4d5e', 4); break;
    case 'died':
      V.hurt = 1; addShake(18); if (fancy()) document.body.classList.add('dead');
      msg(ev.how === 'badShot' ? 'You shot an innocent and died.' : ev.how === 'murdered' ? `You were killed by ${ev.by}!` : ev.how === 'shot' ? `${ev.by} shot you!` : 'You died.', '#ff4d5e', 5);
      break;
    case 'murdererDown':
      msg(`${ev.byId ? nameOf(ev.byId) : 'Someone'} killed the Murderer! 🎉`, '#5bd46a', 5);
      if (ev.byId === V.you) { banner('MURDERER DOWN', 'you saved everyone 🎯', '#4da3ff', true); SFX.streak(3); V.hitT = .35; }
      break;
    case 'end': onEnd(ev); break;
  }
}
function onEnd(info) {
  if (V.endInfo) return;
  V.endInfo = info; V.endAt = performance.now();
  Music.stop();
  // final kill cam: zoom in on the last death in slow motion
  if (V.lastBlood && V.endAt - V.lastBlood.at < 2500) { V.cine = { x: V.lastBlood.x, y: V.lastBlood.y, at: V.endAt }; banner(info.w === 'murderer' ? 'FINAL KILL' : 'MURDERER DOWN', '', info.w === 'murderer' ? '#ff4d5e' : '#5bd46a', true); }
  if (V.offline && window.LocalServer) window.LocalServer.result(V.R.results.find(r => r.pid === 'me'));
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
  if (V.offline) { if (!window.LocalServer) $('#endRewards').innerHTML = 'Practice round: no coins or XP.'; $('#endNext').textContent = ''; $('#endBtn').textContent = 'Back to lobby'; }
  else if (!V.me) { $('#endRewards').innerHTML = 'You were spectating this one.'; }
  else if (!V.reward) $('#endRewards').innerHTML = 'Counting your rewards…';
  if (!V.offline) { $('#endNext').textContent = 'Next round starts soon.'; $('#endBtn').textContent = 'Continue'; }
  if (V.reward) showReward(V.reward);
  const t = $('#endTitle'); t.classList.remove('slam'); void t.offsetWidth; t.classList.add('slam');
  $('#confetti').innerHTML = '';
  if (V.me && (info.w === 'murderer') === (startRoleOf(info) === 'murderer')) confetti();
  show('#endScreen');
}
function confetti() {
  const box = $('#confetti'), cols = ['#ff4d5e', '#ffc233', '#5bd46a', '#4da3ff', '#b36bff', '#ffffff'];
  let h = '';
  for (let i = 0; i < 70; i++) h += `<i style="left:${rand(0, 100).toFixed(1)}%;background:${cols[i % cols.length]};animation-delay:${rand(0, .8).toFixed(2)}s;animation-duration:${rand(2.2, 3.8).toFixed(2)}s;--dx:${rand(-80, 80).toFixed(0)}px;--r:${rand(360, 1080).toFixed(0)}deg"></i>`;
  box.innerHTML = h;
}
function showReward(r) {
  if (!V) return;
  V.reward = r;
  const evoLine = r.evo ? `<br><b style="color:#b388ff">🌌 Void Gun Evo +${r.evo}</b>` : '';
  $('#endRewards').innerHTML = evoLine + `${r.won ? '<b style="color:#5bd46a">You won!</b>' : '<b style="color:#ff4d5e">You lost</b>'}<br>💰 +${r.coins} coins · ⭐ +${r.xp} XP` + (r.kills ? ` · ☠️ ${r.kills} kill${r.kills > 1 ? 's' : ''}` : '') + (r.levelUps ? `<br><b style="color:#ffc233">LEVEL UP! You're level ${P ? P.level : ''} 🎉</b>` : '') + (P && P.events ? P.events.filter(e => !e.claimed).map(e => `<br>${e.icon} ${esc(e.name)}: ${e.kills} / ${e.goal} kills`).join('') : '');
}
$('#endBtn').onclick = () => {
  if (V && V.offline) { endGameView(); setScreen('lobby'); return; }
  endGameView();
  if (lastRoom && lastRoom.state === 'waiting') onRoom(lastRoom); else setScreen('room');
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
function update(rdt) {
  const me = V.me;
  // final kill cam: time slows right down, then comes back
  V.slow = V.cine ? clamp(.18 + (performance.now() - V.cine.at - 900) / 1500, .18, 1) : 1;
  const dt = rdt * V.slow;
  // offline: step the local simulation
  if (V.offline) {
    Sim.setInput(V.R, V.you, currentInput());
    Sim.step(V.R, dt);
    Sim.eventsFor(Sim.drain(V.R), V.you).forEach(handleEvent);
    applySnap(Sim.snapshotFor(V.R, V.you));
  }
  dashCd = Math.max(0, dashCd - dt);
  // own movement prediction
  if (me && me.alive && V.lp && V.phase === 'play') {
    let dx = 0, dy = 0;
    if (keys.KeyW || keys.ArrowUp) dy--; if (keys.KeyS || keys.ArrowDown) dy++;
    if (keys.KeyA || keys.ArrowLeft) dx--; if (keys.KeyD || keys.ArrowRight) dx++;
    if (joy.id !== null && (joy.dx || joy.dy)) { dx = joy.dx; dy = joy.dy; if (aimTouch === null) touchAim = Math.atan2(dy, dx); }
    const l = Math.max(1, Math.hypot(dx, dy));
    if (dashT > 0) { dashT -= dt; Sim.moveEnt(V.M, V.lp, Math.cos(dashA), Math.sin(dashA), dt, Sim.DASH_SPEED); }
    else Sim.moveEnt(V.M, V.lp, dx / l, dy / l, dt, me.spd || Sim.PLAYER_SPEED);
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
  for (let i = V.fx.length - 1; i >= 0; i--) {
    const f = V.fx[i]; f.t -= dt;
    if (f.vx) { const k = Math.pow(.02, dt); f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= k; f.vy *= k; }
    if (f.vz !== undefined) { f.z += f.vz * dt; f.vz -= 12 * dt; if (f.z < .03) { f.z = .03; f.vz *= -.4; } }
    if (f.t <= 0) V.fx.splice(i, 1);
  }
  juice(rdt, dt);
  if (V.endInfo && !V.endShown && performance.now() - V.endAt > (V.cine ? 2600 : 1400)) { V.endShown = true; showEnd(); }
  const f = focusEnt();
  let fx = f ? f.x : V.cam.x, fy = f ? f.y : V.cam.y;
  // look a little toward where you're aiming
  if (!isTouch && me && me.alive && V.lp && V.phase === 'play') { const ax = mouse.wx - V.lp.x, ay = mouse.wy - V.lp.y, al = Math.hypot(ax, ay) || 1, k = Math.min(70, al * .18); fx += ax / al * k; fy += ay / al * k; }
  if (V.cine) { fx = V.cine.x; fy = V.cine.y; }
  V.cam.x += (fx - V.cam.x) * Math.min(1, rdt * (V.cine ? 4 : 8)); V.cam.y += (fy - V.cam.y) * Math.min(1, rdt * (V.cine ? 4 : 8));
  V.zoom += ((V.cine ? .5 : 1) - V.zoom) * Math.min(1, rdt * 3);
  if (use3D()) { const p = R3.screenToWorld(mouse.x, mouse.y); if (p) { mouse.wx = p.x; mouse.wy = p.y; } }
  else { mouse.wx = (mouse.x - W / 2) / Z + V.cam.x; mouse.wy = (mouse.y - H / 2) / Z + V.cam.y; }
  updateHUD();
}
// footsteps, landings, the heartbeat when a knife is close, the last-seconds ticking, screen shake, music
function juice(rdt, dt) {
  const me = V.me, now = performance.now();
  V.shake *= Math.pow(.004, rdt); if (V.shake < .2) V.shake = 0;
  V.shakeX = (Math.random() * 2 - 1) * V.shake; V.shakeY = (Math.random() * 2 - 1) * V.shake;
  V.hurt = Math.max(0, V.hurt - rdt * 1.2); V.hitT = Math.max(0, V.hitT - rdt);
  for (let i = V.pops.length - 1; i >= 0; i--) { const p = V.pops[i]; p.t -= rdt * .9; p.y -= rdt * 40; if (p.t <= 0) V.pops.splice(i, 1); }
  let danger = 0;
  for (const [id, d] of V.disp) {
    if (d.dashT > 0) d.dashT -= dt;
    if (!d.alive) { d.pz = 0; continue; }
    const z = d.z || 0;
    if ((d.pz || 0) > .3 && z === 0) { V.fx.push({ type: 'land', x: d.x, y: d.y, t: .35 }); if (id === V.you) { addShake(3); SFX.land(); } }
    d.pz = z;
    const mv = d.px !== undefined ? Math.hypot(d.x - d.px, d.y - d.py) / Math.max(dt, 1e-3) : 0; d.px = d.x; d.py = d.y;
    if (fancy() && mv > 60 && !z) { d.stepT = (d.stepT || 0) - dt; if (d.stepT <= 0) { d.stepT = .24; V.fx.push({ type: 'step', x: d.x + rand(-5, 5), y: d.y + 10, t: .4 }); } }
    // a knife out near you, where you can see it → heartbeat
    if (me && me.alive && me.role !== 'murderer' && id !== V.you && d.w === 'k' && V.lp) {
      const dd = Math.hypot(d.x - V.lp.x, d.y - V.lp.y);
      if (dd < 420 && Sim.los(V.M, V.lp.x, V.lp.y, d.x, d.y)) danger = Math.max(danger, 1 - dd / 420);
    }
  }
  V.danger += (danger - V.danger) * Math.min(1, rdt * 6);
  V.hbT -= rdt;
  if (V.danger > .08 && V.hbT <= 0 && V.phase === 'play') { SFX.heart(V.danger); V.hbT = 1 - V.danger * .55; }
  // last 15 seconds: tick every second
  const s = V.snap, sec = s ? Math.ceil(s.tm) : -1;
  if (s && s.ph === 'play' && sec <= 15 && sec > 0 && sec !== V.lastSec) { V.lastSec = sec; SFX.tick(); }
  $('#timer').classList.toggle('low', !!(s && s.ph === 'play' && s.tm <= 30));
  // music gets heavier as people die, the clock runs out, or a knife gets close
  if (s) {
    const alive = s.e.filter(e => e[4]).length, total = Math.max(2, s.e.length);
    Music.level = s.ph !== 'play' ? .1 : (s.e.length === 2 ? .45 : .2) + (1 - alive / total) * .45 + (s.tm < 30 ? .3 : 0) + V.danger * .4;
  }
}
function myAngle() { if (touchAim !== null) return touchAim; return V.lp ? Math.atan2(mouse.wy - V.lp.y, mouse.wx - V.lp.x) : 0; }
function currentInput() {
  const lp = V.lp || { x: 0, y: 0 };
  return { x: Math.round(lp.x * 10) / 10, y: Math.round(lp.y * 10) / 10, a: +myAngle().toFixed(3), atk: mouse.down, thr: thrSeq, tog: togSeq, jp: jpSeq, bj: bjSeq, dj: djSeq, cr: !!(keys.KeyC || keys.ControlLeft || crouchTouch) };
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
  if (me && me.alive && me.role === 'murderer') cools = coolBar('Stab', 1 - me.atk / .5) + coolBar(isTouch ? 'Throw' : 'Throw (Q)', 1 - me.thr / 3);
  else if (me && me.alive && me.gun) { const gi = ITEM[(V.roster.get(V.you) || {}).gun] || {}; cools = coolBar(gi.sound === 'void' ? 'Reload' : 'Gun', 1 - me.atk / (gi.noCooldown ? .12 : gi.reload || 2.2)); }
  if (me && me.alive) cools += coolBar(isTouch ? '💨 Juke' : '💨 Juke (Shift)', 1 - Math.max(me.dash || 0, dashCd) / Sim.DASH_CD) + coolBar(isTouch ? '💣 Bomb' : '💣 Bomb (B)', 1 - (me.bomb || 0) / 5);
  setHTML('cools', cools);
  const hint = !me ? 'Spectating · click to switch' : !me.alive ? 'Click to switch spectate' : me.role === 'murderer' ? 'Click stab · Q/Right-click throw · E hide knife' : me.gun ? 'Click shoot · E put away gun' : 'Collect coins · Stay alive · Grab the gun if it drops';
  setText('hint', hint);
  if (isTouch) {
    const armed = me && me.alive && (me.role === 'murderer' || me.gun);
    show('#mbThrow', !!(me && me.alive && me.role === 'murderer')); show('#mbWeapon', !!armed);
    setText('mbWeapon', me && me.wo ? '✋ Hide' : me && me.role === 'murderer' ? '🔪 Knife' : '🔫 Gun');
  }
  const spectating = (!me || !me.alive) && V.spec;
  show('#spec', !!spectating); if (spectating) setText('spec', `👁️ Spectating ${nameOf(V.spec)}`);
}
const coolBar = (n, f) => { f = clamp(f, 0, 1); return `<div class="cool"><i style="transform:scaleX(${f.toFixed(2)});background:${f >= 1 ? '#5bd46a' : '#b36bff'}"></i><span>${n}${f >= 1 ? ' ✓' : ''}</span></div>`; };

// ===================== Render =====================
function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const three = use3D() && V && V.snap;
  if (R3.ok) R3.show(!!three);
  if (three) { ctx.clearRect(0, 0, W, H); render3D(); return; }
  ctx.fillStyle = '#0d0b12'; ctx.fillRect(0, 0, W, H);
  if (!V || !V.snap) return;
  const M = V.M, s = V.snap, Z0 = Z;
  Z = Z0 / (V.zoom || 1); // final kill cam zooms in
  const VW = W / Z, VH = H / Z; // how much of the world fits on screen
  const cx = V.cam.x - VW / 2 + V.shakeX * .6, cy = V.cam.y - VH / 2 + V.shakeY * .6, T = performance.now() / 1000;
  ctx.save(); ctx.scale(Z, Z); ctx.translate(-cx, -cy);
  const tx0 = Math.max(0, Math.floor(cx / TILE)), ty0 = Math.max(0, Math.floor(cy / TILE));
  const tx1 = Math.min(M.W - 1, Math.floor((cx + VW) / TILE)), ty1 = Math.min(M.H - 1, Math.floor((cy + VH) / TILE));
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
  for (const dc of V.decals) { ctx.fillStyle = 'rgba(120,0,16,.55)'; ctx.beginPath(); ctx.ellipse(dc.x, dc.y, dc.r * 30, dc.r * 22, dc.a, 0, 7); ctx.fill(); }
  for (const f of V.fx) {
    if (f.type === 'step') { const k = 1 - f.t / .4; ctx.fillStyle = `rgba(210,200,185,${.3 * (1 - k)})`; ctx.beginPath(); ctx.arc(f.x, f.y, 4 + k * 7, 0, 7); ctx.fill(); }
    if (f.type === 'land') { const k = 1 - f.t / .35; ctx.strokeStyle = `rgba(255,255,255,${.5 * (1 - k)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(f.x, f.y + 10, 10 + k * 26, 5 + k * 13, 0, 0, 7); ctx.stroke(); }
  }
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
    const ly = d.y - (d.z || 0) * 16; ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillText(lbl, d.x + 1, ly - 25);
    let nc = '#fff';
    if (endRoles && endRoles.get(id) === 'murderer') nc = '#ff4d5e';
    if (id === V.you && V.me) nc = roleColor(V.me.role);
    ctx.fillStyle = nc; ctx.fillText(lbl, d.x, ly - 26);
  }
  // projectiles, extrapolated from the last snapshot
  const age = Math.min(.1, (performance.now() - V.snapT) / 1000);
  for (const [k, x, y, vx, vy, skin] of s.p) {
    const px = x + vx * age, py = y + vy * age;
    if (k === 'k') drawKnife(px, py, T * 25, ITEM[skin] || ITEM.k0, T);
    else if (isLaser(ITEM[skin])) { const lc = itemColor(ITEM[skin], T); ctx.strokeStyle = lc; ctx.shadowColor = lc; ctx.shadowBlur = 12; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(px - vx * .035, py - vy * .035); ctx.lineTo(px, py); ctx.stroke(); ctx.shadowBlur = 0; }
    else { ctx.strokeStyle = '#fff6a0'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(px - vx * .02, py - vy * .02); ctx.lineTo(px, py); ctx.stroke(); }
  }
  for (const f of V.fx) {
    if (f.type === 'blood') { ctx.fillStyle = `rgba(200,0,20,${Math.min(1, f.t * 2)})`; ctx.fillRect(f.x - 2, f.y - 2, 4, 4); }
    if (f.type === 'dash') { const k = 1 - f.t / .35; ctx.fillStyle = `rgba(220,230,255,${.5 - k * .5})`; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(f.x + Math.cos(i * 1.3) * k * 26, f.y + Math.sin(i * 1.3) * k * 26, 9 - k * 6, 0, 7); ctx.fill(); } }
    if (f.type === 'boom') { const k = 1 - f.t / .45; ctx.strokeStyle = `rgba(255,140,30,${1 - k})`; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(f.x, f.y, 10 + k * 60, 0, 7); ctx.stroke(); ctx.fillStyle = `rgba(255,220,120,${.6 - k * .6})`; ctx.beginPath(); ctx.arc(f.x, f.y, 8 + k * 30, 0, 7); ctx.fill(); }
    if (f.type === 'flash') { ctx.fillStyle = 'rgba(255,240,150,.9)'; ctx.beginPath(); ctx.arc(f.x, f.y, 9, 0, 7); ctx.fill(); }
    if (f.type === 'ember') { ctx.fillStyle = f.c; ctx.globalAlpha = Math.min(1, f.t * 2); ctx.fillRect(f.x - 2, f.y - 2 - f.z * 16, 4, 4); ctx.globalAlpha = 1; }
  }
  ctx.restore();
  const Zs = Z; Z = Z0;
  drawScreenOverlay(V.me, s, (x, y) => ({ x: (x - cx) * Zs, y: (y - cy) * Zs }));
}
function render3D() {
  const s = V.snap, T = performance.now() / 1000, me = V.me;
  R3.draw(V, ITEM, T, me ? (me.wo ? (me.role === 'murderer' ? 'k' : 'g') : 0) : undefined);
  // name tags float above heads
  ctx.font = '600 13px Fredoka, sans-serif'; ctx.textAlign = 'center';
  const endRoles = V.endInfo ? new Map(V.endInfo.roles) : null;
  for (const [id, d] of V.disp) {
    if (!d.alive) continue;
    const p = R3.worldToScreen(d.x, d.y, 1.3 + (d.z || 0)); if (p.behind) continue;
    const r = V.roster.get(id) || {}, lbl = id === V.you ? 'You' : r.name;
    ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillText(lbl, p.x + 1, p.y + 1);
    let nc = '#fff';
    if (endRoles && endRoles.get(id) === 'murderer') nc = '#ff4d5e';
    if (id === V.you && me) nc = roleColor(me.role);
    ctx.fillStyle = nc; ctx.fillText(lbl, p.x, p.y);
  }
  drawScreenOverlay(me, s, (x, y) => R3.worldToScreen(x, y, .3));
}
// HUD bits drawn on the canvas: arrow to the dropped gun, vignette, joystick, crosshair
function drawScreenOverlay(me, s, toScreen) {
  if (s.g && me && me.alive && me.role === 'innocent') {
    const gp = toScreen(s.g.x, s.g.y), gx = gp.x, gy = gp.y;
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
  // knife close by: the edges pulse red with the heartbeat
  if (V.danger > .05) {
    const beat = Math.max(0, Math.sin(performance.now() / 1000 * Math.PI * 2 / Math.max(.45, 1 - V.danger * .55))) ** 4;
    const dv = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .3, W / 2, H / 2, Math.max(W, H) * .7);
    dv.addColorStop(0, 'rgba(255,0,30,0)'); dv.addColorStop(1, `rgba(200,0,30,${(.25 + beat * .35) * V.danger})`); ctx.fillStyle = dv; ctx.fillRect(0, 0, W, H);
  }
  if (V.hurt > 0) { ctx.fillStyle = `rgba(220,0,30,${V.hurt * .45})`; ctx.fillRect(0, 0, W, H); }
  // floating +1s
  ctx.textAlign = 'center';
  for (const p of V.pops) {
    const sp = toScreen(p.x, p.y); ctx.globalAlpha = Math.min(1, p.t * 2);
    ctx.font = `700 ${Math.round(16 + (1 - p.t) * 6)}px Fredoka, sans-serif`; ctx.fillStyle = '#000'; ctx.fillText(p.text, sp.x + 1, sp.y - 40 + 2); ctx.fillStyle = p.color; ctx.fillText(p.text, sp.x, sp.y - 40);
  }
  ctx.globalAlpha = 1;
  // cinematic bars for the final kill cam
  if (V.cine) { const k = clamp((performance.now() - V.cine.at) / 400, 0, 1), bh = H * .11 * k; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh); }
  if (joy.id !== null) {
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.arc(joy.ox, joy.oy, JOY_R, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.arc(joy.ox + joy.dx * JOY_R, joy.oy + joy.dy * JOY_R, 26, 0, 7); ctx.fill();
  }
  if (!isTouch && me && me.alive && (me.role === 'murderer' || me.gun) && V.phase === 'play') {
    const cool = me.atk > 0, g = cool ? 4 : 0; // the crosshair opens up while reloading
    ctx.strokeStyle = cool ? 'rgba(255,255,255,.45)' : 'rgba(255,255,255,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 8 + g, 0, 7);
    ctx.moveTo(mouse.x - 14 - g, mouse.y); ctx.lineTo(mouse.x - 5 - g, mouse.y); ctx.moveTo(mouse.x + 5 + g, mouse.y); ctx.lineTo(mouse.x + 14 + g, mouse.y); ctx.stroke();
    if (V.hitT > 0) { // hit marker
      const k = 6 + (1 - V.hitT / .35) * 6; ctx.strokeStyle = `rgba(255,60,80,${V.hitT / .35})`; ctx.lineWidth = 3; ctx.beginPath();
      ctx.moveTo(mouse.x - k - 6, mouse.y - k - 6); ctx.lineTo(mouse.x - k, mouse.y - k); ctx.moveTo(mouse.x + k + 6, mouse.y - k - 6); ctx.lineTo(mouse.x + k, mouse.y - k);
      ctx.moveTo(mouse.x - k - 6, mouse.y + k + 6); ctx.lineTo(mouse.x - k, mouse.y + k); ctx.moveTo(mouse.x + k + 6, mouse.y + k + 6); ctx.lineTo(mouse.x + k, mouse.y + k); ctx.stroke();
    }
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
  const bob = Math.sin(d.walk) * 1.5, z = d.z || 0, sc = (1 + z * .16) * (d.cr ? .82 : 1);
  ctx.fillStyle = `rgba(0,0,0,${.25 / (1 + z)})`; ctx.beginPath(); ctx.ellipse(d.x, d.y + 13, 14 / (1 + z * .3), 5 / (1 + z * .3), 0, 0, 7); ctx.fill();
  ctx.save(); ctx.translate(d.x, d.y + bob - z * 16); ctx.scale(sc, sc); ctx.rotate(d.a);
  if (w === 'k') {
    const sw = d.sw > 0 ? Math.sin((1 - d.sw / .2) * Math.PI) * 1.2 : 0;
    ctx.save(); ctx.rotate(.6 - sw); drawKnifeLocal(18, 0, 0, ITEM[r.knife] || ITEM.k0, T); ctx.restore();
  } else if (w === 'g') { const gi = ITEM[r.gun] || ITEM.g0; drawGunLocal(14, 6, itemColor(gi, T), gi.long); }
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
  const L = skin.long ? 36 : 20; // long blades for the Ginger Scope knives
  ctx.fillStyle = itemColor(skin, T); ctx.beginPath(); ctx.moveTo(1, -4); ctx.lineTo(L, -1); ctx.lineTo(L + 2, 1); ctx.lineTo(1, 4); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
}
function drawKnife(x, y, a, skin, T) { ctx.save(); ctx.translate(x, y); ctx.rotate(a); drawKnifeLocal(-8, 0, 0, skin, T); ctx.restore(); }
function drawGunLocal(x, y, col, long) {
  const dark = shade(col.startsWith('#') ? col : '#888888', -.4);
  if (long) {
    // sniper: long barrel, stock and a scope on top
    ctx.fillStyle = dark; ctx.fillRect(x - 6, y - 4, 12, 8);
    ctx.fillStyle = col; ctx.fillRect(x, y - 3, 44, 6);
    ctx.fillStyle = '#222'; ctx.fillRect(x + 10, y - 7, 16, 4);
    ctx.fillStyle = '#9ee8ff'; ctx.fillRect(x + 24, y - 7, 2, 4);
    ctx.fillStyle = dark; ctx.fillRect(x + 42, y - 2, 4, 4); ctx.fillRect(x + 4, y + 3, 5, 7);
    return;
  }
  ctx.fillStyle = col; ctx.fillRect(x, y - 3, 20, 6);
  ctx.fillStyle = dark; ctx.fillRect(x, y - 3, 6, 10);
}

// ===================== Chat =====================
function addChat(name, text, sys) {
  const d = document.createElement('div');
  if (sys) { d.className = 'sys'; d.textContent = text; }
  else { const b = document.createElement('b'); b.textContent = name + ': '; d.append(b, document.createTextNode(text)); }
  const log = $('#chatLog'); log.appendChild(d);
  while (log.children.length > 30) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}
function openChat(prefill) {
  keys = {}; mouse.down = false;
  show('#chatForm'); show('#chatHint', false);
  const i = $('#chatInput'); i.value = prefill; i.focus();
}
function closeChat() { show('#chatForm', false); show('#chatHint'); $('#chatInput').blur(); }
$('#chatForm').onsubmit = e => {
  e.preventDefault();
  const text = $('#chatInput').value.trim(); closeChat();
  if (!text || !V) return;
  if (V.offline) {
    // practice: cheats run right here
    if (text.startsWith('/')) addChat(null, Sim.cheat(V.R, V.you, text), true);
    else addChat(P ? P.name : 'You', text);
  } else net({ t: 'chat', text });
};
$('#chatInput').addEventListener('keydown', e => { if (e.key === 'Escape') closeChat(); });

// ===================== Input =====================
addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) return;
  if (V && (e.key === 'Enter' || e.key === '/')) { e.preventDefault(); openChat(e.key === '/' ? '/' : ''); return; }
  keys[e.code] = true;
  if (!V || V.phase !== 'play' || !V.me || !V.me.alive) return;
  if (e.code === 'KeyQ' && V.me.role === 'murderer') thrSeq++;
  if ((e.code === 'KeyE' || e.code === 'Digit1') && (V.me.role === 'murderer' || V.me.gun)) togSeq++;
  if (e.code === 'Space') { e.preventDefault(); jpSeq++; }
  if (e.code === 'KeyB') bjSeq++;
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) doJuke();
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

// ---------- touch controls ----------
// left side of the screen: joystick. Anywhere else: aim there (and attack while held).
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
document.body.classList.toggle('touch', isTouch);
const JOY_R = 60;
let joy = { id: null, ox: 0, oy: 0, dx: 0, dy: 0 }, aimTouch = null, touchAim = null;
function aimAt(x, y) {
  if (!V || !V.lp) return;
  let wx = (x - W / 2) / Z + V.cam.x, wy = (y - H / 2) / Z + V.cam.y;
  if (use3D()) { const p = R3.screenToWorld(x, y); if (!p) return; wx = p.x; wy = p.y; }
  touchAim = Math.atan2(wy - V.lp.y, wx - V.lp.x);
}
cv.addEventListener('touchstart', e => {
  e.preventDefault();
  if (!V) return;
  for (const t of e.changedTouches) {
    if (!V.me || !V.me.alive) { // spectating: tap to switch
      const alive = [...V.disp.entries()].filter(([, d]) => d.alive).map(([id]) => id);
      if (alive.length) V.spec = alive[(alive.indexOf(V.spec) + 1) % alive.length];
      continue;
    }
    if (joy.id === null && t.clientX < W * .45 && t.clientY > H * .35) joy = { id: t.identifier, ox: t.clientX, oy: t.clientY, dx: 0, dy: 0 };
    else if (aimTouch === null) {
      aimTouch = t.identifier; aimAt(t.clientX, t.clientY);
      if (V.me.role === 'murderer' || V.me.gun) mouse.down = true;
    }
  }
}, { passive: false });
cv.addEventListener('touchmove', e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === joy.id) {
      let dx = (t.clientX - joy.ox) / JOY_R, dy = (t.clientY - joy.oy) / JOY_R; const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      joy.dx = l < .15 ? 0 : dx; joy.dy = l < .15 ? 0 : dy;
    } else if (t.identifier === aimTouch) aimAt(t.clientX, t.clientY);
  }
}, { passive: false });
function touchEnd(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === joy.id) joy = { id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
    if (t.identifier === aimTouch) { aimTouch = null; mouse.down = false; }
  }
}
cv.addEventListener('touchend', touchEnd);
cv.addEventListener('touchcancel', touchEnd);
const tapBtn = (sel, fn) => $(sel).addEventListener('click', e => { e.preventDefault(); fn(); });
tapBtn('#mbThrow', () => { if (V && V.phase === 'play' && V.me && V.me.alive && V.me.role === 'murderer') thrSeq++; });
tapBtn('#mbWeapon', () => { if (V && V.phase === 'play' && V.me && V.me.alive && (V.me.role === 'murderer' || V.me.gun)) togSeq++; });
tapBtn('#mbChat', () => { if (V) openChat(''); });
tapBtn('#mbJump', () => { if (V && V.me && V.me.alive) jpSeq++; });
tapBtn('#mbDash', () => { if (V && V.me && V.me.alive) doJuke(); });
tapBtn('#mbBomb', () => { if (V && V.me && V.me.alive) bjSeq++; });
tapBtn('#mbCrouch', () => { crouchTouch = !crouchTouch; $('#mbCrouch').classList.toggle('on', crouchTouch); });

// ===================== Lobby UI =====================
// weapon pictures come from the 3D models (render3d.js); emoji until they're ready or if 3D isn't available
function itemIcon(it) {
  const url = R3.ok && R3.thumbCached ? R3.thumbCached(it.id) : null;
  if (url) return `<img class="thumb${it.col === 'chroma' ? ' chroma' : ''}" src="${url}" alt="">`;
  return `<span class="ic-emoji" ${R3.ok && R3.thumb && url === undefined ? `data-thumb="${esc(it.id)}"` : ''}>${it.type === 'knife' ? '🔪' : '🔫'}</span>`;
}
let thumbJob = 0;
function hydrateThumbs() {
  if (!R3.ok || !R3.thumb || thumbJob) return;
  const step = () => {
    const els = [...document.querySelectorAll('[data-thumb]')].slice(0, 6);
    if (!els.length) { thumbJob = 0; return; }
    for (const el of els) {
      const it = ITEM[el.dataset.thumb], url = it && R3.thumb(it);
      document.querySelectorAll(`[data-thumb="${CSS.escape(el.dataset.thumb)}"]`).forEach(e => {
        if (url) e.outerHTML = `<img class="thumb${it.col === 'chroma' ? ' chroma' : ''}" src="${url}" alt="">`; else e.removeAttribute('data-thumb');
      });
    }
    thumbJob = requestAnimationFrame(step);
  };
  thumbJob = requestAnimationFrame(step);
}
function itemCard(it, opts = {}) {
  const rc = rarColor(it.r);
  return `<div class="item ${it.r === 'Chroma' ? 'chroma' : ''} ${opts.eq ? 'eq' : ''} ${opts.sel ? 'sel' : ''}" style="border-color:${rc}" ${opts.attr || ''}>
    <div class="ic" style="${it.col === 'chroma' ? '' : `text-shadow:0 0 12px ${it.col}`}">${itemIcon(it)}</div>
    <div class="nm">${esc(it.name)}</div><div class="rr" style="color:${rc}">${it.r}</div>${it.noCooldown ? '<div class="fastTag">⚡ No cooldown</div>' : ''}${opts.noval ? '' : `<div class="vv">value ${it.val.toLocaleString()}</div>`}</div>`;
}
let curTab = 'play';
document.querySelectorAll('.tab').forEach(b => b.onclick = () => {
  curTab = b.dataset.tab;
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === b));
  document.querySelectorAll('.tabpage').forEach(x => x.classList.toggle('hide', x.id !== 'tab-' + curTab));
  renderLobby();
});
$('#mapSel').innerHTML = '<option value="-1">🎲 Random map</option>' + Sim.MAPS.map((m, i) => `<option value="${i}">${m.name}</option>`).join('');
$('#viewSel').value = !use3D() ? '2d' : viewPref;
if (!R3.ok) { $('#viewSel').innerHTML = '<option value="2d">2D</option>'; $('#viewSel').disabled = true; }
$('#viewSel').onchange = () => { viewPref = $('#viewSel').value; lsSet('mm_view', viewPref); if (R3.ok && R3.setQuality) R3.setQuality(viewPref); };
$('#musicChk').checked = Music.on;
$('#musicChk').onchange = () => Music.toggle($('#musicChk').checked);
$('#practiceBtn').onclick = () => { tone(600, .1); startPractice(); };
$('#duelPracticeBtn').onclick = () => { tone(600, .1); startPractice('1v1'); };

// 1,234 → "1,234", 12,345,678 → "12.3M", 1e56 → "100Spd": keeps giant balances inside the coin pill
const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'Ud', 'Dd', 'Td', 'Qad', 'Qid', 'Sxd', 'Spd', 'Ocd', 'Nod', 'Vg'];
function shortNum(n) {
  if (n < 1e6) return Math.floor(n).toLocaleString();
  const tier = Math.min(SUFFIXES.length - 1, Math.floor(Math.log10(n) / 3));
  if (tier === SUFFIXES.length - 1 && n >= 1e66) return n.toExponential(1);
  const v = n / 10 ** (tier * 3);
  return (v >= 100 ? Math.floor(v) : +v.toFixed(1)) + SUFFIXES[tier];
}
function trophyPopup(list) {
  SFX.win();
  const t = list[0], more = list.length > 1 ? ` (+${list.length - 1} more)` : '';
  const it = ITEM[t.item];
  const text = `🏆 Trophy unlocked: ${t.icon} ${t.name}! You got ${it ? it.name + ' + ' : ''}${t.reward.toLocaleString()} coins${more}`;
  if (V) msg(text, '#ffc233', 5); else toast(text, true);
}
// ---------- inventory window ----------
let invCat = 'all';
const favs = new Set((() => { try { return JSON.parse(localStorage.getItem('mm_favs') || '[]'); } catch (e) { return []; } })());
function renderInventory() {
  // one card per skin (duplicates stack), defaults always there, equipped first
  const groups = new Map();
  for (const d of ['k0', 'g0']) groups.set(d, { id: d, uids: [] });
  for (const i of P.inv) { if (!groups.has(i.id)) groups.set(i.id, { id: i.id, uids: [] }); groups.get(i.id).uids.push(i.u); }
  const eqId = { knife: equippedId('knife'), gun: equippedId('gun') };
  const q = $('#invSearch').value.trim().toLowerCase();
  const list = [...groups.values()].map(g => ({ ...g, it: ITEM[g.id] })).filter(g => g.it && (
    invCat === 'all' || (invCat === 'fav' ? favs.has(g.id) : invCat === 'chroma' ? g.it.r === 'Chroma' : invCat === 'trophy' ? g.it.trophy : g.it.type === invCat)
  ) && (!q || g.it.name.toLowerCase().includes(q)));
  list.sort((a, b) => (eqId[b.it.type] === b.id) - (eqId[a.it.type] === a.id) || favs.has(b.id) - favs.has(a.id) || b.it.val - a.it.val);
  $('#invGrid').innerHTML = list.length ? list.map(g => {
    const it = g.it, eq = eqId[it.type] === g.id, rc = rarColor(it.r);
    return `<div class="wcard r-${it.r.toLowerCase()} ${eq ? 'eq' : ''}" data-id="${esc(g.id)}" role="button" tabindex="0" aria-label="${esc(it.name)}, ${it.r}${eq ? ', equipped' : ''}">
      <button class="star ${favs.has(g.id) ? 'on' : ''}" data-fav="${esc(g.id)}" aria-label="Favorite" type="button">★</button>
      ${eq ? '<span class="eqtag">Equipped <i>✓</i></span>' : g.uids.length > 1 ? `<span class="cnt">x${g.uids.length}</span>` : ''}
      <div class="wimg">${itemIcon(it)}</div>
      <div class="wname">${esc(it.name)}</div><div class="wrar" style="color:${rc}">${it.r}${it.noCooldown ? ' · ⚡' : ''}${it.evo ? ' · 🌌 EVO' : it.evolved ? ' · 🌌 EVOLVED' : ''}</div></div>`;
  }).join('') : `<div class="invempty">${q ? 'Nothing matches that search.' : invCat === 'fav' ? 'Tap the ☆ on an item to favorite it.' : 'Nothing here yet. Open some boxes in the Shop 📦'}</div>`;
  $('#invGrid').querySelectorAll('.wcard').forEach(el => {
    const equip = () => {
      const id = el.dataset.id, it = ITEM[id]; tone(800, .06);
      if (id === 'k0' || id === 'g0') { if (P.equip[it.type] != null) net({ t: 'equip', u: P.equip[it.type] }); return; } // equipping the default = unequip the skin
      const g = groups.get(id); if (eqId[it.type] !== id) net({ t: 'equip', u: g.uids[0] });
    };
    el.onclick = e => { if (!e.target.closest('.star')) equip(); };
    el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); equip(); } };
  });
  $('#invGrid').querySelectorAll('.star').forEach(b => b.onclick = () => {
    const id = b.dataset.fav; favs.has(id) ? favs.delete(id) : favs.add(id);
    try { localStorage.setItem('mm_favs', JSON.stringify([...favs])); } catch (e) { }
    renderInventory();
  });
  // profile card
  $('#invAvatar').textContent = (P.name || '?')[0].toUpperCase();
  $('#invName').textContent = P.name; $('#invLvl').textContent = P.level;
  $('#invCoins').textContent = `💰 ${shortNum(P.coins)}`; $('#invCoins').title = `${P.coins.toLocaleString()} coins`;
  renderFeatured();
  hydrateThumbs();
}
// featured bundle on the right: rotates daily, with a countdown to the next rotation (UTC midnight)
function renderFeatured() {
  const bs = P.bundles || []; if (!bs.length) { $('#featured').innerHTML = ''; return; }
  const day = Math.floor(Date.now() / 864e5), b = bs.filter(x => !x.owned)[day % Math.max(1, bs.filter(x => !x.owned).length)] || bs[day % bs.length];
  const it = ITEM[b.items[0]], left = 864e5 - (Date.now() % 864e5), h = Math.floor(left / 36e5), m = Math.floor(left % 36e5 / 6e4);
  $('#featured').innerHTML = `<div class="ftimer">${h}h ${m}m</div><div class="fimg">${itemIcon(it)}</div>
    <div class="fname">${esc(b.name)}</div><div class="fexcl">Exclusive</div>
    <button class="rbx-btn green" id="featBuy" type="button" ${b.owned || P.coins < b.price ? 'disabled' : ''}>${b.owned ? 'Owned ✓' : `💰 ${shortNum(b.price)}`}</button>`;
  $('#featBuy').onclick = () => net({ t: 'buyBundle', id: b.id });
}
$('#invCats').querySelectorAll('button').forEach(b => b.onclick = () => {
  invCat = b.dataset.cat; $('#invCats').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); renderInventory();
});
$('#invSearch').addEventListener('input', () => renderInventory());
$('#invClose').onclick = () => document.querySelector('.tab[data-tab="play"]').click();
$('#invShopBtn').onclick = () => document.querySelector('.tab[data-tab="shop"]').click();
function sortedInv() { return P.inv.slice().sort((a, b) => ITEM[b.id].val - ITEM[a.id].val); }
function renderLobby() {
  if (!P) return;
  $('#namePill').textContent = (P.admin ? '👑 ' : '') + P.name;
  $('#coinPill').textContent = `💰 ${shortNum(P.coins)}`;
  $('#coinPill').title = `${P.coins.toLocaleString()} coins`;
  $('#lvlPill').textContent = `Lv ${P.level}`;
  $('#xpFill').style.width = (P.xp / P.xpNeed * 100) + '%';
  if (curTab === 'play') {
    $('#events').innerHTML = (P.events || []).map(ev => `<div class="card eventcard ${esc(ev.id)}">
      <div class="eventhead"><div><h2>${ev.icon} ${esc(ev.name)}</h2><p class="muted small">Get kills in any round and reach ${ev.goal} to unlock the rewards. ${esc(ev.desc || '')}</p></div>
      <div class="evrewards">${ev.rewards.map(id => itemCard(ITEM[id], { noval: true })).join('')}</div></div>
      <div class="evbar"><div class="evfill" style="width:${ev.kills / ev.goal * 100}%"></div><span class="evtext">${ev.claimed ? 'Claimed ✅' : `${ev.kills} / ${ev.goal} kills`}</span></div>
      <button class="btn" data-ev="${esc(ev.id)}" ${ev.claimed || ev.kills < ev.goal ? 'disabled' : ''}>${ev.claimed ? 'Claimed' : ev.kills >= ev.goal ? 'Claim rewards 🎁' : `${ev.goal - ev.kills} more kills`}</button></div>`).join('');
    $('#events').querySelectorAll('button[data-ev]').forEach(b => b.onclick = () => net({ t: 'claimEvent', id: b.dataset.ev }));
    // Evo: shows up once you own a Void Gun
    const evoInst = P.inv.find(i => ITEM[i.id] && ITEM[i.id].evo);
    if (evoInst && P.evo) {
      const from = ITEM[evoInst.id], to = ITEM[from.evo], ready = P.evo.xp >= P.evo.goal;
      $('#events').insertAdjacentHTML('afterbegin', `<div class="card eventcard evocard ${ready ? 'ready' : ''}">
        <div class="eventhead"><div><h2>🌌 ${esc(from.name)} Evo</h2><p class="muted small">Equip it and play: +2 per round, +5 per kill, +5 for a win. Fill the bar to evolve it into the <b>${esc(to.name)}</b>: void laser + a fast reload.</p></div>
        <div class="evrewards">${itemCard(from, { noval: true })}<div class="evoarrow">➜</div>${itemCard(to, { noval: true })}</div></div>
        <div class="evbar"><div class="evfill" style="width:${P.evo.xp / P.evo.goal * 100}%"></div><span class="evtext">${P.evo.xp} / ${P.evo.goal} Evo</span></div>
        <button class="btn" id="evolveBtn" ${ready ? '' : 'disabled'}>${ready ? 'EVOLVE 🌌' : `${P.evo.goal - P.evo.xp} more Evo points`}</button></div>`);
      $('#evolveBtn').onclick = () => net({ t: 'evolve', u: evoInst.u });
    }
    const n = Sim.MAX_PLAYERS, pm = P.mT / (P.mT + n - 1), ps = (1 - pm) * (P.sT / (P.sT + n - 2));
    $('#mChance').textContent = Math.round(pm * 100) + '%';
    $('#sChance').textContent = Math.round(ps * 100) + '%';
    const st = P.stats;
    $('#statsBox').innerHTML = [['Rounds', st.rounds], ['Wins', st.wins], ['Kills', st.kills], ['Deaths', st.deaths], ['Coins earned', st.coins], ['Unboxed', st.unboxed], ['Trades', st.trades]].map(([a, b]) => `<div><b>${b}</b>${a}</div>`).join('');
  } else if (curTab === 'inv') {
    renderInventory();
  } else if (curTab === 'shop') {
    $('#bundles').innerHTML = (P.bundles || []).map(b => `<div class="card bundle">
      <div class="evrewards">${b.items.map(id => itemCard(ITEM[id], { noval: true })).join('')}</div>
      <div class="binfo"><h3>${b.icon} ${esc(b.name)}</h3><p class="muted small">${esc(b.desc || '')}</p>
      <button class="btn" data-b="${esc(b.id)}" ${b.owned || P.coins < b.price ? 'disabled' : ''}>${b.owned ? 'Owned ✅' : `💰 ${b.price.toLocaleString()}`}</button></div></div>`).join('');
    $('#bundles').querySelectorAll('button[data-b]').forEach(btn => btn.onclick = () => net({ t: 'buyBundle', id: btn.dataset.b }));
    $('#crates').innerHTML = CRATES.map(c => `<div class="crate"><div class="box">${c.icon}</div><h3>${c.name}</h3><p>${P.luck && c.luckySpecials ? '🍀 Your luck: 95% Death Set or Chroma Death Set!' : c.desc}</p><button class="btn" data-c="${c.id}" ${P.coins < c.price ? 'disabled' : ''}>💰 ${c.price}</button></div>`).join('');
    hydrateThumbs();
    $('#crates').querySelectorAll('button').forEach(b => b.onclick = () => { if (unboxPending) return; unboxPending = true; net({ t: 'crate', id: b.dataset.c }); });
    const w = CRATES[0].w, tot = Object.values(w).reduce((a, b) => a + b, 0);
    $('#rates').innerHTML = RORDER.map(r => `<span style="color:${rarColor(r)}">${r} ${(w[r] / tot * 100).toFixed(1)}%</span>`).join('') + '<span class="muted">(Knife/Gun Box)</span>';
  } else if (curTab === 'trade') { renderTrade(); hydrateThumbs(); }
  else if (curTab === 'trophies') {
    const T = P.trophies || [];
    $('#trophyCount').textContent = `${T.filter(t => t.done).length} / ${T.length}`;
    $('#trophyGrid').innerHTML = T.map(t => `<div class="trophy ${t.done ? 'done' : ''}"><div class="ti">${t.icon}</div><b>${esc(t.name)}</b>
      <div class="td">${esc(t.desc)}</div><div class="tbar"><i style="width:${t.value / t.goal * 100}%"></i></div>
      <div class="tr">${t.done ? '✅ Unlocked' : `${shortNum(t.value)} / ${shortNum(t.goal)}`} · 💰 ${t.reward.toLocaleString()}</div>
      ${ITEM[t.item] ? `<div class="treward" style="border-color:${rarColor(ITEM[t.item].r)}">${ITEM[t.item].type === 'knife' ? '🔪' : '🔫'} <i class="tdot ${ITEM[t.item].col === 'chroma' ? 'chroma' : ''}" style="background:${ITEM[t.item].col === 'chroma' ? '' : ITEM[t.item].col}"></i><b>${esc(ITEM[t.item].name)}</b> <span style="color:${rarColor(ITEM[t.item].r)}">${ITEM[t.item].r}</span></div>` : ''}</div>`).join('');    renderBoard();
  }
}

// ---------- crates (the server rolls; we just animate the result) ----------
let unboxPending = false;
function playUnbox(crateId, winId) {
  unboxPending = false;
  const c = CRATES.find(x => x.id === crateId) || CRATES[0], win = ITEM[winId];
  const N = 45, WIN = 38, cards = [];
  for (let i = 0; i < N; i++) cards.push(i === WIN ? win : Sim.rollCrate(c, P && P.luck));
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
  $('#myVal').textContent = `(value ${mv.toLocaleString()})`; $('#theirVal').textContent = `(value ${tv.toLocaleString()})`;
  const wfl = $('#wfl');
  if (!mv && !tv) wfl.textContent = '';
  else { const r = tv / Math.max(1, mv); wfl.textContent = r > 1.1 ? 'W 🟢' : r < .9 ? 'L 🔴' : 'FAIR 🟡'; wfl.style.color = r > 1.1 ? '#5bd46a' : r < .9 ? '#ff4d5e' : '#ffc233'; }
  $('#sendTrade').disabled = !offMine.length && !offTheirs.length;
}
$('#sendTrade').onclick = () => net({ t: 'trade', trader: curTrader, mine: offMine.map(i => i.u), theirs: offTheirs.map(i => i.u) });
$('#refreshTraders').onclick = () => { $('#tradeChat').textContent = ''; net({ t: 'traders', refresh: true }); };

// 🤫 easter egg: tap the lobby logo 13 times fast to reveal the Raygun code
let logoTaps = 0, logoT = 0;
$('#lobby .logo').addEventListener('click', () => {
  clearTimeout(logoT); logoT = setTimeout(() => { logoTaps = 0; }, 2500);
  if (++logoTaps >= 13) { logoTaps = 0; SFX.win(); toast('🤫 You found it. Secret code: ZAPZAPBOOM13', true); }
  else if (logoTaps >= 10) tone(300 + logoTaps * 60, .08, 'square', .03);
});

// ===================== Loop =====================
let last = performance.now();
let renderFails = 0, updateFails = 0;
// 💨 juke: a quick dash where you're moving (or where you're aiming if you're standing still)
function doJuke() {
  const me = V && V.me;
  if (!me || !me.alive || V.phase !== 'play' || dashCd > 0 || (me.dash || 0) > 0) return;
  let dx = 0, dy = 0;
  if (keys.KeyW || keys.ArrowUp) dy--; if (keys.KeyS || keys.ArrowDown) dy++;
  if (keys.KeyA || keys.ArrowLeft) dx--; if (keys.KeyD || keys.ArrowRight) dx++;
  if (joy.id !== null && (joy.dx || joy.dy)) { dx = joy.dx; dy = joy.dy; }
  dashA = dx || dy ? Math.atan2(dy, dx) : myAngle();
  dashT = Sim.DASH_TIME; dashCd = Sim.DASH_CD; djSeq++;
}
function frame(t) {
  requestAnimationFrame(frame); // queue first so one bad frame can never freeze the game
  const dt = Math.min(.05, (t - last) / 1000); last = t;
  if (V) {
    try { update(dt); updateFails = 0; }
    catch (e) {
      console.error('update failed', e);
      // a broken round (e.g. one saved by an older version) should never leave a black screen
      if (++updateFails >= 3) { updateFails = 0; const off = V.offline; try { endGameView(); } catch (e2) { V = null; } if (!off) net({ t: 'leave' }); setScreen('lobby'); toast('That round broke, sent you back to the lobby'); }
    }
  }
  try { render(); renderFails = 0; }
  catch (e) {
    console.error('render failed', e);
    // if the 3D view breaks on this device, drop to 2D instead of showing a black screen
    if (use3D() && ++renderFails >= 2) { viewPref = '2d'; if (R3.ok) R3.show(false); toast('3D had a problem on this device, switched to 2D'); }
  }
}
// When this page is updated while open, keep a practice round going instead of dropping the player.
function resumePractice(data) {
  const R = Sim.restoreRound(data.round);
  newView(R.mapIdx, Sim.roster(R), data.you, true);
  V.R = R; V.introShown = R.phase !== 'intro';
  applySnap(Sim.snapshotFor(R, V.you));
}
const hot = window.claude && window.claude.hot;
if (hot && hot.snapshot) {
  try { hot.snapshot(() => (V && V.offline && V.R && V.R.phase !== 'end') ? { round: Sim.serializeRound(V.R), you: V.you } : {}); } catch (e) { }
}
function startApp(data) {
  requestAnimationFrame(frame);
  boot();
  if (data && data.round) { try { resumePractice(data); } catch (e) { console.warn('Could not resume round', e); } }
}
if (hot && hot.ready) hot.ready(startApp); else startApp((hot && hot.data) || {});
