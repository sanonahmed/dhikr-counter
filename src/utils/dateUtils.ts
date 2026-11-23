import type { Language } from '../types/dhikr';

export function toLocalDayKey(dateInput: Date | number = new Date()): string {
  const d = typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(dayKey: string, deltaDays: number): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return toLocalDayKey(dt);
}

export function fromLocalDayKey(dayKey: string): Date {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatGregorianDate(date: Date, lang: Language): string {
  try {
    return new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch {
    return date.toDateString();
  }
}

export function formatHijriDate(date: Date, lang: Language): string | null {
  try {
    const locale = lang === 'bn' ? 'bn-u-ca-islamic-umalqura' : 'en-u-ca-islamic-umalqura';
    const formatted = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
    // Ensure the browser actually supports Islamic calendar rather than silently returning Gregorian year 2026
    if (formatted.includes(String(date.getFullYear()))) {
      const fallback = new Intl.DateTimeFormat('en-u-ca-islamic', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(date);
      if (fallback.includes(String(date.getFullYear()))) {
        return null;
      }
      return fallback;
    }
    return formatted;
  } catch {
    return null;
  }
}

export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function getGreetingKey(date: Date = new Date()): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = date.getHours();
  if (hour >= 4 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

export function formatTimeShort(timestamp: number, lang: Language): string {
  try {
    return new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toLocaleTimeString();
  }
}

export function formatDateTimeShort(timestamp: number, lang: Language): string {
  try {
    return new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toLocaleString();
  }
}
