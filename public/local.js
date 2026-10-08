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
  let P, traders, emit;
  let cloud = null; // { db, uid, ref } once signed in
  let board = [], boardUnsub = null, lastBoard = '';
  const localKey = () => cloud ? KEY + ':' + cloud.uid : KEY; // a cache per account, so two accounts on one browser don't mix
  function withDefaults(p, name) { return p && Array.isArray(p.inv) ? { ...Store.defaultProfile(name), ...p } : null; }
  function loadLocal(key = localKey()) {
    try { return withDefaults(JSON.parse(localStorage.getItem(key)), 'You'); } catch (e) { return null; }
  }
  function saveLocal() { try { localStorage.setItem(localKey(), JSON.stringify(P)); } catch (e) { } }

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
      await cloud.ref.set(JSON.parse(JSON.stringify(P)));
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
    if (P.name === 'You') return; // wait until they've picked a name
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
    if (saved) P = saved;
    else {
      // first time on this account: bring the guest progress along
      P = loadLocal() || guest;
      if (P.name === 'You' && me.name) { const n = me.name.split(/\s+/)[0].replace(/[^A-Za-z0-9_]/g, '').slice(0, 16); if (NAME_RE.test(n)) P.name = n; }
    }
    Eco.checkTrophies(P); saveLocal(); saveCloud();
    emit({ t: 'profile', p: Eco.publicProfile(P) });
    account('cloud', saved ? 'Signed in. Progress saves to your claude.ai account ☁️' : 'Account created. Progress saves to your claude.ai account ☁️', me.avatarUrl);
    watchBoard(db, me.id);
    if (P.name === 'You') emit({ t: 'needName' });
  }

  window.LocalServer = {
    start(cb) {
      emit = m => setTimeout(() => cb(m), 0);
      P = loadLocal() || Store.defaultProfile('You');
      Eco.checkTrophies(P); saveLocal(); traders = Eco.genTraders(); // unlock anything already earned
      const txt = document.querySelector('#tab-play h3 + p'); if (txt) txt.textContent = 'Solo vs bots. You keep your coins and XP.';
      emit({ t: 'hello', p: Eco.publicProfile(P), traders: Eco.tradersView(traders) });
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
            emit({ t: 'tradeResult', ok: r.ok, line: r.line, got: r.got, trader: tr.name, traders: Eco.tradersView(traders) });
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
