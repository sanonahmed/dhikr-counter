import { useEffect, useState } from 'react';
import { db } from '../db/database';
import type { ReminderItem } from '../types/dhikr';
import { toLocalDayKey } from '../utils/dateUtils';

export function useReminderScheduler(reminders: ReminderItem[]) {
  const [activeAlert, setActiveAlert] = useState<ReminderItem | null>(null);

  useEffect(() => {
    if (reminders.length === 0) return;

    const checkReminders = () => {
      const now = new Date();
      const todayKey = toLocalDayKey(now);
      const dayOfWeek = now.getDay();
      const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      for (const rem of reminders) {
        if (!rem.enabled) continue;
        if (!rem.daysOfWeek.includes(dayOfWeek)) continue;
        if (rem.time !== currentHHMM) continue;
        if (rem.lastTriggeredDate === todayKey) continue;

        db.reminders.update(rem.id, { lastTriggeredDate: todayKey }).catch(() => {});
        setActiveAlert(rem);

        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try {
            new Notification(rem.title, {
              body: rem.message,
              icon: '/pwa-192x192.png',
              tag: rem.id,
            });
          } catch {
            // Fallback already shown via in-app alert banner
          }
        }
      }
    };

    checkReminders();
    const timer = window.setInterval(checkReminders, 20000);
    return () => window.clearInterval(timer);
  }, [reminders]);

  return {
    activeAlert,
    dismissAlert: () => setActiveAlert(null),
  };
}
