// Service Worker para Web Push de Movi / Anda y Gana
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = { title: 'Movi', body: '', url: '/anda-gana', urgent: false };
  try { if (event.data) data = { ...data, ...event.data.json() }; }
  catch { if (event.data) data.body = event.data.text(); }

  const isTrip = data.urgent === true;

  const options = {
    body: data.body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    vibrate: isTrip
      ? [300, 100, 300, 100, 300, 100, 600]
      : [200, 100, 200],
    data: { url: data.url },
    tag: data.tag || 'movi',
    renotify: true,
    requireInteraction: isTrip,
    actions: isTrip ? [
      { action: 'open', title: '🚗 Ver solicitud' },
      { action: 'dismiss', title: 'Ignorar' },
    ] : [],
    silent: false,
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/anda-gana';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.includes('/anda-gana')) { c.focus(); return; }
    }
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
