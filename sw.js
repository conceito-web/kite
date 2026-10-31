const CACHE = 'conceito-v43';
const CORE = ['./', 'index.html', 'app.js?v=29', 'modulos.js?v=20', 'despesas.js?v=4', 'caixa.js?v=6', 'impostos.js?v=11', 'encomendas.js?v=1', 'style.css?v=28', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];
const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(CORE.map(async u=>{ const res=await fetch(new Request(u,{cache:'reload'})); if(!res.ok) throw new Error(u); await c.put(u,res); }));   // cache:'reload' = sempre baixa a versão nova
    try { await c.add(JSPDF); } catch (_) {}
    try { await c.add(JSZIP); } catch (_) {}
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // APIs externas (ViaCEP, WhatsApp): sempre rede
  if (url.origin !== location.origin && req.url !== JSPDF && req.url !== JSZIP) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const cached = await c.match(req, { ignoreSearch: false }) || await c.match(req, { ignoreSearch: true });
    const network = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (cached) { network; return cached; }           // abre rápido/offline, atualiza em segundo plano
    const res = await network;
    if (res) return res;
    if (req.mode === 'navigate') return c.match('index.html');
    return Response.error();
  })());
});
