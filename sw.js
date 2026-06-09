const CACHE = 'studyplan-v41';
const ASSETS = ['/', '/index.html', '/ds.css', '/ds.js', '/store.js', '/i18n.js', '/styles.css', '/auth.js', '/notifications.js', '/app.js', '/svg3d.js', '/manifest.json', '/locales/pt-BR.json', '/locales/en-US.json', '/icons/favicon.svg', '/icons/icon-192.png', '/icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Handle notification click — open or focus the app
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/';

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Focus existing window if open
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new one
      return clients.openWindow(url);
    })
  );
});

// Stale-while-revalidate: serve do cache imediatamente,
// mas busca a versão nova em background para a próxima visita.
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request).then(cached => {
        const fetchPromise = fetch(e.request).then(response => {
          if (response.ok && e.request.url.startsWith('http')) {
            cache.put(e.request, response.clone());
          }
          return response;
        }).catch(() => cached);

        return cached || fetchPromise;
      })
    )
  );
});
