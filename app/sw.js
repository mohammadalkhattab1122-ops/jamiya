// جمعية · service worker: shows phone notifications, keeps the number on the app icon,
// and opens the right page when a notification is tapped
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

async function syncBadge() {
  try {
    const n = (await self.registration.getNotifications()).length;
    if (n) await self.navigator.setAppBadge?.(n); else await self.navigator.clearAppBadge?.();
  } catch (_) {}
}

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  e.waitUntil((async () => {
    await self.registration.showNotification(d.title || 'جمعية', {
      body: d.body || '', icon: '../icon-192.png', badge: '../icon-192.png', lang: 'ar', dir: 'rtl',
      data: { url: d.url || self.registration.scope }, timestamp: Date.now(),
    });
    await syncBadge();
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil((async () => {
    await syncBadge();
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.registration.scope)) { await c.focus(); c.postMessage({ type: 'open', url }); return; }
    }
    await self.clients.openWindow(url);
  })());
});
