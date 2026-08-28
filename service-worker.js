const APP_VERSION = 'pica-aqui-2026-08-28-03';
const STATIC_CACHE = `${APP_VERSION}-static`;
const RUNTIME_CACHE = `${APP_VERSION}-runtime`;

const CORE_ASSETS = [
  './',
  './manifest.json',
  './logo-pica-aqui.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async cache => {
      for (const asset of CORE_ASSETS) {
        try { await cache.add(asset); } catch (_) {}
      }
    })
  );
  // Não fazemos skipWaiting aqui: a atualização só entra quando o utilizador toca em "Atualizar".
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(key => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map(key => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Nunca meter Supabase/API em cache.
  if (
    url.hostname.includes('supabase.co') ||
    url.pathname.includes('/functions/v1/') ||
    url.pathname.includes('/rest/v1/') ||
    url.pathname.includes('/auth/v1/')
  ) {
    return;
  }

  // HTML/navegação: network-first para evitar clientes presos em versões antigas.
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req, { cache: 'no-store' });
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(req, fresh.clone()).catch(() => {});
          return fresh;
        } catch (_) {
          return (await caches.match(req)) || (await caches.match('./')) || Response.error();
        }
      })()
    );
    return;
  }

  // Recursos estáticos: stale-while-revalidate.
  if (['style','script','image','font','manifest'].includes(req.destination)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        const update = fetch(req, { cache: 'no-cache' }).then(async fresh => {
          if (fresh && fresh.ok) {
            const cache = await caches.open(RUNTIME_CACHE);
            await cache.put(req, fresh.clone());
          }
          return fresh;
        }).catch(() => null);
        return cached || (await update) || Response.error();
      })()
    );
  }
});

self.addEventListener('push', event => {
  let data={};
  try{data=event.data?.json()||{}}catch(_){data={title:'Pica-Aqui',body:event.data?.text()||''}}
  event.waitUntil(self.registration.showNotification(data.title||'Pica-Aqui',{
    body:data.body||data.message||'Tem uma nova notificação.',
    icon:'./logo-pica-aqui.png',
    badge:'./logo-pica-aqui.png',
    tag:data.tag||'pica-aqui',
    renotify:true,
    data:{target_page:data.target_page||null,url:data.url||'./'}
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async()=>{
    const windows=await clients.matchAll({type:'window',includeUncontrolled:true});
    if(windows.length){
      const win=windows[0];
      await win.focus();
      win.postMessage({type:'OPEN_NOTIFICATION',data:event.notification.data||{}});
      return;
    }
    await clients.openWindow(event.notification.data?.url||'./');
  })());
});
