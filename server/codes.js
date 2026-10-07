'use strict';
// Redeem codes. Codes are not case sensitive and each account can use each code once.
// reward: { admin: true } admin powers, { rarity: 'Godly', count: 1000 } a pile of one rarity, { all: true } every knife and gun, { items: ['k20', 'g15'] } a set, { rarity: 'Godly' } random item of that rarity, { item: 'g13' } a specific item, or { coins: 500 }.
// repeat: true lets the same account use a code again.
// expires: null, or a date like '2026-12-31' (the code stops working at the end of that day, UTC).
module.exports = {
  GIMMEALL: { reward: { all: true }, repeat: true, expires: null }, // every knife + gun you're missing, reusable. Delete before going public if you want a real economy
  GINGERSCOPE: { reward: { item: 'g14' }, expires: null },      // Cookie Scope, value 10 trillion
  MEMESET: { reward: { items: ['k20', 'g15'] }, expires: null }, // Sussy Slasher + Bruh Blaster, 69,420 each
  CGINGERSCOPE: { reward: { item: 'g16' }, expires: null },     // Chroma Cookie Scope, value 1e48
  CMEMESET: { reward: { items: ['k21', 'g17'] }, expires: null }, // Chroma Sussy Slasher + Chroma Bruh Blaster
  CNGS: { reward: { items: ['k22', 'k23'] }, expires: null },     // Cookie Cutter + Chroma Cookie Cutter
  ZAPZAPBOOM13: { reward: { items: ['g21', 'k28'] }, expires: null }, // Raygun Set. Secret: tap the logo 13 times
  GODLY1000: { reward: { rarity: 'Godly', count: 1000 }, expires: null }, // 1000 random Godlys at once (needs 1000 free inventory slots)
  OWNERMODE777: { reward: { admin: true }, expires: null },     // admin: 👑 badge + owner luck. Online cheats stay limited to ADMIN_UIDS
  DEATHLUCK95: { reward: { luck: true }, expires: null },         // owner only: 95% Death items from the Halloween Box. Keep secret
  GODLY26: { reward: { rarity: 'Godly' }, expires: null },
  CHROMA4LIFE: { reward: { item: 'g13' }, expires: null },       // Chroma Ranger
  ANCIENTVIBES: { reward: { rarity: 'Ancient' }, expires: null },
  HARVESTSZN: { reward: { item: 'k13' }, expires: null },         // Soul Reaper
  SHERIFFSZN: { reward: { item: 'g11' }, expires: null },         // Radiant
  GODLYDROP: { reward: { rarity: 'Godly' }, expires: null },
  MOREGODLYS: { reward: { rarity: 'Godly' }, expires: null },
  NEBULANIGHT: { reward: { item: 'k14' }, expires: null },       // Stardust
  ICEWING: { reward: { item: 'k15' }, expires: null },           // Glacier
  HEATWAVE: { reward: { item: 'k16' }, expires: null },          // Heat
  LUGERLIFE: { reward: { item: 'g9' }, expires: null },          // Ranger
  SNOWDAY: { reward: { item: 'g10' }, expires: null },           // Blizzard
  LEGENDARY: { reward: { rarity: 'Legendary' }, expires: null },
  ULTRARICH: { reward: { coins: 1e56 }, expires: null },         // a 1 with 56 zeros
  MEGARICH: { reward: { coins: 1e24 }, expires: null },          // 1,000,000,000,000,000,000,000,000 coins
  MILLIONAIRE: { reward: { coins: 1000000 }, expires: null },
  FREECASH: { reward: { coins: 500 }, expires: null },
  BIGBAG: { reward: { coins: 1000 }, expires: null },
};
