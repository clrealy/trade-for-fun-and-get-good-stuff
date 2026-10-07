'use strict';
// Service worker: makes the game installable (and wrappable as an Android app).
// Network first, so a new version always wins; the cache is only a fallback when the network is down.
// The game itself needs the server, so nothing here pretends to work offline beyond showing the page.
const CACHE = 'pmm-v1';
const CORE = ['/', '/style.css', '/client.js', '/render3d.js', '/shared/sim.js', '/vendor/three.min.js', '/manifest.webmanifest', '/icons/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).catch(() => { })); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  // only plain same-origin GETs; never cache the live config or anything else dynamic
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname === '/config.json' || url.pathname === '/healthz') return;
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => { }); }
    return res;
  }).catch(() => caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('/') : Response.error()))));
});
