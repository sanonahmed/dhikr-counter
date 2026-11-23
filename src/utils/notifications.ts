export type NotificationPermissionState = NotificationPermission | 'unsupported';

export function getNotificationPermission(): NotificationPermissionState {
  if (typeof Notification === 'undefined' || !globalThis.isSecureContext) {
    return 'unsupported';
  }

  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  const currentPermission = getNotificationPermission();
  if (currentPermission === 'unsupported' || currentPermission === 'denied') {
    // Browsers will not show the native prompt again after denial; the user must
    // change this site's permission in browser/device settings first.
    return currentPermission;
  }

  return Notification.requestPermission();
}

export interface LocalNotificationOptions {
  body: string;
  tag?: string;
}

export async function showLocalNotification(
  title: string,
  { body, tag }: LocalNotificationOptions
): Promise<void> {
  const permission = getNotificationPermission();
  if (permission !== 'granted') {
    throw new Error(
      permission === 'unsupported'
        ? 'Notifications are unavailable here. Use a supported browser on a secure connection.'
        : 'Notification permission has not been granted.'
    );
  }

  // `vibrate` and `renotify` are supported by Chrome/Firefox but are missing
  // from the DOM typings.
  const options: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
    body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag,
    requireInteraction: true,
    silent: false,
    vibrate: [200, 100, 200],
    renotify: Boolean(tag),
    data: { url: '/' },
  };

  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.showNotification(title, options);
        return;
      }
    } catch {
      // Try the page notification API if service-worker notifications are unavailable.
    }
  }

  // The service-worker API is preferred for installed/mobile PWAs. This fallback
  // supports browsers that permit notifications but have no active registration.
  new Notification(title, options);
}
