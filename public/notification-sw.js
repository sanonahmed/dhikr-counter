function localUrl(value, fallback) {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    const url = new URL(value, self.location.origin);
    return url.origin === self.location.origin ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}

self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) payload = parsed;
      else payload = { body: event.data.text() };
    } catch {
      try {
        payload = { body: event.data.text() };
      } catch {
        payload = {};
      }
    }
  }

  const title = typeof payload.title === 'string' && payload.title.trim()
    ? payload.title.trim().slice(0, 120)
    : 'Dhikr Counter';
  const options = {
    body: typeof payload.body === 'string' ? payload.body.slice(0, 1000) : '',
    icon: localUrl(payload.icon, '/pwa-192x192.png'),
    badge: localUrl(payload.badge, '/pwa-192x192.png'),
    tag: typeof payload.tag === 'string' ? payload.tag.slice(0, 120) : undefined,
    data: { url: localUrl(payload.url, '/') },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Only same-origin navigation is allowed, so a malformed payload cannot turn
  // a notification click into an open redirect.
  let target = new URL('/', self.location.origin);
  try {
    const candidate = new URL(event.notification.data?.url || '/', self.location.origin);
    if (candidate.origin === self.location.origin) target = candidate;
  } catch {
    // Keep the app root when the payload URL is invalid.
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const sameOrigin = clients.filter((client) => {
        try {
          return new URL(client.url).origin === self.location.origin;
        } catch {
          return false;
        }
      });
      const exact = sameOrigin.find((client) => client.url === target.href);
      if (exact) return exact.focus();

      const appClient = sameOrigin[0];
      if (appClient) {
        await appClient.focus();
        // Navigate an existing app window to the requested route when possible.
        if ('navigate' in appClient) return appClient.navigate(target.href);
        return appClient;
      }
      return self.clients.openWindow(target.href);
    })
  );
});
