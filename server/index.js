'use strict';
// Authoritative game server: serves the client, runs every round, owns all coins/items.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const Sim = require('../shared/sim.js');
const { MemoryStore, FirestoreStore } = require('./store.js');
const Eco = require('./economy.js');

const PORT = +process.env.PORT || 8080;
const ROOT = path.join(__dirname, '..');
const TICK = 1 / 30;
const WAIT_TIME = 12, POST_TIME = 7;
const ADMIN_UIDS = new Set((process.env.ADMIN_UIDS || '').split(',').map(s => s.trim()).filter(Boolean));
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

// ---------- auth + storage setup ----------
let admin = null, store, authMode;
function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  const txt = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  return JSON.parse(txt);
}
let webConfig = null;
try { webConfig = process.env.FIREBASE_WEB_CONFIG ? JSON.parse(process.env.FIREBASE_WEB_CONFIG) : null; }
catch (e) { console.error('FIREBASE_WEB_CONFIG is not valid JSON'); process.exit(1); }

const sa = loadServiceAccount();
if (sa || process.env.FIREBASE_USE_ADC === '1') {
  admin = require('firebase-admin');
  admin.initializeApp(sa ? { credential: admin.credential.cert(sa) } : { credential: admin.credential.applicationDefault() });
  store = new FirestoreStore(admin);
  authMode = 'firebase';
  if (!webConfig) { console.error('Set FIREBASE_WEB_CONFIG so the client can sign in.'); process.exit(1); }
} else if (process.env.ALLOW_DEV_AUTH === '1') {
  store = new MemoryStore();
  authMode = 'dev';
  console.warn('⚠️  DEV AUTH: anyone can log in as any name and nothing is saved. Never run this in production.');
} else {
  console.error('No Firebase credentials. Set FIREBASE_SERVICE_ACCOUNT (see README), or run `npm run dev` for local testing.');
  process.exit(1);
}

// ---------- static files ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://www.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self' ws: wss: https://identitytoolkit.googleapis.com https://securetoken.googleapis.com",
  "frame-src https://*.firebaseapp.com",
  "frame-ancestors 'none'", "base-uri 'none'", "form-action 'self'",
].join('; ');
function send(res, code, body, type, extra = {}) {
  res.writeHead(code, { 'Content-Type': type, 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', ...extra });
  res.end(body);
}
function serveFile(res, base, rel) {
  const full = path.normalize(path.join(base, rel));
  if (!full.startsWith(base + path.sep)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.readFile(full, (err, data) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    send(res, 200, data, TYPES[path.extname(full)] || 'application/octet-stream', { 'Cache-Control': 'no-cache' });
  });
}
const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain');
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/healthz') return send(res, 200, 'ok', 'text/plain');
  if (url === '/config.json') return send(res, 200, JSON.stringify({ auth: authMode, firebase: webConfig }), 'application/json', { 'Cache-Control': 'no-store' });
  if (url === '/shared/sim.js') return serveFile(res, path.join(ROOT, 'shared'), 'sim.js');
  if (url === '/vendor/three.min.js') return serveFile(res, path.join(ROOT, 'node_modules', 'three', 'build'), 'three.min.js');
  serveFile(res, path.join(ROOT, 'public'), url === '/' ? 'index.html' : url.slice(1));
});

// ---------- rooms ----------
const rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() { let c; do { c = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''); } while (rooms.has(c)); return c; }
function createRoom(isPrivate, mode = 'classic') { const r = { code: newCode(), private: isPrivate, mode, clients: new Set(), state: 'waiting', timer: WAIT_TIME, R: null, tick: 0, lobbyT: 0 }; rooms.set(r.code, r); return r; }
function roomInfo(r) { return { t: 'room', code: r.code, private: r.private, mode: r.mode, state: r.state, timer: Math.ceil(r.timer), players: [...r.clients].map(c => c.profile.name) }; }
function broadcast(r, msg) { const s = JSON.stringify(msg); for (const c of r.clients) sendRaw(c, s); }

function joinRoom(c, r) {
  leaveRoom(c);
  if (r.clients.size >= (r.mode === '1v1' ? 2 : Sim.MAX_PLAYERS)) throw new Error('That room is full');
  r.clients.add(c); c.room = r; c.entId = null;
  broadcast(r, roomInfo(r));
  if (r.R) sendMsg(c, { t: 'round', map: r.R.mapIdx, roster: Sim.roster(r.R), you: null });
}
function leaveRoom(c) {
  const r = c.room; if (!r) return;
  r.clients.delete(c); c.room = null; c.entId = null;
  if (r.R) Sim.releaseHuman(r.R, c.uid);
  if (!r.clients.size) rooms.delete(r.code); else broadcast(r, roomInfo(r));
}
function startRound(r) {
  const players = [...r.clients].map(c => ({ pid: c.uid, name: c.profile.name, knife: Eco.equippedId(c.profile, 'knife'), gun: Eco.equippedId(c.profile, 'gun'), mT: c.profile.mT, sT: c.profile.sT }));
  r.R = Sim.createRound({ players, mode: r.mode });
  r.state = 'round'; r.rewarded = false;
  const roster = Sim.roster(r.R);
  for (const c of r.clients) {
    const e = r.R.ents.find(x => x.pid === c.uid);
    c.entId = e ? e.id : null;
    sendMsg(c, { t: 'round', map: r.R.mapIdx, roster, you: c.entId });
  }
}
function giveRewards(r) {
  for (const res of r.R.results) {
    queue(res.pid, async () => {
      let summary;
      const p = await store.update(res.pid, prof => { summary = Eco.applyRoundResult(prof, res); return prof; });
      for (const c of r.clients) if (c.uid === res.pid) { c.profile = p; sendMsg(c, { t: 'reward', r: summary }); sendMsg(c, { t: 'profile', p: Eco.publicProfile(p) }); }
    }).catch(e => console.error('reward failed', res.pid, e.message));
  }
}
function tickRoom(r, dt) {
  r.tick++;
  if (r.state === 'waiting') {
    r.timer -= dt; r.lobbyT -= dt;
    if (r.lobbyT <= 0) { r.lobbyT = .5; broadcast(r, roomInfo(r)); }
    if (r.timer <= 0) startRound(r);
    return;
  }
  const R = r.R;
  Sim.step(R, dt);
  const evs = Sim.drain(R);
  if (R.phase === 'end' && !r.rewarded) { r.rewarded = true; r.state = 'post'; r.timer = POST_TIME; giveRewards(r); }
  const snapNow = r.tick % 2 === 0;
  for (const c of r.clients) {
    const ev = Sim.eventsFor(evs, c.entId);
    if (!snapNow && !ev.length) continue;
    sendMsg(c, { t: 's', s: snapNow ? Sim.snapshotFor(R, c.entId) : undefined, ev: ev.length ? ev : undefined });
  }
  if (r.state === 'post') {
    r.timer -= dt;
    if (r.timer <= 0) { r.R = null; r.state = 'waiting'; r.timer = WAIT_TIME; for (const c of r.clients) c.entId = null; broadcast(r, roomInfo(r)); }
  }
}
let lastTick = Date.now();
setInterval(() => {
  const now = Date.now(), dt = Math.min(.1, (now - lastTick) / 1000); lastTick = now;
  for (const r of rooms.values()) {
    try { tickRoom(r, dt); } catch (e) { console.error('room crashed', r.code, e); rooms.delete(r.code); for (const c of r.clients) { c.room = null; sendMsg(c, { t: 'error', msg: 'The room crashed, sorry. Join another one.' }); } }
  }
}, TICK * 1000);

// ---------- connections ----------
const conns = new Map(); // uid -> conn
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const BLOCKED = ['admin', 'moderator', 'nigg', 'fag', 'retard', 'hitler', 'nazi', 'rape', 'cunt'];
function checkName(n) {
  if (typeof n !== 'string' || !NAME_RE.test(n)) throw new Error('Names are 3-16 letters, numbers or _');
  const l = n.toLowerCase(); if (BLOCKED.some(b => l.includes(b))) throw new Error('Pick a different name');
  return n;
}
function sendRaw(c, s) { if (c.ws.readyState === 1 && c.ws.bufferedAmount < 1 << 20) c.ws.send(s); }
function sendMsg(c, m) { sendRaw(c, JSON.stringify(m)); }
// serialize profile changes per user so two requests can't race each other
const chains = new Map();
function queue(uid, fn) {
  const prev = chains.get(uid) || Promise.resolve();
  const next = prev.catch(() => { }).then(fn);
  chains.set(uid, next); next.finally(() => { if (chains.get(uid) === next) chains.delete(uid); }).catch(() => { });
  return next;
}
async function mutate(c, fn) {
  let out;
  c.profile = await queue(c.uid, () => store.update(c.uid, p => { out = fn(p); return p; }));
  sendMsg(c, { t: 'profile', p: Eco.publicProfile(c.profile) });
  return out;
}
function bucketTake(b, cost, rate, cap) {
  const now = Date.now(); b.tokens = Math.min(cap, b.tokens + (now - b.last) / 1000 * rate); b.last = now;
  if (b.tokens < cost) return false; b.tokens -= cost; return true;
}
async function signedIn(c, uid, profile) {
  const old = conns.get(uid);
  if (old && old !== c) { sendMsg(old, { t: 'kicked', msg: 'You logged in somewhere else.' }); old.ws.close(4001, 'dup'); }
  c.uid = uid; c.profile = profile; conns.set(uid, c);
  c.traders = Eco.genTraders();
  sendMsg(c, { t: 'hello', p: Eco.publicProfile(profile), traders: Eco.tradersView(c.traders) });
}

const HANDLERS = {
  async auth(c, m) {
    if (c.uid || c.authing) return;
    c.authing = true;
    try {
      if (authMode === 'firebase') {
        if (typeof m.token !== 'string' || m.token.length > 4096) throw new Error('Bad token');
        const dec = await admin.auth().verifyIdToken(m.token, true);
        if (dec.firebase && dec.firebase.sign_in_provider === 'anonymous') throw new Error('Make an account to play online');
        c.pendingUid = dec.uid;
        const p = await store.get(dec.uid);
        if (p) await signedIn(c, dec.uid, p); else sendMsg(c, { t: 'needName' });
      } else {
        const name = checkName(m.dev);
        const uid = 'dev_' + name.toLowerCase();
        const p = (await store.get(uid)) || (await store.create(uid, name));
        await signedIn(c, uid, p);
      }
    } finally { c.authing = false; }
  },
  async setName(c, m) {
    if (c.uid || !c.pendingUid) return;
    const name = checkName(m.name);
    const p = await store.create(c.pendingUid, name);
    await signedIn(c, c.pendingUid, p);
  },
  quickplay(c) {
    let best = null;
    for (const r of rooms.values()) if (!r.private && r.clients.size < Sim.MAX_PLAYERS && (!best || r.clients.size > best.clients.size)) best = r;
    joinRoom(c, best || createRoom(false));
  },
  createPrivate(c) { joinRoom(c, createRoom(true)); },
  create1v1(c) { joinRoom(c, createRoom(true, '1v1')); },
  joinCode(c, m) {
    const code = String(m.code || '').toUpperCase().trim();
    const r = rooms.get(code); if (!r) throw new Error('No room with that code');
    joinRoom(c, r);
  },
  leave(c) { leaveRoom(c); sendMsg(c, { t: 'left' }); },
  in(c, m) { if (c.room && c.room.R && c.entId) Sim.setInput(c.room.R, c.entId, m); },
  chat(c, m) {
    const text = String(m.text || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!text || !c.room) return;
    if (text.startsWith('/')) {
      // cheats: only admins (ADMIN_UIDS), or anyone on a local dev server
      if (authMode !== 'dev' && !ADMIN_UIDS.has(c.uid)) throw new Error('Cheats only work in Practice');
      if (!c.room.R || !c.entId) throw new Error('Cheats only work during a round');
      sendMsg(c, { t: 'chat', sys: true, text: Sim.cheat(c.room.R, c.entId, text) });
      return;
    }
    const l = text.toLowerCase();
    if (BLOCKED.some(b => l.includes(b))) throw new Error('Keep the chat clean');
    broadcast(c.room, { t: 'chat', name: c.profile.name, text });
  },
  async crate(c, m) { const inst = await mutate(c, p => Eco.openCrate(p, m.id, ADMIN_UIDS.has(c.uid))); sendMsg(c, { t: 'unboxed', item: inst.id, crate: m.id }); },
  async redeem(c, m) { const r = await mutate(c, p => Eco.redeem(p, m.code)); sendMsg(c, r.inst ? { t: 'unboxed', item: r.inst.id, crate: 'mystery' } : r.luck ? { t: 'codeLuck' } : r.all ? { t: 'codeAll', count: r.all.length } : r.items ? { t: 'codeItems', items: r.items } : { t: 'codeCoins', coins: r.coins }); },
  async claimEvent(c, m) { const items = await mutate(c, p => Eco.claimEvent(p, m.id)); sendMsg(c, { t: 'codeItems', items, from: 'event' }); },
  async buyBundle(c, m) { const items = await mutate(c, p => Eco.buyBundle(p, m.id)); sendMsg(c, { t: 'codeItems', items, from: 'bundle' }); },
  async equip(c, m) { await mutate(c, p => Eco.equip(p, m.u)); },
  traders(c, m) { if (m.refresh) c.traders = Eco.genTraders(); sendMsg(c, { t: 'traders', traders: Eco.tradersView(c.traders) }); },
  async trade(c, m) {
    const trader = c.traders[m.trader | 0]; if (!trader) throw new Error('Pick a trader');
    // work on a copy so a retried transaction can't double-apply to the trader
    let draft, result;
    await mutate(c, p => { draft = structuredClone(trader); result = Eco.trade(p, draft, m.mine, m.theirs); return result; });
    c.traders[m.trader | 0] = draft;
    sendMsg(c, { t: 'tradeResult', ok: result.ok, line: result.line, trader: trader.name, traders: Eco.tradersView(c.traders) });
  },
};
const PRE_AUTH = new Set(['auth', 'setName']);

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
wss.on('connection', (ws, req) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.length && !ALLOWED_ORIGINS.includes(origin)) { ws.close(4003, 'origin'); return; }
  const c = { ws, uid: null, profile: null, room: null, entId: null, fast: { tokens: 90, last: Date.now() }, slow: { tokens: 10, last: Date.now() }, strikes: 0 };
  const authTimer = setTimeout(() => { if (!c.uid) ws.close(4002, 'auth timeout'); }, 60000);
  ws.on('message', async (data, isBinary) => {
    if (isBinary) return;
    let m; try { m = JSON.parse(data.toString()); } catch { return; }
    if (!m || typeof m.t !== 'string' || !Object.hasOwn(HANDLERS, m.t)) return;
    const ok = m.t === 'in' ? bucketTake(c.fast, 1, 45, 90) : bucketTake(c.slow, 1, 3, 10);
    if (!ok) { if (++c.strikes > 400) ws.close(4008, 'rate limit'); return; }
    if (!c.uid && !PRE_AUTH.has(m.t)) return;
    try { await HANDLERS[m.t](c, m); }
    catch (e) {
      // our own errors are safe to show; library errors (they carry a code) get a generic message
      const msg = !e.code ? e.message : String(e.code).startsWith('auth/') ? 'Sign-in failed or expired. Log in again.' : 'Something went wrong. Try again.';
      if (e.code) console.error(m.t, e.code, e.message);
      sendMsg(c, { t: 'error', msg });
    }
  });
  ws.on('close', () => {
    clearTimeout(authTimer);
    leaveRoom(c);
    if (c.uid && conns.get(c.uid) === c) conns.delete(c.uid);
  });
  ws.on('error', () => { });
});

server.listen(PORT, () => console.log(`Murder Mystery server on :${PORT} (auth: ${authMode}, store: ${store.kind})`));
