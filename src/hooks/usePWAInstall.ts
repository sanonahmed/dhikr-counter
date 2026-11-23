import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { registerPushDevice } from '../utils/pushNotifications';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    let serviceWorkerRegistration: ServiceWorkerRegistration | undefined;
    const checkForUpdates = () => {
      if (navigator.onLine) {
        void serviceWorkerRegistration?.update().catch(() => {
          // The next focus, online event, or periodic check will retry.
        });
      }
    };

    // Devices that already allowed notifications re-register on every launch,
    // so the server's broadcast list repopulates after a restart or redeploy.
    // registerPushDevice() does nothing until permission is granted.
    void registerPushDevice();

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    const handleOnline = () => {
      setIsOnline(true);
      checkForUpdates();
    };
    const handleOffline = () => setIsOnline(false);
    const handleFocus = () => checkForUpdates();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkForUpdates();
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const updateCheckInterval = window.setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);

    try {
      registerSW({
        immediate: true,
        onRegisteredSW(_serviceWorkerUrl, registration) {
          serviceWorkerRegistration = registration;
        },
        onRegisterError() {
          // Graceful fallback in restricted iframes or unsupported browsers.
        },
      });
    } catch {
      // Service worker registration skipped if unsupported.
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(updateCheckInterval);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    isOnline,
    install,
  };
}
