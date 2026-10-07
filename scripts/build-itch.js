'use strict';
// Builds dist/project-murder-mystery-itch.zip for itch.io: index.html (the solo game) + three.min.js.
// Upload the zip as an HTML game on itch.io (see ITCH.md). No server needed; progress saves in the player's browser.
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { build } = require('./build-standalone.js');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'dist');

// a minimal .zip writer (deflate), so this works anywhere Node runs without extra tools
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = buf => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function zip(files) {
  const locals = [], centrals = []; let offset = 0;
  const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const [name, data] of files) {
    const nameBuf = Buffer.from(name), comp = zlib.deflateRawSync(data, { level: 9 }), crc = crc32(data);
    const head = (sig, extra) => { const h = Buffer.alloc(extra); h.writeUInt32LE(sig, 0); return h; };
    const lh = head(0x04034b50, 30);
    lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(8, 8); lh.writeUInt16LE(time, 10); lh.writeUInt16LE(date, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    const ch = head(0x02014b50, 46);
    ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8); ch.writeUInt16LE(8, 10); ch.writeUInt16LE(time, 12); ch.writeUInt16LE(date, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    locals.push(lh, nameBuf, comp); centrals.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const html = build({ plain: process.argv.includes('--plain'), localThree: true });
const three = fs.readFileSync(path.join(ROOT, 'node_modules', 'three', 'build', 'three.min.js'));
fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, 'project-murder-mystery-itch.zip');
fs.writeFileSync(file, zip([['index.html', Buffer.from(html)], ['three.min.js', three]]));
console.log('Wrote', path.relative(ROOT, file), (fs.statSync(file).size / 1024).toFixed(0) + ' KB');
