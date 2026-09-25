'use strict';
// Stand-in for the game server, used only by the standalone solo build (scripts/build-standalone.js).
// It runs the same economy code in the browser and saves to localStorage, so it is NOT cheat-proof:
// it's for playing solo vs bots without a server. The online game never loads this file.
(function () {
  const KEY = 'mm_solo_profile_v2';
  const Eco = window.MMEco, Store = window.MMStore;
  let P, traders, emit;
  function load() {
    try { const p = JSON.parse(localStorage.getItem(KEY)); if (p && Array.isArray(p.inv)) return { ...Store.defaultProfile('You'), ...p }; } catch (e) { }
    return Store.defaultProfile('You');
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { } }
  // apply fn to a copy so a failed action changes nothing
  function mutate(fn) { const draft = structuredClone(P); const out = fn(draft); Eco.checkTrophies(draft); P = draft; save(); emit({ t: 'profile', p: Eco.publicProfile(P) }); return out; }
  window.LocalServer = {
    start(cb) {
      emit = m => setTimeout(() => cb(m), 0);
      P = load(); Eco.checkTrophies(P); save(); traders = Eco.genTraders(); // unlock anything already earned
      const txt = document.querySelector('#tab-play h3 + p'); if (txt) txt.textContent = 'Solo vs bots. You keep your coins and XP.';
      emit({ t: 'hello', p: Eco.publicProfile(P), traders: Eco.tradersView(traders) });
    },
    send(m) {
      try {
        switch (m.t) {
          case 'crate': { const i = mutate(p => Eco.openCrate(p, m.id)); emit({ t: 'unboxed', item: i.id, crate: m.id }); break; }
          case 'redeem': { const r = mutate(p => Eco.redeem(p, m.code)); emit(r.inst ? { t: 'unboxed', item: r.inst.id, crate: 'mystery' } : r.luck ? { t: 'codeLuck' } : r.all ? { t: 'codeAll', count: r.all.length } : r.items ? { t: 'codeItems', items: r.items } : { t: 'codeCoins', coins: r.coins }); break; }
          case 'claimEvent': { const items = mutate(p => Eco.claimEvent(p, m.id)); emit({ t: 'codeItems', items, from: 'event' }); break; }
          case 'buyBundle': { const items = mutate(p => Eco.buyBundle(p, m.id)); emit({ t: 'codeItems', items, from: 'bundle' }); break; }
          case 'equip': mutate(p => Eco.equip(p, m.u)); break;
          case 'traders': if (m.refresh) traders = Eco.genTraders(); emit({ t: 'traders', traders: Eco.tradersView(traders) }); break;
          case 'trade': {
            const tr = traders[m.trader | 0]; if (!tr) throw new Error('Pick a trader');
            const draft = structuredClone(tr);
            const r = mutate(p => Eco.trade(p, draft, m.mine, m.theirs));
            traders[m.trader | 0] = draft;
            emit({ t: 'tradeResult', ok: r.ok, line: r.line, trader: tr.name, traders: Eco.tradersView(traders) });
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
