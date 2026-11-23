import React, { useMemo, useState } from 'react';
import { Archive, Award, CalendarDays, Check, ChevronDown, Clock3, MoonStar, Sparkles } from 'lucide-react';
import type { Language, SalahDay, SalahPrayer } from '../types/dhikr';
import { addDays, fromLocalDayKey, toLocalDayKey } from '../utils/dateUtils';
import { getTranslations } from '../i18n/translations';
import { cn } from '../utils/cn';

const PRAYERS: SalahPrayer[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const hasRecord = (day: SalahDay) => PRAYERS.some((prayer) => day.statuses?.[prayer]);
const isComplete = (day?: SalahDay) => PRAYERS.every((prayer) => day?.statuses?.[prayer] === 'prayed');

function formatDate(key: string, language: Language, full = false) {
  try {
    return new Intl.DateTimeFormat(language === 'bn' ? 'bn-BD' : 'en-US', {
      ...(full ? { weekday: 'long' as const } : { weekday: 'short' as const }),
      month: full ? 'long' : 'short', day: 'numeric', ...(full ? { year: 'numeric' as const } : {}),
    }).format(fromLocalDayKey(key));
  } catch { return key; }
}

function longestStreak(keys: string[]) {
  const ordered = [...new Set(keys)].sort();
  let best = 0, run = 0, previous = '';
  for (const key of ordered) {
    run = previous && addDays(previous, 1) === key ? run + 1 : 1;
    best = Math.max(best, run);
    previous = key;
  }
  return best;
}

interface Props { language: Language; salahDays: SalahDay[]; selectedDay: string; onSelectDay: (key: string) => void }

export const SalahLifetimePanel: React.FC<Props> = ({ language, salahDays, selectedDay, onSelectDay }) => {
  const t = getTranslations(language);
  const [showAll, setShowAll] = useState(false);
  const { daysByKey, recorded, completeKeys, prayedCount, markedCount, bestStreak, calendarDays } = useMemo(() => {
    const today = toLocalDayKey();
    const daysByKey = new Map(salahDays.map((day) => [day.id, day]));
    const recorded = salahDays.filter((day) => day.id <= today && hasRecord(day)).sort((a, b) => b.id.localeCompare(a.id));
    const completeKeys = recorded.filter(isComplete).map((day) => day.id);
    const prayedCount = recorded.reduce((sum, day) => sum + PRAYERS.filter((prayer) => day.statuses?.[prayer] === 'prayed').length, 0);
    const markedCount = recorded.reduce((sum, day) => sum + PRAYERS.filter((prayer) => Boolean(day.statuses?.[prayer])).length, 0);
    const bestStreak = longestStreak(completeKeys);
    const calendarDays = Array.from({ length: 365 }, (_, index) => addDays(today, index - 364));
    return { daysByKey, recorded, completeKeys, prayedCount, markedCount, bestStreak, calendarDays };
  }, [salahDays]);
  const visibleRecords = showAll ? recorded : recorded.slice(0, 8);
  const locale = language === 'bn' ? 'bn-BD' : 'en-US';
  const fmt = (value: number) => new Intl.NumberFormat(locale).format(value);
  const calendarStart = addDays(calendarDays[0], -fromLocalDayKey(calendarDays[0]).getDay());
  const calendarWeeks = Array.from({ length: 53 }, (_, weekIndex) =>
    Array.from({ length: 7 }, (_, weekdayIndex) => {
      const dayKey = addDays(calendarStart, weekIndex * 7 + weekdayIndex);
      return dayKey >= calendarDays[0] && dayKey <= calendarDays[calendarDays.length - 1] ? dayKey : null;
    }),
  );
  const weekdayLabels = Array.from({ length: 7 }, (_, weekdayIndex) =>
    new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(fromLocalDayKey(addDays(calendarStart, weekdayIndex))),
  );
  const monthLabels = calendarWeeks.map((week, weekIndex) => {
    const firstOfMonth = week.find((dayKey) => dayKey && fromLocalDayKey(dayKey).getDate() === 1);
    const labelDay = firstOfMonth ?? (weekIndex === 0 ? calendarDays[0] : null);
    return labelDay ? new Intl.DateTimeFormat(locale, { month: 'short' }).format(fromLocalDayKey(labelDay)) : '';
  });
  const mobileMonths = Array.from({ length: 12 }, (_, monthIndex) => {
    const monthDate = fromLocalDayKey(calendarDays[calendarDays.length - 1]);
    monthDate.setDate(1);
    monthDate.setMonth(monthDate.getMonth() - (11 - monthIndex));
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthStart = toLocalDayKey(new Date(year, month, 1));
    const cells: (string | null)[] = Array.from({ length: monthDate.getDay() + daysInMonth }, (_, cellIndex) => {
      if (cellIndex < monthDate.getDay()) return null;
      const dayKey = toLocalDayKey(new Date(year, month, cellIndex - monthDate.getDay() + 1));
      return dayKey >= calendarDays[0] && dayKey <= calendarDays[calendarDays.length - 1] ? dayKey : null;
    });
    return {
      id: monthStart,
      label: new Intl.DateTimeFormat(locale, { month: 'short' }).format(monthDate),
      cells,
    };
  });
  const mobileWeekdayLabels = Array.from({ length: 7 }, (_, weekdayIndex) =>
    new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(fromLocalDayKey(addDays(calendarDays[calendarDays.length - 1], -fromLocalDayKey(calendarDays[calendarDays.length - 1]).getDay() + weekdayIndex))),
  );

  return (
    <section className="space-y-4" aria-label={t.salah.lifetimeTitle}>
      <div className="relative overflow-hidden rounded-[1.65rem] border border-[#c8a65b]/20 bg-[#102d24] px-5 py-6 text-white shadow-[0_22px_58px_-30px_rgba(7,37,26,0.58)] sm:px-8 sm:py-8">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-70" style={{ backgroundImage: 'radial-gradient(ellipse at 84% 16%, rgba(194,158,88,.23), transparent 34%), radial-gradient(ellipse at 6% 100%, rgba(35,114,78,.36), transparent 42%), repeating-linear-gradient(135deg, transparent 0 34px, rgba(231,211,163,.035) 35px 36px, transparent 37px 70px)' }} />
        <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-16 flex h-52 w-52 items-center justify-center rounded-full border border-[#d3b875]/15"><span className="h-36 w-36 rounded-full border border-[#d3b875]/20" /><span className="absolute h-24 w-24 rounded-full border border-dashed border-[#d3b875]/25" /></div>
        <div className="relative flex flex-col justify-between gap-7 sm:flex-row sm:items-end">
          <div className="max-w-xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#dfc17a]/25 bg-white/[0.06] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.19em] text-[#e6ca8d]"><MoonStar className="h-3.5 w-3.5" aria-hidden="true" />{t.salah.lifetimeEyebrow}</div>
            <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight sm:text-[2.6rem]">{t.salah.lifetimeTitle}</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-[#d0ddd5]/80">{t.salah.lifetimeSubtitle}</p>
          </div>
          <div className="flex min-w-[132px] items-center gap-3 self-start rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 sm:self-auto"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#e1c27b]/20 bg-[#d2b46d]/10 text-[#e8ca87]"><Sparkles className="h-5 w-5" aria-hidden="true" /></span><div><p className="font-mono-num text-2xl font-semibold leading-none tabular-nums">{fmt(prayedCount)}</p><p className="mt-1 text-[10px] font-medium text-[#d0ddd5]/70">{t.salah.lifetimePrayers}</p></div></div>
        </div>
        <div className="relative mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-4 text-xs text-[#d0ddd5]/75"><span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#d5b76e]" />{t.salah.lifetimePrivate}</span><span>{fmt(markedCount)} {t.salah.lifetimeCheckIns}</span><span>{recorded.length ? `${t.salah.since} ${formatDate(recorded[recorded.length - 1].id, language)}` : t.salah.lifetimeStartHint}</span></div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: t.salah.lifetimePrayers, value: prayedCount, icon: Check, accent: 'text-[var(--accent-primary)] bg-[var(--accent-soft)]' },
          { label: t.salah.lifetimeRecordedDays, value: recorded.length, icon: CalendarDays, accent: 'text-sky-700 bg-sky-500/10' },
          { label: t.salah.lifetimeCompleteDays, value: completeKeys.length, icon: Award, accent: 'text-[var(--accent-gold)] bg-[var(--accent-gold-soft)]' },
          { label: t.salah.lifetimeBestStreak, value: bestStreak, icon: Clock3, accent: 'text-violet-700 bg-violet-500/10' },
        ].map(({ label, value, icon: Icon, accent }) => <div key={label} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[0_5px_20px_-14px_rgba(15,40,30,0.28)] sm:p-5"><span className={cn('mb-4 inline-flex h-9 w-9 items-center justify-center rounded-xl', accent)}><Icon className="h-[17px] w-[17px]" aria-hidden="true" /></span><p className="font-mono-num text-[1.65rem] font-semibold tracking-tight text-[var(--text-primary)] tabular-nums">{fmt(value)}</p><p className="mt-1 text-[11px] font-medium leading-4 text-[var(--text-muted)]">{label}</p></div>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-card)] sm:p-6">
          <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-[var(--text-primary)]">{t.salah.activityTitle}</h3><p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{t.salah.activitySubtitle}</p></div><span className="shrink-0 rounded-lg bg-[var(--accent-soft)] px-2.5 py-1.5 text-[10px] font-semibold text-[var(--accent-primary)]">{t.salah.pastYear}</span></div>
          <div className="mt-5 hidden overflow-x-auto pb-2 md:block" role="group" aria-label={t.salah.activityTitle}>
            <div className="grid min-w-[600px] gap-x-[3px] gap-y-1" style={{ gridTemplateColumns: '16px repeat(53, minmax(0, 1fr))' }}>
              <span aria-hidden="true" />
              {monthLabels.map((month, weekIndex) => <span key={`month-${weekIndex}`} className="relative h-4 overflow-visible text-[9px] leading-3 text-[var(--text-muted)]">{month && <span className="absolute left-0 whitespace-nowrap">{month}</span>}</span>)}
              {weekdayLabels.flatMap((label, weekdayIndex) => [
                <span key={`weekday-${weekdayIndex}`} className="flex h-3.5 items-center text-[9px] leading-none text-[var(--text-muted)]">{weekdayIndex % 2 === 0 ? label : ''}</span>,
                ...calendarWeeks.map((week, weekIndex) => {
                  const dayKey = week[weekdayIndex];
                  if (!dayKey) return <span key={`empty-${weekIndex}-${weekdayIndex}`} className="mx-auto aspect-square w-full max-w-[11px]" aria-hidden="true" />;
                  const day = daysByKey.get(dayKey);
                  const count = PRAYERS.filter((prayer) => day?.statuses?.[prayer] === 'prayed').length;
                  const marked = PRAYERS.filter((prayer) => Boolean(day?.statuses?.[prayer])).length;
                  const color = !marked ? 'bg-[var(--bg-surface-muted)]' : count === 5 ? 'bg-[var(--accent-gold)]' : count >= 3 ? 'bg-[var(--accent-primary)]' : count > 0 ? 'bg-[var(--accent-primary)]/55' : 'bg-red-400/70';
                  const labelText = `${formatDate(dayKey, language, true)} · ${fmt(count)}/5 ${t.salah.lifetimePrayersShort}`;
                  return <button key={dayKey} type="button" title={labelText} aria-label={labelText} aria-pressed={selectedDay === dayKey} onClick={() => onSelectDay(dayKey)} className={cn('mx-auto aspect-square w-full max-w-[11px] rounded-[3px] transition-transform hover:scale-125 hover:ring-2 hover:ring-[var(--accent-primary)]/50', color, selectedDay === dayKey && 'ring-2 ring-[var(--accent-gold)] ring-offset-1')} />;
                }),
              ])}
            </div>
          </div>
          <div className="mt-4 space-y-3 md:hidden" role="group" aria-label={t.salah.activityTitle}>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-[var(--text-muted)]" aria-hidden="true">
              {mobileWeekdayLabels.map((label, index) => <span key={`mobile-weekday-${index}`}>{label}</span>)}
            </div>
            {mobileMonths.map((month) => (
              <div key={month.id} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/60 p-3">
                <h4 className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">{month.label}</h4>
                <div className="grid grid-cols-7 gap-1">
                  {month.cells.map((dayKey, cellIndex) => {
                    if (!dayKey) return <span key={`mobile-empty-${month.id}-${cellIndex}`} className="mx-auto h-8 w-8 max-w-full" aria-hidden="true" />;
                    const day = daysByKey.get(dayKey);
                    const count = PRAYERS.filter((prayer) => day?.statuses?.[prayer] === 'prayed').length;
                    const marked = PRAYERS.filter((prayer) => Boolean(day?.statuses?.[prayer])).length;
                    const color = !marked ? 'bg-[var(--bg-surface-muted)]' : count === 5 ? 'bg-[var(--accent-gold)]' : count >= 3 ? 'bg-[var(--accent-primary)]' : count > 0 ? 'bg-[var(--accent-primary)]/55' : 'bg-red-400/70';
                    const labelText = `${formatDate(dayKey, language, true)} · ${fmt(count)}/5 ${t.salah.lifetimePrayersShort}`;
                    return <button key={dayKey} type="button" title={labelText} aria-label={labelText} aria-pressed={selectedDay === dayKey} onClick={() => onSelectDay(dayKey)} className={cn('mx-auto flex h-8 w-8 max-w-full items-center justify-center rounded-lg text-[11px] font-medium tabular-nums text-[var(--text-primary)] transition-transform active:scale-95', color, selectedDay === dayKey && 'ring-2 ring-[var(--accent-gold)] ring-offset-1')}><span>{fromLocalDayKey(dayKey).getDate()}</span></button>;
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[10px] text-[var(--text-muted)]"><span>{fmt(recorded.filter((day) => calendarDays[0] <= day.id).length)} {t.salah.activityRecordedDays}</span><span className="inline-flex items-center gap-1.5"><span>{t.salah.less}</span>{['bg-[var(--bg-surface-muted)]', 'bg-[var(--accent-primary)]/45', 'bg-[var(--accent-primary)]', 'bg-[var(--accent-gold)]'].map((color) => <span key={color} className={cn('h-[10px] w-[10px] rounded-[3px]', color)} />)}<span>{t.salah.more}</span></span></div>
          <p className="mt-4 border-t border-[var(--border-subtle)] pt-3 text-[10px] leading-relaxed text-[var(--text-muted)]">{t.salah.heatmapHint}</p>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-card)] sm:p-6">
          <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-gold-soft)] text-[var(--accent-gold)]"><Archive className="h-4 w-4" aria-hidden="true" /></span><div><h3 className="text-sm font-semibold text-[var(--text-primary)]">{t.salah.archiveTitle}</h3><p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{t.salah.archiveSubtitle}</p></div></div>
          {recorded.length === 0 ? <div className="flex min-h-44 flex-col items-center justify-center px-2 text-center"><span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-primary)]"><MoonStar className="h-5 w-5" /></span><h4 className="text-sm font-semibold text-[var(--text-primary)]">{t.salah.archiveEmptyTitle}</h4><p className="mt-1.5 max-w-xs text-xs leading-5 text-[var(--text-muted)]">{t.salah.archiveEmptyDesc}</p></div> : (
            <>
              <div className="mt-4 space-y-1.5">
                {visibleRecords.map((day) => {
                  const count = PRAYERS.filter((prayer) => day.statuses?.[prayer] === 'prayed').length;
                  const marked = PRAYERS.filter((prayer) => Boolean(day.statuses?.[prayer])).length;
                  return <button key={day.id} type="button" aria-pressed={selectedDay === day.id} onClick={() => onSelectDay(day.id)} className={cn('flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors', selectedDay === day.id ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]' : 'border-transparent hover:border-[var(--border-subtle)] hover:bg-[var(--bg-canvas)]')}><span className="min-w-0"><span className="block truncate text-xs font-semibold text-[var(--text-primary)]">{formatDate(day.id, language, true)}</span><span className="mt-0.5 block text-[10px] text-[var(--text-muted)]">{isComplete(day) ? t.salah.complete : `${fmt(marked)}/5 ${t.salah.prayersMarked}`}</span></span><span className="flex shrink-0 items-center gap-1"><span className="font-mono-num text-sm font-semibold tabular-nums text-[var(--text-primary)]">{fmt(count)}<span className="ml-0.5 text-[10px] font-normal text-[var(--text-muted)]">/5</span></span><span className="text-[10px] text-[var(--text-muted)]">{selectedDay === day.id ? t.salah.selected : ''}</span></span></button>;
                })}
              </div>
              {recorded.length > 8 && <button type="button" onClick={() => setShowAll((value) => !value)} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--accent-soft)]">{showAll ? t.salah.showRecentRecords : `${t.salah.viewAllRecords} \u00b7 ${fmt(recorded.length)}`}<ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showAll && 'rotate-180')} /></button>}
            </>
          )}
        </div>
      </div>
    </section>
  );
};
