'use strict';
// Redeem codes. Codes are not case sensitive and each account can use each code once.
// reward: { rarity: 'Godly' } random item of that rarity, { item: 'g13' } a specific item, or { coins: 500 }.
// expires: null, or a date like '2026-12-31' (the code stops working at the end of that day, UTC).
module.exports = {
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
  FREECASH: { reward: { coins: 500 }, expires: null },
  BIGBAG: { reward: { coins: 1000 }, expires: null },
};
