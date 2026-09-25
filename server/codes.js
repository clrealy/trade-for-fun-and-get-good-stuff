'use strict';
// Redeem codes. Codes are not case sensitive and each account can use each code once.
// reward: { all: true } every knife and gun, { items: ['k20', 'g15'] } a set, { rarity: 'Godly' } random item of that rarity, { item: 'g13' } a specific item, or { coins: 500 }.
// expires: null, or a date like '2026-12-31' (the code stops working at the end of that day, UTC).
module.exports = {
  GIMMEALL: { reward: { all: true }, expires: null },          // every knife + gun. Delete before going public if you want a real economy
  GINGERSCOPE: { reward: { item: 'g14' }, expires: null },      // Ginger Scope, value 10 trillion
  MEMESET: { reward: { items: ['k20', 'g15'] }, expires: null }, // Sussy Slasher + Bruh Blaster, 69,420 each
  CGINGERSCOPE: { reward: { item: 'g16' }, expires: null },     // Chroma Ginger Scope, value 1e48
  CMEMESET: { reward: { items: ['k21', 'g17'] }, expires: null }, // Chroma Sussy Slasher + Chroma Bruh Blaster
  CNGS: { reward: { items: ['k22', 'k23'] }, expires: null },     // Ginger Scope Knife + Chroma Ginger Scope Knife
  ZAPZAPBOOM13: { reward: { items: ['g21', 'k28'] }, expires: null }, // Raygun Set. Secret: tap the logo 13 times
  GODLY26: { reward: { rarity: 'Godly' }, expires: null },
  CHROMA4LIFE: { reward: { item: 'g13' }, expires: null },       // Chroma Luger
  ANCIENTVIBES: { reward: { rarity: 'Ancient' }, expires: null },
  HARVESTSZN: { reward: { item: 'k13' }, expires: null },         // Harvester
  SHERIFFSZN: { reward: { item: 'g11' }, expires: null },         // Lightbringer
  GODLYDROP: { reward: { rarity: 'Godly' }, expires: null },
  MOREGODLYS: { reward: { rarity: 'Godly' }, expires: null },
  NEBULANIGHT: { reward: { item: 'k14' }, expires: null },       // Nebula
  ICEWING: { reward: { item: 'k15' }, expires: null },           // Icewing
  HEATWAVE: { reward: { item: 'k16' }, expires: null },          // Heat
  LUGERLIFE: { reward: { item: 'g9' }, expires: null },          // Luger
  SNOWDAY: { reward: { item: 'g10' }, expires: null },           // Blizzard
  LEGENDARY: { reward: { rarity: 'Legendary' }, expires: null },
  MEGARICH: { reward: { coins: 1e24 }, expires: null },          // 1,000,000,000,000,000,000,000,000 coins
  MILLIONAIRE: { reward: { coins: 1000000 }, expires: null },
  FREECASH: { reward: { coins: 500 }, expires: null },
  BIGBAG: { reward: { coins: 1000 }, expires: null },
};
