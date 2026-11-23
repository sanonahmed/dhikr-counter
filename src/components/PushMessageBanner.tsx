import React, { useEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import type { Language } from '../types/dhikr';
import { getTranslations } from '../i18n/translations';

interface PushMessageBannerProps {
  language: Language;
}

interface PushMessage {
  title: string;
  body: string;
  tag?: string;
}

/**
 * In-app copy of a Web Push message. The service worker posts this while an app
 * window is open, so the message is visible on screen even when the operating
 * system suppresses the native heads-up banner.
 */
export const PushMessageBanner: React.FC<PushMessageBannerProps> = ({ language }) => {
  const t = getTranslations(language);
  const [message, setMessage] = useState<PushMessage | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const clearTimer = () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };

    const handleMessage = (event: MessageEvent) => {
      const data = event.data as Record<string, unknown> | null;
      if (!data || data.type !== 'PUSH_NOTIFICATION') return;
      const title = typeof data.title === 'string' ? data.title.trim().slice(0, 120) : '';
      const body = typeof data.body === 'string' ? data.body.trim().slice(0, 400) : '';
      if (!title && !body) return;
      setMessage({
        title: title || t.appName,
        body,
        tag: typeof data.tag === 'string' ? data.tag : undefined,
      });
      clearTimer();
      timer.current = window.setTimeout(() => setMessage(null), 10_000);
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
      clearTimer();
    };
  }, [t.appName]);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-16 lg:top-4 right-4 left-4 sm:left-auto z-50 sm:max-w-sm rounded-2xl bg-[var(--bg-surface)] border border-[var(--accent-gold)] p-4 shadow-xl flex items-start gap-3"
    >
      <Bell className="w-5 h-5 text-[var(--accent-gold)] shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{message.title}</p>
        {message.body && (
          <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">{message.body}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => setMessage(null)}
        aria-label={t.common.close}
        className="h-7 w-7 inline-flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--accent-soft)] cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
