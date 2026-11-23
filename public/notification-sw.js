self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Dhikr Counter', body: event.data.text() };
  }

  const title = typeof payload.title === 'string' && payload.title.trim()
    ? payload.title.trim()
    : 'Dhikr Counter';
  const options = {
    body: typeof payload.body === 'string' ? payload.body : '',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: typeof payload.tag === 'string' ? payload.tag : undefined,
    data: { url: typeof payload.url === 'string' ? payload.url : '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const appClient = clients.find((client) => new URL(client.url).origin === self.location.origin);
      if (appClient) {
        return appClient.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
