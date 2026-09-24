'use strict';
// Redeem codes. Codes are not case sensitive and each account can use each code once.
// reward: { rarity: 'Godly' } for a random item of that rarity, or { item: 'g13' } for a specific item.
// expires: null, or a date like '2026-12-31' (the code stops working at the end of that day, UTC).
module.exports = {
  GODLY26: { reward: { rarity: 'Godly' }, expires: null },
};
