'use strict';
// Profile storage. Firestore in production, in-memory for local dev.
// Profiles are only ever written by the server (see firestore.rules), so players can't edit their coins or items.

function defaultProfile(name) {
  return {
    name, coins: 120, xp: 0, level: 1, inv: [], nextUid: 1, equip: { knife: null, gun: null }, mT: 1, sT: 1,
    redeemed: [],
    stats: { rounds: 0, wins: 0, kills: 0, deaths: 0, coins: 0, unboxed: 0, trades: 0 },
    createdAt: Date.now(),
  };
}

class MemoryStore {
  constructor() { this.users = new Map(); this.names = new Map(); this.kind = 'memory'; }
  async get(uid) { const p = this.users.get(uid); return p ? structuredClone(p) : null; }
  // fn gets a copy of the profile and returns the new one (or throws to abort)
  async update(uid, fn) {
    const cur = this.users.get(uid); if (!cur) throw new Error('No profile');
    const next = await fn(structuredClone(cur));
    this.users.set(uid, next); return structuredClone(next);
  }
  // creates the profile and reserves the (case-insensitive) name atomically
  async create(uid, name) {
    const key = name.toLowerCase();
    if (this.users.has(uid)) return this.get(uid);
    if (this.names.has(key) && this.names.get(key) !== uid) throw new Error('That name is taken');
    this.names.set(key, uid);
    const p = defaultProfile(name); this.users.set(uid, p); return structuredClone(p);
  }
}

class FirestoreStore {
  constructor(admin) { this.db = admin.firestore(); this.kind = 'firestore'; }
  ref(uid) { return this.db.collection('users').doc(uid); }
  async get(uid) { const s = await this.ref(uid).get(); return s.exists ? s.data() : null; }
  async update(uid, fn) {
    return this.db.runTransaction(async tx => {
      const s = await tx.get(this.ref(uid));
      if (!s.exists) throw new Error('No profile');
      const next = await fn(s.data());
      tx.set(this.ref(uid), next);
      return next;
    });
  }
  async create(uid, name) {
    const nameRef = this.db.collection('usernames').doc(name.toLowerCase());
    return this.db.runTransaction(async tx => {
      const [u, n] = await Promise.all([tx.get(this.ref(uid)), tx.get(nameRef)]);
      if (u.exists) return u.data();
      if (n.exists && n.data().uid !== uid) throw new Error('That name is taken');
      const p = defaultProfile(name);
      tx.set(nameRef, { uid });
      tx.set(this.ref(uid), p);
      return p;
    });
  }
}

module.exports = { MemoryStore, FirestoreStore, defaultProfile };
