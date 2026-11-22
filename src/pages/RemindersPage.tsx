import React, { useEffect, useState } from 'react';
import { Bell, BellRing, Info, Plus, Trash2 } from 'lucide-react';
import type { Language, ReminderItem } from '../types/dhikr';
import { db, generateId } from '../db/database';
import { getTranslations } from '../i18n/translations';
import { Button, Card, ConfirmDialog, EmptyState, Input, Modal, Select, Switch } from '../components/ui/Primitives';
import { cn } from '../utils/cn';
import { getNotificationPermission, requestNotificationPermission, showLocalNotification } from '../utils/notifications';

interface RemindersPageProps {
  language: Language;
  reminders: ReminderItem[];
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const PRESET_TEMPLATES: Record<
  ReminderItem['presetType'],
  { title: string; message: string; time: string }
> = {
  morning: {
    title: 'Morning Adhkar',
    message: 'Take a peaceful moment for your morning remembrance.',
    time: '06:30',
  },
  evening: {
    title: 'Evening Adhkar',
    message: 'Pause for evening remembrance and gratitude.',
    time: '18:00',
  },
  durood: {
    title: 'Daily Durood Sharif',
    message: 'Send prayers and peace upon Prophet Muhammad (peace be upon him).',
    time: '13:30',
  },
  istighfar: {
    title: 'Daily Istighfar',
    message: 'A quiet moment to seek forgiveness from Allah.',
    time: '21:00',
  },
  custom: {
    title: 'Dhikr Reminder',
    message: 'Remember Allah with a calm heart.',
    time: '09:00',
  },
};

export const RemindersPage: React.FC<RemindersPageProps> = ({ language, reminders }) => {
  const t = getTranslations(language);
  const [permission, setPermission] = useState(() => getNotificationPermission());
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [presetType, setPresetType] = useState<ReminderItem['presetType']>('morning');
  const [title, setTitle] = useState(PRESET_TEMPLATES.morning.title);
  const [message, setMessage] = useState(PRESET_TEMPLATES.morning.message);
  const [time, setTime] = useState(PRESET_TEMPLATES.morning.time);
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReminderItem | null>(null);

  useEffect(() => {
    const refreshPermission = () => setPermission(getNotificationPermission());
    window.addEventListener('focus', refreshPermission);
    document.addEventListener('visibilitychange', refreshPermission);
    return () => {
      window.removeEventListener('focus', refreshPermission);
      document.removeEventListener('visibilitychange', refreshPermission);
    };
  }, []);

  const handleRequestPermission = async () => {
    try {
      const result = await requestNotificationPermission();
      setPermission(result);
      setStatusMessage(
        result === 'granted'
          ? 'Notifications are allowed. Send a test notification to confirm your device displays them.'
          : result === 'denied'
            ? 'Notifications are blocked. Enable them for this site in your browser or device settings.'
            : 'This browser or connection does not support Web Notifications. Use HTTPS (or localhost) in a supported browser.'
      );
    } catch {
      setPermission(getNotificationPermission());
      setStatusMessage('Could not request notification permission. Check this site’s browser settings and try again.');
    }
  };

  const handleTestNotification = async () => {
    try {
      let currentPermission = getNotificationPermission();
      if (currentPermission === 'unsupported') {
        setPermission(currentPermission);
        setStatusMessage('Notifications are unavailable here. Use a supported browser on HTTPS (or localhost).');
        return;
      }

      if (currentPermission === 'default') {
        currentPermission = await requestNotificationPermission();
        setPermission(currentPermission);
      }

      if (currentPermission !== 'granted') {
        setStatusMessage(
          currentPermission === 'denied'
            ? 'Notifications are blocked for this site. Enable them in your browser/device settings, then try again.'
            : 'Notification permission was not granted. Allow notifications when your browser asks, then try again.'
        );
        return;
      }

      await showLocalNotification('Dhikr Counter', {
        body: 'Assalamu Alaikum — your local notifications are working.',
        tag: 'dhikr-counter-test',
      });
      setStatusMessage('Test notification sent to your browser. If it is not visible, check site notification settings and Do Not Disturb.');
    } catch {
      setStatusMessage('The browser could not display the notification. Check device/site notification settings and try again.');
    }
  };

  const handlePresetSelect = (type: ReminderItem['presetType']) => {
    setPresetType(type);
    const tpl = PRESET_TEMPLATES[type];
    setTitle(tpl.title);
    setMessage(tpl.message);
    setTime(tpl.time);
  };

  const toggleDay = (d: number) => {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError('Please enter a reminder title.');
      return;
    }
    if (days.length === 0) {
      setError('Select at least one day of the week.');
      return;
    }
    await db.reminders.put({
      id: generateId('rem'),
      title: title.trim(),
      message: message.trim() || 'Time for remembrance.',
      time,
      daysOfWeek: days,
      presetType,
      enabled: true,
      createdAt: Date.now(),
    });
    setModalOpen(false);
  };

  const handleToggle = async (item: ReminderItem, enabled: boolean) => {
    await db.reminders.update(item.id, { enabled });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await db.reminders.delete(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-[var(--text-primary)]">{t.reminders.title}</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">{t.reminders.subtitle}</p>
        </div>
        <Button variant="primary" onClick={() => setModalOpen(true)}>
          <Plus className="w-4 h-4" />
          {t.reminders.addReminder}
        </Button>
      </div>

      {/* Permission & Honest Browser Limitation Card */}
      <Card className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {t.reminders.permissionStatus}:{' '}
              <span className="capitalize text-[var(--accent-primary)]">{permission}</span>
            </p>
            {statusMessage && (
              <p role="status" className="text-xs text-[var(--text-secondary)]">
                {statusMessage}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {permission !== 'granted' && (
              <Button size="sm" variant="primary" onClick={() => void handleRequestPermission()}>
                <BellRing className="w-4 h-4" />
                {t.reminders.enableNotifications}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={handleTestNotification}>
              {t.reminders.testNotification}
            </Button>
          </div>
        </div>

        <div className="rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] p-3.5 flex items-start gap-2.5 text-xs text-[var(--text-secondary)] leading-relaxed">
          <Info className="w-4 h-4 text-[var(--accent-gold)] shrink-0 mt-0.5" />
          <p>{t.reminders.limitationNote}</p>
        </div>
      </Card>

      {reminders.length === 0 ? (
        <EmptyState
          icon={<Bell className="w-6 h-6" />}
          title={t.reminders.emptyTitle}
          description={t.reminders.emptyDesc}
          action={
            <Button variant="primary" onClick={() => setModalOpen(true)}>
              <Plus className="w-4 h-4" />
              {t.reminders.addReminder}
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reminders.map((rem) => (
            <Card key={rem.id} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono-num text-2xl font-bold text-[var(--text-primary)]">
                    {rem.time}
                  </p>
                  <h2 className="text-base font-semibold text-[var(--text-primary)] mt-0.5">
                    {rem.title}
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">{rem.message}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(rem)}
                  aria-label={`Delete reminder ${rem.title}`}
                  className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-red-600 hover:bg-red-500/10 cursor-pointer shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between gap-3">
                <span className="text-xs text-[var(--text-muted)]">
                  {rem.daysOfWeek.length === 7
                    ? 'Every day'
                    : rem.daysOfWeek.map((d) => DAY_LABELS[d]).join(' · ')}
                </span>
                <Switch
                  id={`rem-toggle-${rem.id}`}
                  label={rem.enabled ? 'Enabled' : 'Paused'}
                  checked={rem.enabled}
                  onChange={(checked) => void handleToggle(rem, checked)}
                />
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t.reminders.addReminder}>
        <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
          {error && (
            <div role="alert" className="rounded-xl bg-red-500/10 border border-red-500/30 px-3.5 py-2.5 text-xs text-red-600">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="rem-preset" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              Reminder Preset
            </label>
            <Select
              id="rem-preset"
              value={presetType}
              onChange={(e) => handlePresetSelect(e.target.value as ReminderItem['presetType'])}
            >
              <option value="morning">Morning Adhkar</option>
              <option value="evening">Evening Adhkar</option>
              <option value="durood">Daily Durood</option>
              <option value="istighfar">Daily Istighfar</option>
              <option value="custom">Custom Reminder</option>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="rem-title" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Title *
              </label>
              <Input
                id="rem-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="rem-time" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Time *
              </label>
              <Input
                id="rem-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="rem-msg" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              Notification Message
            </label>
            <Input
              id="rem-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <div>
            <span className="block text-xs font-medium text-[var(--text-secondary)] mb-2">Repeat Days</span>
            <div className="flex flex-wrap gap-1.5">
              {DAY_LABELS.map((lbl, idx) => {
                const active = days.includes(idx);
                return (
                  <button
                    key={lbl}
                    type="button"
                    onClick={() => toggleDay(idx)}
                    className={cn(
                      'h-9 px-3 rounded-lg text-xs font-medium cursor-pointer transition-colors',
                      active
                        ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]'
                        : 'bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-secondary)]'
                    )}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" variant="primary">
              {t.common.save}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDelete()}
        title={`Delete reminder "${deleteTarget?.title}"?`}
        description="This scheduled reminder will be removed from this device."
        confirmLabel={t.common.delete}
        cancelLabel={t.common.cancel}
        destructive
      />
    </div>
  );
};
