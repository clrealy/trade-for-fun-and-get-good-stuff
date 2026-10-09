'use strict';
// Stand-in for the game server, used only by the standalone solo build (scripts/build-standalone.js).
// It runs the same economy code in the browser, so it is NOT cheat-proof: it's for playing solo vs bots
// without a server. The online game never loads this file.
//
// Accounts: when the page runs as a claude.ai Artifact, each player signs in with their claude.ai account
// (the `user` capability) and their profile is saved in the artifact's database (`db`), in their own private
// folder, so it follows them to any device. Anyone else (opened as a file, signed out, or a view-only share)
// plays as a guest saved in this browser.
(function () {
  const KEY = 'mm_solo_profile_v2';
  const Eco = window.MMEco, Store = window.MMStore;
  const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
  let P, traders, emit, offer = null;
  let cloud = null; // { db, uid, ref } once signed in
  let board = [], boardUnsub = null, lastBoard = '';
  const baseKey = () => cloud ? KEY + ':' + cloud.uid : KEY; // a cache per account, so two accounts on one browser don't mix
  // alts: extra save slots on the same account, each a whole separate profile. 'main' is the original
  const MAX_ALTS = 5;
  let slot = 'main', slots = [{ id: 'main', name: 'You', level: 1, coins: 0 }];
  const localKey = (id = slot) => id === 'main' ? baseKey() : baseKey() + ':alt:' + id;
  const slotsKey = () => baseKey() + ':slots';
  const cloudRef = (id = slot) => cloud.db.doc('data/users/' + cloud.uid + '/' + (id === 'main' ? 'profile' : 'alt_' + id));
  function loadSlots() { try { const s = JSON.parse(localStorage.getItem(slotsKey())); if (s && Array.isArray(s.list) && s.list.some(x => x.id === 'main')) return s; } catch (e) { } return null; }
  function saveSlots() {
    const me = slots.find(x => x.id === slot); if (me && P) Object.assign(me, { name: P.name, level: P.level, coins: P.coins });
    const data = { list: slots, cur: slot };
    try { localStorage.setItem(slotsKey(), JSON.stringify(data)); } catch (e) { }
    if (cloud) cloud.db.doc('data/users/' + cloud.uid + '/slots').set(JSON.parse(JSON.stringify(data))).catch(() => { });
  }
  const slotsMsg = () => ({ t: 'slots', list: slots.map(x => ({ ...x, active: x.id === slot })), cur: slot, max: MAX_ALTS });
  function withDefaults(p, name) { return p && Array.isArray(p.inv) ? { ...Store.defaultProfile(name), ...p } : null; }
  function loadLocal(key = localKey()) {
    try { return withDefaults(JSON.parse(localStorage.getItem(key)), 'You'); } catch (e) { return null; }
  }
  function saveLocal() { try { localStorage.setItem(localKey(), JSON.stringify(P)); } catch (e) { } saveSlots(); }

  // cloud saves: at most one write in flight, coalescing bursts (a crate spin, a round result) into one write
  let dirty = false, writing = false, saveT = 0;
  function saveCloud() {
    if (!cloud) return;
    dirty = true; clearTimeout(saveT); saveT = setTimeout(flush, 800);
  }
  async function flush() {
    if (!cloud || writing || !dirty) return;
    writing = true; dirty = false;
    try {
      await cloudRef().set(JSON.parse(JSON.stringify(P)));
      await postScore();
    } catch (e) {
      if (e && (e.code === 'invalid_argument' || e.code === 'revoked' || e.code === 'not_granted')) { // can't save here (view-only share, access removed)
        cloud = null; account('local', 'Your account can\'t save on this page, so progress stays on this device.');
      } else dirty = true; // try again with the next change
    } finally { writing = false; if (dirty) saveT = setTimeout(flush, 2000); }
  }
  addEventListener('pagehide', () => { if (dirty) flush(); });

  // leaderboard: one small public doc per player, written only when it changes
  async function postScore() {
    if (P.name === 'You' || slot !== 'main') return; // wait until they've picked a name; alts stay off the leaderboard
    const row = { name: P.name, level: P.level, kills: P.stats.kills, wins: P.stats.wins, rounds: P.stats.rounds };
    const k = JSON.stringify(row); if (k === lastBoard) return;
    try { await cloud.db.doc('leaderboard/' + cloud.uid).set(row); lastBoard = k; } catch (e) { }
  }
  function watchBoard(db, uid) {
    if (boardUnsub) boardUnsub();
    boardUnsub = db.collection('leaderboard').orderBy('kills', 'desc').limit(50).onSnapshot(s => {
      board = s.docs.map(d => ({ ...d.data(), me: d.id === uid }));
      emit({ t: 'board', rows: board });
    }, () => { });
  }

  function mutate(fn) {
    const draft = structuredClone(P); const out = fn(draft); Eco.checkTrophies(draft);
    P = draft; saveLocal(); saveCloud(); emit({ t: 'profile', p: Eco.publicProfile(P) }); return out;
  }
  function account(state, note, avatar) { emit({ t: 'account', state, note, avatar: avatar || null }); }

  async function signIn() {
    const rt = window.claude;
    if (!rt || typeof rt.use !== 'function') return account('guest', 'Playing as a guest: progress is saved in this browser.');
    const [user, db] = await Promise.all([rt.use('user'), rt.use('db')]);
    const me = user ? await user.me() : null;
    if (!me || !me.id || !db) return account('guest', 'Sign in to claude.ai to save your progress to your account.');
    const ref = db.doc('data/users/' + me.id + '/profile');
    let snap;
    try { snap = await ref.get(); } catch (e) { return account('guest', 'Couldn\'t reach your account, playing as a guest for now.'); }
    const guest = P;
    cloud = { db, uid: me.id, ref };
    const saved = snap.exists ? withDefaults(snap.data(), guest.name) : null;
    // their alts, and which one they were playing last
    let idx = null;
    try { const sn = await db.doc('data/users/' + me.id + '/slots').get(); if (sn.exists) idx = sn.data(); } catch (e) { }
    idx = idx && Array.isArray(idx.list) && idx.list.some(x => x.id === 'main') ? idx : loadSlots();
    slots = idx ? idx.list : [{ id: 'main', name: (saved || guest).name, level: (saved || guest).level, coins: (saved || guest).coins }];
    slot = 'main'; // always open on the main: an alt only loads when you pick it
    if (saved) P = saved;
    else {
      // first time on this account: bring the guest progress along
      P = loadLocal() || guest;
      if (P.name === 'You' && me.name) { const n = me.name.split(/\s+/)[0].replace(/[^A-Za-z0-9_]/g, '').slice(0, 16); if (NAME_RE.test(n)) P.name = n; }
    }
    Eco.checkTrophies(P); saveLocal(); saveCloud();
    emit({ t: 'profile', p: Eco.publicProfile(P) }); emit(slotsMsg());
    account('cloud', saved ? 'Signed in. Progress saves to your claude.ai account ☁️' : 'Account created. Progress saves to your claude.ai account ☁️', me.avatarUrl);
    watchBoard(db, me.id);
    if (P.name === 'You') emit({ t: 'needName' });
  }

  // switch which profile is being played (the old one is saved first)
  function switchTo(id, profile) {
    saveLocal();
    if (cloud) { clearTimeout(saveT); dirty = false; cloudRef().set(JSON.parse(JSON.stringify(P))).catch(() => { }); } // save the one we're leaving right now
    slot = id; P = profile; Eco.checkTrophies(P); traders = Eco.genTraders();
    saveLocal(); saveCloud();
    emit({ t: 'hello', p: Eco.publicProfile(P), traders: Eco.tradersView(traders) }); emit(slotsMsg());
  }
  async function switchToSaved(id) {
    let p = null;
    if (cloud) { try { const sn = await cloudRef(id).get(); if (sn.exists) p = withDefaults(sn.data(), 'You'); } catch (e) { } }
    p = p || loadLocal(localKey(id));
    if (!p) throw new Error('Couldn\'t load that account');
    switchTo(id, p);
  }

  window.LocalServer = {
    start(cb) {
      emit = m => setTimeout(() => cb(m), 0);
      const idx = loadSlots();
      if (idx) slots = idx.list; // always open on the main: an alt only loads when you pick it
      P = loadLocal() || Store.defaultProfile('You');
      Eco.checkTrophies(P); saveLocal(); traders = Eco.genTraders(); // unlock anything already earned
      const txt = document.querySelector('#tab-play h3 + p'); if (txt) txt.textContent = 'Solo vs bots. You keep your coins and XP.';
      emit({ t: 'hello', p: Eco.publicProfile(P), traders: Eco.tradersView(traders) }); emit(slotsMsg());
      signIn().catch(() => account('guest', 'Playing as a guest: progress is saved in this browser.'));
    },
    send(m) {
      try {
        switch (m.t) {
          case 'crate': { const i = mutate(p => Eco.openCrate(p, m.id)); emit({ t: 'unboxed', item: i.id, crate: m.id }); break; }
          case 'redeem': { const r = mutate(p => Eco.redeem(p, m.code)); emit(Eco.redeemMsg(r)); break; }
          case 'claimEvent': { const items = mutate(p => Eco.claimEvent(p, m.id)); emit({ t: 'codeItems', items, from: 'event' }); break; }
          case 'buyBundle': { const items = mutate(p => Eco.buyBundle(p, m.id)); emit({ t: 'codeItems', items, from: 'bundle' }); break; }
          case 'equip': mutate(p => Eco.equip(p, m.u)); break;
          case 'avatar': mutate(p => Eco.setAvatar(p, m.avatar)); emit({ t: 'avatarSaved' }); break;
          case 'evolve': { const id = mutate(p => Eco.evolve(p, m.u)); emit({ t: 'evolved', item: id }); break; }
          case 'setName': {
            const name = String(m.name || '').trim();
            if (!NAME_RE.test(name)) throw new Error('Use 3–16 letters, numbers or _');
            if (board.some(r => !r.me && r.name && r.name.toLowerCase() === name.toLowerCase())) throw new Error('Someone already has that name');
            mutate(p => { p.name = name; });
            emit({ t: 'hello', p: Eco.publicProfile(P), traders: Eco.tradersView(traders) });
            break;
          }
          case 'traders': if (m.refresh) traders = Eco.genTraders(); emit({ t: 'traders', traders: Eco.tradersView(traders) }); break;
          case 'trade': {
            const tr = traders[m.trader | 0]; if (!tr) throw new Error('Pick a trader');
            const draft = structuredClone(tr);
            const r = mutate(p => Eco.trade(p, draft, m.mine, m.theirs));
            traders[m.trader | 0] = draft;
            emit({ t: 'tradeResult', ok: r.ok, line: r.line, got: r.got, want: r.want, trader: tr.name, traders: Eco.tradersView(traders) });
            break;
          }
          case 'offer': { offer = Eco.makeOffer(P, traders); if (offer) emit({ t: 'tradeOffer', offer }); break; }
          case 'offerReply': {
            const o = offer; offer = null;
            if (!o || o.id !== m.id) throw new Error('That offer expired');
            const tr = traders[o.trader]; if (!tr || tr.name !== o.name) throw new Error('That offer expired');
            if (!m.accept) { emit({ t: 'offerDeclined', trader: tr.name, line: Eco.declineLine() }); break; }
            const draft = structuredClone(tr);
            const r = mutate(p => Eco.acceptOffer(p, draft, o));
            traders[o.trader] = draft;
            emit({ t: 'tradeResult', ok: true, line: r.line, got: r.got, trader: tr.name, traders: Eco.tradersView(traders) });
            break;
          }
          case 'slots': emit(slotsMsg()); break;
          case 'newSlot': {
            if (slots.length - 1 >= MAX_ALTS) throw new Error(`You can have ${MAX_ALTS} alts. Delete one first`);
            const id = 'a' + Date.now().toString(36);
            slots.push({ id, name: 'You', level: 1, coins: 0 });
            switchTo(id, Store.defaultProfile('You'));
            emit({ t: 'slotSwitched', fresh: true }); emit({ t: 'needName' });
            break;
          }
          case 'switchSlot': {
            if (!slots.some(x => x.id === m.id)) throw new Error('That account is gone');
            if (m.id === slot) break;
            switchToSaved(m.id).then(() => emit({ t: 'slotSwitched' })).catch(e => emit({ t: 'error', msg: e.message }));
            break;
          }
          case 'deleteSlot': {
            if (m.id === 'main') throw new Error('Your main account can\'t be deleted here');
            if (m.id === slot) throw new Error('Switch to another account first');
            slots = slots.filter(x => x.id !== m.id);
            try { localStorage.removeItem(localKey(m.id)); } catch (e) { }
            if (cloud) cloudRef(m.id).delete().catch(() => { });
            saveSlots(); emit(slotsMsg());
            break;
          }
          case 'quickplay': case 'createPrivate': case 'joinCode': startPractice(); break;
          case 'create1v1': startPractice('1v1'); break;
          case 'leave': emit({ t: 'left' }); break;
        }
      } catch (e) { emit({ t: 'error', msg: e.message }); }
    },
    result(res) { if (!res) return; const r = mutate(p => Eco.applyRoundResult(p, res)); emit({ t: 'reward', r }); },
  };
})();
