import React, { useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Info, MoonStar, Shield, X } from 'lucide-react';
import type { Language, SalahDay, SalahPrayer, SalahPrayerStatuses, SalahStatus } from '../types/dhikr';
import { db } from '../db/database';
import { getTranslations } from '../i18n/translations';
import { addDays, formatGregorianDate, fromLocalDayKey, toLocalDayKey } from '../utils/dateUtils';
import { Button, Card, Input } from '../components/ui/Primitives';
import { cn } from '../utils/cn';
import { SalahLifetimePanel } from './SalahLifetimePanel';

const PRAYERS: SalahPrayer[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const OPTIONS: SalahStatus[] = ['prayed', 'missed', 'excused'];
const blankStatuses = (): SalahPrayerStatuses => ({ fajr: undefined, dhuhr: undefined, asr: undefined, maghrib: undefined, isha: undefined });
const getStatuses = (day?: SalahDay): SalahPrayerStatuses => ({ ...blankStatuses(), ...(day?.statuses ?? {}) });

function formatDay(dayKey: string, language: Language): string {
  try {
    return new Intl.DateTimeFormat(language === 'bn' ? 'bn-BD' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(fromLocalDayKey(dayKey));
  } catch { return dayKey; }
}

function dotColor(status?: SalahStatus): string {
  if (status === 'prayed') return 'bg-[var(--accent-primary)]';
  if (status === 'missed') return 'bg-red-500';
  if (status === 'excused') return 'bg-[var(--accent-gold)]';
  return 'bg-[var(--border-strong)]';
}

function optionStyle(status: SalahStatus, active: boolean): string {
  if (!active) return 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:bg-[var(--accent-soft)]';
  if (status === 'prayed') return 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]';
  if (status === 'missed') return 'border-red-600 bg-red-600 text-white';
  return 'border-[var(--accent-gold)] bg-[var(--accent-gold)] text-white';
}

interface SalahTrackerPageProps { language: Language; salahDays: SalahDay[] }

export const SalahTrackerPage: React.FC<SalahTrackerPageProps> = ({ language, salahDays }) => {
  const t = getTranslations(language);
  const todayKey = toLocalDayKey();
  const [selectedDay, setSelectedDay] = useState(todayKey);
  const [savingPrayer, setSavingPrayer] = useState<SalahPrayer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const daysByKey = new Map(salahDays.map((day) => [day.id, day]));
  const statuses = getStatuses(daysByKey.get(selectedDay));
  const prayedCount = PRAYERS.filter((prayer) => statuses[prayer] === 'prayed').length;
  const historyKeys = Array.from({ length: 7 }, (_, i) => addDays(todayKey, i - 6));
  const completeDays = historyKeys.filter((key) => PRAYERS.every((prayer) => getStatuses(daysByKey.get(key))[prayer] === 'prayed')).length;
  const recordedToday = PRAYERS.filter((prayer) => statuses[prayer] !== undefined).length;

  const changeStatus = async (prayer: SalahPrayer, status: SalahStatus) => {
    if (savingPrayer) return;
    setSavingPrayer(prayer);
    setError(null);
    try {
      const existing = await db.salahDays.get(selectedDay);
      const nextStatuses = getStatuses(existing);
      nextStatuses[prayer] = nextStatuses[prayer] === status ? undefined : status;
      const now = Date.now();
      if (Object.values(nextStatuses).some(Boolean)) {
        await db.salahDays.put({ id: selectedDay, statuses: nextStatuses, createdAt: existing?.createdAt ?? now, updatedAt: now });
      } else if (existing) {
        await db.salahDays.delete(selectedDay);
      }
    } catch { setError(t.salah.saveError); }
    finally { setSavingPrayer(null); }
  };

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-[1.5rem] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 py-5 shadow-[var(--shadow-card)] sm:px-7 sm:py-6">
        <span aria-hidden="true" className="pointer-events-none absolute -right-8 -top-16 h-48 w-48 rounded-full border border-[var(--accent-gold)]/15" /><span aria-hidden="true" className="pointer-events-none absolute -right-1 -top-9 h-32 w-32 rounded-full border border-dashed border-[var(--accent-primary)]/15" />
        <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--accent-gold)]/25 bg-[var(--accent-gold-soft)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.17em] text-[var(--accent-gold)]"><MoonStar className="h-3.5 w-3.5" aria-hidden="true" />{t.salah.lifetimePrivate}</span>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">{t.salah.title}</h1>
            <p className="mt-1.5 text-sm text-[var(--text-secondary)]">{t.salah.subtitle}</p>
          </div>
          <div className="relative flex flex-wrap items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-3 py-2 text-[11px] font-medium text-[var(--accent-primary)] sm:inline-flex"><Check className="h-3.5 w-3.5" />{recordedToday}/5 {t.salah.prayersMarked}</span>
          <Button variant="outline" size="icon" onClick={() => setSelectedDay(addDays(selectedDay, -1))} aria-label={t.salah.previousDay}><ChevronLeft className="w-4 h-4" /></Button>
          <Input type="date" value={selectedDay} max={todayKey} aria-label={t.salah.pickDate} onChange={(e) => { if (e.target.value && e.target.value <= todayKey) setSelectedDay(e.target.value); }} className="w-[148px]" />
          <Button variant="outline" size="icon" onClick={() => setSelectedDay(addDays(selectedDay, 1))} disabled={selectedDay >= todayKey} aria-label={t.salah.nextDay}><ChevronRight className="w-4 h-4" /></Button>
          {selectedDay !== todayKey && <Button variant="ghost" size="sm" onClick={() => setSelectedDay(todayKey)}>{t.salah.today}</Button>}
        </div>
      </div>
      </div>
      {error && <div role="alert" className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-600">{error}</div>}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <Card className="lg:col-span-2 p-0 overflow-hidden">
          <div className="px-5 pt-5 pb-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-[var(--text-primary)]">{selectedDay === todayKey ? t.salah.today : formatDay(selectedDay, language)}</h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{formatGregorianDate(fromLocalDayKey(selectedDay), language)}</p>
              </div>
              <div className="text-right shrink-0"><p className="text-xs text-[var(--text-muted)]">{t.salah.dailyProgress}</p><p className="text-xl font-semibold font-mono-num text-[var(--text-primary)] mt-0.5">{prayedCount} <span className="text-xs font-normal text-[var(--text-muted)]">{t.salah.ofFive}</span></p></div>
            </div>
            <div className="h-2.5 w-full rounded-full bg-[var(--bg-surface-muted)] overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={5} aria-valuenow={prayedCount} aria-label={t.salah.dailyProgress}>
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${prayedCount * 20}%`, backgroundColor: prayedCount === 5 ? 'var(--accent-gold)' : 'var(--accent-primary)' }} />
            </div>
            <p className="text-xs text-[var(--text-muted)]">{t.salah.recordHint} {t.counter.savedLocally}</p>
          </div>
          <div className="border-t border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
            {PRAYERS.map((prayer) => {
              const status = statuses[prayer];
              const iconClass = status === 'prayed' ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]' : status === 'missed' ? 'border-red-500/30 bg-red-500/10 text-red-600' : status === 'excused' ? 'border-[var(--border-strong)] bg-[var(--bg-surface-muted)] text-[var(--text-secondary)]' : 'border-[var(--border-strong)] text-[var(--text-muted)]';
              return (
                <div key={prayer} className="px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={cn('h-8 w-8 rounded-full border inline-flex items-center justify-center shrink-0', iconClass)} aria-hidden="true">
                      {status === 'prayed' ? <Check className="w-4 h-4" /> : status === 'missed' ? <X className="w-4 h-4" /> : status === 'excused' ? <Shield className="w-4 h-4" /> : <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-muted)]" />}
                    </span>
                    <div className="min-w-0"><p className="text-sm font-semibold text-[var(--text-primary)]">{t.salah.prayers[prayer]}</p><p className="text-[11px] text-[var(--text-muted)]">{status ? t.salah.statuses[status] : t.salah.statuses.unrecorded}</p></div>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 sm:flex sm:items-center" role="group" aria-label={t.salah.prayers[prayer]}>
                    {OPTIONS.map((option) => <button key={option} type="button" onClick={() => void changeStatus(prayer, option)} aria-pressed={status === option} disabled={savingPrayer === prayer} className={cn('min-h-[36px] px-2.5 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:pointer-events-none', optionStyle(option, status === option))}>{t.salah.statuses[option]}</button>)}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2"><CalendarDays className="w-4 h-4 text-[var(--accent-primary)]" aria-hidden="true" />{t.salah.weekTitle}</h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">{t.salah.weekSubtitle}</p>
          </div>
          <div className="space-y-2">
            {historyKeys.map((dayKey) => {
              const dayStatuses = getStatuses(daysByKey.get(dayKey));
              const count = PRAYERS.filter((prayer) => dayStatuses[prayer] === 'prayed').length;
              const marked = PRAYERS.filter((prayer) => dayStatuses[prayer] !== undefined).length;
              const complete = count === PRAYERS.length;
              return (
                <button key={dayKey} type="button" onClick={() => setSelectedDay(dayKey)} aria-pressed={dayKey === selectedDay} className={cn('w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border text-left transition-colors cursor-pointer', dayKey === selectedDay ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]' : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--accent-soft)]')}>
                  <span className="min-w-0"><span className="block text-sm font-medium text-[var(--text-primary)] truncate">{formatDay(dayKey, language)}</span><span className="block text-[11px] text-[var(--text-muted)]">{dayKey === todayKey ? t.salah.today : complete ? t.salah.complete : `${marked}/5 ${t.salah.prayersMarked}`}</span></span>
                  <span className="flex items-center gap-1 shrink-0" aria-hidden="true">{PRAYERS.map((prayer) => <span key={prayer} className={cn('h-2.5 w-2.5 rounded-full', dotColor(dayStatuses[prayer]))} />)}</span>
                </button>
              );
            })}
          </div>
          <div className="pt-3 border-t border-[var(--border-subtle)]"><p className="text-xs text-[var(--text-muted)]">{completeDays}/7 {t.salah.daysComplete}</p></div>
        </Card>
      </div>
      <SalahLifetimePanel language={language} salahDays={salahDays} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
      <p className="text-xs text-[var(--text-muted)] flex items-start gap-2 leading-relaxed"><Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" /><span>{t.salah.personalNote}</span></p>
    </div>
  );
};
