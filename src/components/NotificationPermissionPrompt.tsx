import React, { useEffect, useState } from 'react';
import { BellOff, BellRing } from 'lucide-react';
import type { Language } from '../types/dhikr';
import { getTranslations } from '../i18n/translations';
import { Button, Modal } from './ui/Primitives';
import {
  getNotificationPermission,
  requestNotificationPermission,
  type NotificationPermissionState,
} from '../utils/notifications';
import { hasOptedOutOfPushNotifications, registerPushDevice } from '../utils/pushNotifications';

interface NotificationPermissionPromptProps {
  language: Language;
}

/**
 * First-visit explainer and re-enable prompt. The browser's native permission
 * prompt only opens after a user tap, and a blocked permission cannot be
 * requested again until the user changes browser/device settings.
 */
export const NotificationPermissionPrompt: React.FC<NotificationPermissionPromptProps> = ({ language }) => {
  const t = getTranslations(language);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermissionState>(() => getNotificationPermission());

  useEffect(() => {
    const currentPermission = getNotificationPermission();
    setPermission(currentPermission);
    const needsPermission = currentPermission === 'default';
    const optedOutAfterGrant = currentPermission === 'granted' && hasOptedOutOfPushNotifications();
    if (needsPermission || optedOutAfterGrant || currentPermission === 'denied') {
      setOpen(true);
    }
  }, []);

  const checkPermission = async () => {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      let currentPermission = getNotificationPermission();
      if (currentPermission === 'default') currentPermission = await requestNotificationPermission();
      setPermission(currentPermission);
      if (currentPermission === 'granted') {
        await registerPushDevice({ userInitiated: true });
        setOpen(false);
      } else if (currentPermission === 'denied') {
        setFeedback(t.reminders.permissionStillBlocked);
      }
    } catch {
      // The Reminders page provides detailed permission and service diagnostics.
    } finally {
      setBusy(false);
    }
  };

  const blocked = permission === 'denied';
  const optedOut = permission === 'granted' && hasOptedOutOfPushNotifications();
  const title = blocked
    ? t.reminders.permissionBlockedHelp
    : optedOut
      ? t.reminders.permissionReenableTitle
      : t.reminders.permissionWelcomeTitle;
  const body = blocked
    ? t.reminders.permissionBlockedInstructions
    : optedOut
      ? t.reminders.permissionReenableBody
      : t.reminders.permissionWelcomeBody;

  return (
    <Modal open={open} onClose={() => setOpen(false)} title={title} maxWidthClass="max-w-md">
      <div className="space-y-4 text-sm text-[var(--text-secondary)]">
        <div className="flex items-start gap-3">
          {blocked ? (
            <BellOff className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent-gold)]" />
          ) : (
            <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent-primary)]" />
          )}
          <p className="leading-relaxed">{body}</p>
        </div>
        {feedback && (
          <p role="status" className="text-xs text-[var(--accent-gold)]">
            {feedback}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          {blocked ? (
            <>
              <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
                {t.common.close}
              </Button>
              {permission === 'denied' && (
                <Button variant="primary" disabled={busy} onClick={() => void checkPermission()}>
                  <BellRing className="h-4 w-4" />
                  {t.reminders.checkPermissionAgain}
                </Button>
              )}
            </>
          ) : (
            <>
              <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
                {t.reminders.notNow}
              </Button>
              <Button variant="primary" disabled={busy} onClick={() => void checkPermission()}>
                <BellRing className="h-4 w-4" />
                {busy ? '...' : t.reminders.allowNotifications}
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
};
