const CACHE = 'conceito-v128-comparativo-layout';
const CORE = ['./', 'index.html', 'app.js?v=45', 'modulos.js?v=126', 'encomendas.js?v=6', 'despesas.js?v=123', 'caixa.js?v=125', 'impostos.js?v=15', 'dre.js?v=126', 'fluxo.js?v=2', 'servicos.js?v=4', 'style.css?v=124', 'contribuicao.js?v=116', 'dashboard.js?v=123', 'backup_seguro.js?v=3', 'precos.js?v=127', 'metas.js?v=126', 'auditoria.js?v=125', 'comparativo.js?v=128', 'manifest.webmanifest',
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
    const important = url.origin===location.origin && (req.mode==='navigate'||/\.(?:js|html)$/i.test(url.pathname));
    const network = fetch(new Request(req,{cache:important?'no-store':'default'})).then(res => {
      if (res && res.ok) c.put(req,res.clone()).catch(()=>{});
      return res;
    }).catch(() => null);
    if(important){
      const res=await network;
      if(res&&res.ok)return res;
      if(cached)return cached;
      if(req.mode==='navigate')return c.match('index.html') || Response.error();
      return res||Response.error();
    }
    if(cached){network;return cached;}
    const res=await network;
    return res||Response.error();
  })());
});
