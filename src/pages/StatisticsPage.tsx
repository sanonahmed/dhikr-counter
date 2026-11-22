import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, Clock } from 'lucide-react';
import type { CountingSession, Language, PageRoute } from '../types/dhikr';
import { getTranslations } from '../i18n/translations';
import {
  buildDailySeries,
  buildMonthlySeries,
  buildWeeklySeries,
  computeAnalyticsSummary,
  filterSessionsByRange,
  resolveDateRange,
  type DateRangePreset,
} from '../utils/analytics';
import { addDays, toLocalDayKey } from '../utils/dateUtils';
import { Button, Card, EmptyState, Input } from '../components/ui/Primitives';
import { cn } from '../utils/cn';

interface StatisticsPageProps {
  language: Language;
  sessions: CountingSession[];
  onNavigate: (page: PageRoute) => void;
}

const PIE_COLORS = ['#0B4F3A', '#B88A3E', '#115E78', '#8C3B4E', '#3F594A'];

export const StatisticsPage: React.FC<StatisticsPageProps> = ({
  language,
  sessions,
  onNavigate,
}) => {
  const t = getTranslations(language);
  const now = new Date();
  const todayKey = toLocalDayKey(now);

  const [preset, setPreset] = useState<DateRangePreset>('last7');
  const [customStart, setCustomStart] = useState(addDays(todayKey, -13));
  const [customEnd, setCustomEnd] = useState(todayKey);
  const [chartMode, setChartMode] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  const summary = useMemo(() => computeAnalyticsSummary(sessions, now), [sessions]);

  const bounds = useMemo(
    () => resolveDateRange(preset, todayKey, customStart, customEnd),
    [preset, todayKey, customStart, customEnd]
  );

  const filteredSessions = useMemo(
    () => filterSessionsByRange(sessions, bounds),
    [sessions, bounds]
  );

  const filteredSummary = useMemo(
    () => computeAnalyticsSummary(filteredSessions, now),
    [filteredSessions]
  );

  const chartData = useMemo(() => {
    if (chartMode === 'weekly') return buildWeeklySeries(sessions, todayKey, 8);
    if (chartMode === 'monthly') return buildMonthlySeries(sessions, now, 6);
    return buildDailySeries(sessions, bounds);
  }, [chartMode, sessions, todayKey, bounds]);

  const categoryData = useMemo(() => {
    const c = filteredSummary.categoryTotals;
    return [
      { name: t.categories.durood, value: c.durood },
      { name: t.categories.istighfar, value: c.istighfar },
      { name: t.categories.tasbih, value: c.tasbih },
      { name: t.categories.daily_adhkar, value: c.daily_adhkar },
      { name: t.categories.custom, value: c.custom },
    ].filter((d) => d.value > 0);
  }, [filteredSummary, t]);

  const filterButtons: { id: DateRangePreset; label: string }[] = [
    { id: 'today', label: t.statistics.filters.today },
    { id: 'yesterday', label: t.statistics.filters.yesterday },
    { id: 'last7', label: t.statistics.filters.last7 },
    { id: 'last30', label: t.statistics.filters.last30 },
    { id: 'thisYear', label: t.statistics.filters.thisYear },
    { id: 'custom', label: t.statistics.filters.custom },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-[var(--text-primary)]">{t.statistics.title}</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">{t.statistics.subtitle}</p>
        </div>
        <Button variant="outline" onClick={() => onNavigate('history')}>
          <Clock className="w-4 h-4" />
          {t.nav.history}
        </Button>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="space-y-1">
          <p className="text-xs text-[var(--text-muted)]">{t.statistics.lifetimeTotal}</p>
          <p className="text-3xl font-bold font-display tabular-nums text-[var(--text-primary)]">
            {summary.lifetimeTotal.toLocaleString()}
          </p>
        </Card>
        <Card className="space-y-1">
          <p className="text-xs text-[var(--text-muted)]">{t.statistics.today}</p>
          <p className="text-3xl font-bold font-display tabular-nums text-[var(--accent-primary)]">
            {summary.todayTotal.toLocaleString()}
          </p>
        </Card>
        <Card className="space-y-1">
          <p className="text-xs text-[var(--text-muted)]">{t.statistics.thisWeek}</p>
          <p className="text-3xl font-bold font-display tabular-nums text-[var(--text-primary)]">
            {summary.thisWeekTotal.toLocaleString()}
          </p>
        </Card>
        <Card className="space-y-1">
          <p className="text-xs text-[var(--text-muted)]">{t.statistics.thisMonth}</p>
          <p className="text-3xl font-bold font-display tabular-nums text-[var(--text-primary)]">
            {summary.thisMonthTotal.toLocaleString()}
          </p>
        </Card>
      </div>

      {/* Category & Records Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: t.statistics.totalDurood, value: summary.totalDurood.toLocaleString() },
          { label: t.statistics.totalIstighfar, value: summary.totalIstighfar.toLocaleString() },
          { label: t.statistics.totalTasbih, value: summary.totalTasbih.toLocaleString() },
          { label: t.statistics.avgDaily, value: summary.averageDailyCount.toLocaleString() },
          { label: t.statistics.longestStreak, value: `${summary.longestStreak} ${t.dashboard.days}` },
          { label: t.statistics.personalBest, value: summary.personalBestCount.toLocaleString() },
        ].map((metric) => (
          <Card key={metric.label} className="p-4 space-y-1">
            <p className="text-[11px] text-[var(--text-muted)] truncate">{metric.label}</p>
            <p className="text-lg font-bold font-mono-num text-[var(--text-primary)]">{metric.value}</p>
          </Card>
        ))}
      </div>

      {/* Date Filters */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {filterButtons.map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={() => setPreset(btn.id)}
              className={cn(
                'min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors',
                preset === btn.id
                  ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]'
                  : 'bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)]'
              )}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label htmlFor="stat-start" className="block text-[11px] text-[var(--text-muted)] mb-1">
                From
              </label>
              <Input
                id="stat-start"
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="w-44"
              />
            </div>
            <div>
              <label htmlFor="stat-end" className="block text-[11px] text-[var(--text-muted)] mb-1">
                To
              </label>
              <Input
                id="stat-end"
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-44"
              />
            </div>
          </div>
        )}
      </div>

      {/* Charts */}
      {summary.lifetimeTotal === 0 ? (
        <EmptyState
          icon={<BarChart3 className="w-6 h-6" />}
          title={t.statistics.noDataYet}
          description="As soon as you begin counting, your daily, weekly, and monthly analytics appear here automatically."
          action={
            <Button variant="primary" onClick={() => onNavigate('counter')}>
              {t.dashboard.startCounting}
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Activity Chart */}
          <Card className="lg:col-span-8 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[var(--text-primary)]">{t.statistics.activityChart}</h2>
                <p className="text-xs text-[var(--text-muted)]">
                  {bounds.startDayKey} — {bounds.endDayKey}
                </p>
              </div>
              <div className="inline-flex rounded-xl bg-[var(--bg-surface-muted)] p-1">
                {(['daily', 'weekly', 'monthly'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setChartMode(m)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors',
                      chartMode === m
                        ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                        : 'text-[var(--text-muted)]'
                    )}
                  >
                    {t.statistics.viewMode[m]}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                {chartMode === 'monthly' ? (
                  <AreaChart data={chartData} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                    <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-strong)',
                        borderRadius: 12,
                        color: 'var(--text-primary)',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="var(--accent-primary)"
                      fill="var(--accent-soft)"
                      strokeWidth={2.5}
                    />
                  </AreaChart>
                ) : (
                  <BarChart data={chartData} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                    <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-strong)',
                        borderRadius: 12,
                        color: 'var(--text-primary)',
                      }}
                    />
                    <Bar dataKey="count" fill="var(--accent-primary)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Category Breakdown + Most Used */}
          <Card className="lg:col-span-4 flex flex-col justify-between space-y-4">
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">{t.statistics.categorySplit}</h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5 tabular-nums">
                {filteredSummary.lifetimeTotal.toLocaleString()} recitations in range
              </p>
            </div>

            {categoryData.length > 0 ? (
              <>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={48}
                        outerRadius={76}
                        paddingAngle={3}
                      >
                        {categoryData.map((entry, idx) => (
                          <Cell key={entry.name} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-strong)',
                          borderRadius: 12,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="space-y-2 text-xs">
                  {categoryData.map((item, idx) => (
                    <div key={item.name} className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-2 text-[var(--text-secondary)]">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                        />
                        {item.name}
                      </span>
                      <span className="font-mono-num font-semibold text-[var(--text-primary)]">
                        {item.value.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-[var(--text-muted)] py-8 text-center">
                No recitations in selected period.
              </p>
            )}

            {summary.mostUsedDhikr && (
              <div className="pt-4 border-t border-[var(--border-subtle)]">
                <p className="text-[11px] text-[var(--text-muted)]">{t.statistics.mostUsed}</p>
                <div className="flex items-baseline justify-between gap-2 mt-1">
                  <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
                    {summary.mostUsedDhikr.name}
                  </span>
                  <span className="text-sm font-mono-num font-bold text-[var(--accent-gold)] shrink-0">
                    {summary.mostUsedDhikr.count.toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
};
