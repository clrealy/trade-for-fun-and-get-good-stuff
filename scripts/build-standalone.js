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
  .replace('<script src="client.js"></script>', () => `<script>\n${R('public/client.js')}\n</script>`);
fs.mkdirSync(path.join(__dirname, '..', 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'dist', 'standalone.html'), html);
console.log('Wrote dist/standalone.html', (html.length / 1024).toFixed(0) + ' KB');
