import type { CountingSession, DhikrCategory, GoalItem } from '../types/dhikr';
import { addDays, toLocalDayKey } from './dateUtils';

export type DateRangePreset = 'today' | 'yesterday' | 'last7' | 'last30' | 'thisYear' | 'custom';

export interface DateRangeBounds {
  startDayKey: string;
  endDayKey: string;
}

/**
 * Deduplicate sessions by id to ensure the same session is never counted twice in analytics.
 */
export function deduplicateSessions(sessions: CountingSession[]): CountingSession[] {
  const map = new Map<string, CountingSession>();
  for (const s of sessions) {
    const existing = map.get(s.id);
    if (!existing || s.lastUpdatedAt >= existing.lastUpdatedAt) {
      map.set(s.id, s);
    }
  }
  return Array.from(map.values());
}

export function getSessionNetCount(session: CountingSession): number {
  return Math.max(0, session.finalCount - session.startingCount);
}

export function resolveDateRange(
  preset: DateRangePreset,
  todayKey: string,
  customStart?: string,
  customEnd?: string
): DateRangeBounds {
  switch (preset) {
    case 'today':
      return { startDayKey: todayKey, endDayKey: todayKey };
    case 'yesterday': {
      const y = addDays(todayKey, -1);
      return { startDayKey: y, endDayKey: y };
    }
    case 'last7':
      return { startDayKey: addDays(todayKey, -6), endDayKey: todayKey };
    case 'last30':
      return { startDayKey: addDays(todayKey, -29), endDayKey: todayKey };
    case 'thisYear':
      return { startDayKey: `${todayKey.slice(0, 4)}-01-01`, endDayKey: todayKey };
    case 'custom': {
      const start = customStart && customStart <= todayKey ? customStart : addDays(todayKey, -6);
      const end = customEnd && customEnd >= start ? customEnd : todayKey;
      return { startDayKey: start, endDayKey: end };
    }
  }
}

export function filterSessionsByRange(
  sessions: CountingSession[],
  bounds: DateRangeBounds
): CountingSession[] {
  const unique = deduplicateSessions(sessions);
  return unique.filter(
    (s) => s.dayKey >= bounds.startDayKey && s.dayKey <= bounds.endDayKey
  );
}

export function computeStreaks(sessions: CountingSession[], todayKey: string): {
  currentStreak: number;
  longestStreak: number;
} {
  const unique = deduplicateSessions(sessions);
  const activeDays = new Set<string>();
  for (const s of unique) {
    if (getSessionNetCount(s) > 0) {
      activeDays.add(s.dayKey);
    }
  }

  if (activeDays.size === 0) {
    return { currentStreak: 0, longestStreak: 0 };
  }

  // Current streak: count backwards from today (or yesterday if today hasn't started yet)
  let currentStreak = 0;
  let cursor = activeDays.has(todayKey) ? todayKey : addDays(todayKey, -1);
  if (activeDays.has(cursor)) {
    while (activeDays.has(cursor)) {
      currentStreak += 1;
      cursor = addDays(cursor, -1);
    }
  }

  // Longest streak across all sorted active days
  const sortedDays = Array.from(activeDays).sort();
  let longestStreak = 0;
  let run = 0;
  let prevDay: string | null = null;
  for (const day of sortedDays) {
    if (prevDay && addDays(prevDay, 1) === day) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > longestStreak) longestStreak = run;
    prevDay = day;
  }

  return { currentStreak, longestStreak };
}

export interface AnalyticsSummary {
  lifetimeTotal: number;
  totalDurood: number;
  totalIstighfar: number;
  totalTasbih: number;
  totalDailyAdhkar: number;
  totalCustom: number;
  todayTotal: number;
  thisWeekTotal: number;
  thisMonthTotal: number;
  averageDailyCount: number;
  currentStreak: number;
  longestStreak: number;
  personalBestCount: number;
  personalBestDay: string | null;
  mostUsedDhikr: { name: string; count: number } | null;
  categoryTotals: Record<DhikrCategory, number>;
}

export function computeAnalyticsSummary(
  rawSessions: CountingSession[],
  todayDate: Date = new Date()
): AnalyticsSummary {
  const sessions = deduplicateSessions(rawSessions);
  const todayKey = toLocalDayKey(todayDate);
  const weekStartKey = addDays(todayKey, -6);
  const monthPrefix = todayKey.slice(0, 7);

  let lifetimeTotal = 0;
  let todayTotal = 0;
  let thisWeekTotal = 0;
  let thisMonthTotal = 0;

  const categoryTotals: Record<DhikrCategory, number> = {
    durood: 0,
    istighfar: 0,
    tasbih: 0,
    daily_adhkar: 0,
    custom: 0,
  };

  const perDay = new Map<string, number>();
  const perDhikr = new Map<string, { name: string; count: number }>();

  for (const s of sessions) {
    const count = getSessionNetCount(s);
    if (count <= 0) continue;

    lifetimeTotal += count;
    categoryTotals[s.category] = (categoryTotals[s.category] || 0) + count;

    if (s.dayKey === todayKey) todayTotal += count;
    if (s.dayKey >= weekStartKey && s.dayKey <= todayKey) thisWeekTotal += count;
    if (s.dayKey.startsWith(monthPrefix)) thisMonthTotal += count;

    perDay.set(s.dayKey, (perDay.get(s.dayKey) || 0) + count);

    const prev = perDhikr.get(s.dhikrId);
    perDhikr.set(s.dhikrId, {
      name: s.dhikrName,
      count: (prev?.count || 0) + count,
    });
  }

  let personalBestCount = 0;
  let personalBestDay: string | null = null;
  for (const [day, count] of perDay.entries()) {
    if (count > personalBestCount) {
      personalBestCount = count;
      personalBestDay = day;
    }
  }

  let mostUsedDhikr: { name: string; count: number } | null = null;
  for (const entry of perDhikr.values()) {
    if (!mostUsedDhikr || entry.count > mostUsedDhikr.count) {
      mostUsedDhikr = entry;
    }
  }

  const activeDaysCount = perDay.size;
  const averageDailyCount = activeDaysCount > 0 ? Math.round(lifetimeTotal / activeDaysCount) : 0;
  const { currentStreak, longestStreak } = computeStreaks(sessions, todayKey);

  return {
    lifetimeTotal,
    totalDurood: categoryTotals.durood,
    totalIstighfar: categoryTotals.istighfar,
    totalTasbih: categoryTotals.tasbih,
    totalDailyAdhkar: categoryTotals.daily_adhkar,
    totalCustom: categoryTotals.custom,
    todayTotal,
    thisWeekTotal,
    thisMonthTotal,
    averageDailyCount,
    currentStreak,
    longestStreak,
    personalBestCount,
    personalBestDay,
    mostUsedDhikr,
    categoryTotals,
  };
}

export interface ActivityPoint {
  label: string;
  key: string;
  count: number;
}

export function buildDailySeries(
  sessions: CountingSession[],
  bounds: DateRangeBounds
): ActivityPoint[] {
  const unique = deduplicateSessions(sessions);
  const byDay = new Map<string, number>();
  for (const s of unique) {
    if (s.dayKey >= bounds.startDayKey && s.dayKey <= bounds.endDayKey) {
      byDay.set(s.dayKey, (byDay.get(s.dayKey) || 0) + getSessionNetCount(s));
    }
  }

  const points: ActivityPoint[] = [];
  let cursor = bounds.startDayKey;
  let guard = 0;
  while (cursor <= bounds.endDayKey && guard < 370) {
    const [, m, d] = cursor.split('-');
    points.push({
      key: cursor,
      label: `${Number(m)}/${Number(d)}`,
      count: byDay.get(cursor) || 0,
    });
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return points;
}

export function buildWeeklySeries(
  sessions: CountingSession[],
  todayKey: string,
  weeksCount = 8
): ActivityPoint[] {
  const unique = deduplicateSessions(sessions);
  const points: ActivityPoint[] = [];
  for (let i = weeksCount - 1; i >= 0; i--) {
    const endKey = addDays(todayKey, -i * 7);
    const startKey = addDays(endKey, -6);
    let sum = 0;
    for (const s of unique) {
      if (s.dayKey >= startKey && s.dayKey <= endKey) {
        sum += getSessionNetCount(s);
      }
    }
    const [, m, d] = startKey.split('-');
    points.push({
      key: startKey,
      label: `${Number(m)}/${Number(d)}`,
      count: sum,
    });
  }
  return points;
}

export function buildMonthlySeries(
  sessions: CountingSession[],
  todayDate: Date = new Date(),
  monthsCount = 6
): ActivityPoint[] {
  const unique = deduplicateSessions(sessions);
  const byMonth = new Map<string, number>();
  for (const s of unique) {
    const ym = s.dayKey.slice(0, 7);
    byMonth.set(ym, (byMonth.get(ym) || 0) + getSessionNetCount(s));
  }

  const points: ActivityPoint[] = [];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  for (let i = monthsCount - 1; i >= 0; i--) {
    const d = new Date(todayDate.getFullYear(), todayDate.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    points.push({
      key: ym,
      label: monthNames[d.getMonth()],
      count: byMonth.get(ym) || 0,
    });
  }
  return points;
}

export function evaluateGoalProgress(
  goal: GoalItem,
  rawSessions: CountingSession[],
  todayKey: string
): { current: number; target: number; percentage: number; achieved: boolean } {
  const sessions = deduplicateSessions(rawSessions);
  const weekStart = addDays(todayKey, -6);
  const monthPrefix = todayKey.slice(0, 7);

  let current = 0;
  for (const s of sessions) {
    const inPeriod =
      goal.period === 'daily'
        ? s.dayKey === todayKey
        : goal.period === 'weekly'
          ? s.dayKey >= weekStart && s.dayKey <= todayKey
          : s.dayKey.startsWith(monthPrefix);

    if (!inPeriod) continue;

    const matchesScope =
      goal.scope === 'all'
        ? true
        : goal.scope === 'dhikr'
          ? s.dhikrId === goal.dhikrId
          : s.category === goal.scope;

    if (matchesScope) {
      current += getSessionNetCount(s);
    }
  }

  const target = Math.max(1, goal.targetCount);
  const percentage = Math.min(100, Math.round((current / target) * 100));
  return {
    current,
    target,
    percentage,
    achieved: current >= target,
  };
}
