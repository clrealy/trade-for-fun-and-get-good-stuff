'use strict';
// Builds dist/standalone.html: one file that plays solo vs bots with no server (shop, codes, trading saved in the browser).
const fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
// tiny CommonJS shim so the server's economy code runs in the browser
const mod = (name, file) => `<script>(function(){var module={exports:{}},exports=module.exports;var require=function(p){return window.__mods[p.split('/').pop().replace(/\\.js$/,'')]};\n${R(file)}\nwindow.__mods[${JSON.stringify(name)}]=module.exports;})();</script>`;
let html = R('public/index.html')
  .replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${R('public/style.css')}\n</style>`)
  .replace('<script src="/shared/sim.js"></script>', () => [
    '<script>window.__mods={};</script>',
    mod('sim', 'shared/sim.js'), '<script>window.Sim=window.__mods.sim;</script>',
    mod('codes', 'server/codes.js'), mod('economy', 'server/economy.js'), mod('store', 'server/store.js'),
    '<script>window.MMEco=window.__mods.economy;window.MMStore=window.__mods.store;</script>',
    `<script>\n${R('public/local.js')}\n</script>`,
  ].join('\n'))
  .replace('<script src="/vendor/three.min.js"></script>', '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>')
  .replace('<script src="render3d.js"></script>', () => `<script>\n${R('public/render3d.js')}\n</script>`)
  .replace('<script src="client.js"></script>', () => `<script>\n${R('public/client.js')}\n</script>`);
// Scramble every inline script so "view source" shows gibberish instead of the game code and codes.
// It's a speed bump, not a lock: the online game keeps codes on the server, which is the real protection.
// Pass --plain for a readable build.
if (!process.argv.includes('--plain')) {
  const JO = require('javascript-obfuscator');
  const base = {
    compact: true, identifierNamesGenerator: 'hexadecimal', renameGlobals: false,
    stringArray: true, stringArrayEncoding: ['rc4'], stringArrayThreshold: 1, stringArrayRotate: true, stringArrayShuffle: true,
    splitStrings: true, splitStringsChunkLength: 5,
    // the game loop runs these 60 times a second, so skip the heavy (slow) transforms
    controlFlowFlattening: false, deadCodeInjection: false, selfDefending: false, numbersToExpressions: false,
  };
  let n = 0;
  html = html.replace(/<script>([\s\S]*?)<\/script>/g, (all, code) => {
    if (code.trim().length < 40) return all;
    // object keys hold the redeem codes, so encode them too in that module
    const opts = code.includes('reward: {') ? { ...base, transformObjectKeys: true } : base;
    n++;
    return `<script>${JO.obfuscate(code, opts).getObfuscatedCode()}</script>`;
  });
  console.log(`Obfuscated ${n} scripts`);
}
fs.mkdirSync(path.join(__dirname, '..', 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'dist', 'standalone.html'), html);
console.log('Wrote dist/standalone.html', (html.length / 1024).toFixed(0) + ' KB');
