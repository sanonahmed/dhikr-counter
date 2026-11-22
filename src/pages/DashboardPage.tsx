import React from 'react';
import {
  ArrowRight,
  Bell,
  BookOpen,
  Clock,
  Flame,
  FolderHeart,
  Heart,
  Palette,
  Play,
  Sparkles,
  Target,
} from 'lucide-react';
import type { CountingSession, DhikrItem, GoalItem, Language, PageRoute } from '../types/dhikr';
import { getTranslations } from '../i18n/translations';
import { computeAnalyticsSummary, evaluateGoalProgress, buildDailySeries, resolveDateRange } from '../utils/analytics';
import {
  formatDateTimeShort,
  formatDuration,
  formatGregorianDate,
  formatHijriDate,
  getGreetingKey,
  toLocalDayKey,
} from '../utils/dateUtils';
import { Button, Card } from '../components/ui/Primitives';
import { GeometricPattern } from '../components/GeometricPattern';

interface DashboardPageProps {
  language: Language;
  dhikrs: DhikrItem[];
  sessions: CountingSession[];
  goals: GoalItem[];
  activeDhikr: DhikrItem | undefined;
  activeSession: CountingSession | undefined;
  onStartCounting: (dhikrId?: string) => void;
  onResumeSession: (session: CountingSession) => void;
  onNavigate: (page: PageRoute) => void;
  onSelectDhikrDetail: (dhikrId: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  language,
  dhikrs,
  sessions,
  goals,
  activeDhikr,
  activeSession,
  onStartCounting,
  onResumeSession,
  onNavigate,
  onSelectDhikrDetail,
}) => {
  const t = getTranslations(language);
  const now = new Date();
  const todayKey = toLocalDayKey(now);
  const gregorianDate = formatGregorianDate(now, language);
  const hijriDate = formatHijriDate(now, language);
  const greeting = t.greetings[getGreetingKey(now)];

  const summary = computeAnalyticsSummary(sessions, now);

  const activeDailyGoals = goals.filter((g) => g.isActive && g.period === 'daily');
  const evaluatedDailyGoals = activeDailyGoals.map((goal) => ({
    goal,
    progress: evaluateGoalProgress(goal, sessions, todayKey),
  }));
  const completedGoalsCount = evaluatedDailyGoals.filter((g) => g.progress.achieved).length;
  const aggregateDailyTarget = evaluatedDailyGoals.reduce((acc, g) => acc + g.progress.target, 0);
  const aggregateDailyCurrent = evaluatedDailyGoals.reduce(
    (acc, g) => acc + Math.min(g.progress.current, g.progress.target),
    0
  );
  const overallDailyPct =
    aggregateDailyTarget > 0 ? Math.min(100, Math.round((aggregateDailyCurrent / aggregateDailyTarget) * 100)) : 0;

  const favorites = dhikrs.filter((d) => d.isFavorite).slice(0, 6);
  const recentSessions = [...sessions]
    .sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt)
    .slice(0, 5);

  const weekSeries = buildDailySeries(sessions, resolveDateRange('last7', todayKey));
  const maxWeekVal = Math.max(1, ...weekSeries.map((p) => p.count));

  const displayDhikr = activeDhikr || dhikrs[0];

  return (
    <div className="space-y-8">
      {/* Hero Greeting & Active Dhikr Banner */}
      <section className="relative overflow-hidden rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-6 sm:p-8" style={{ boxShadow: 'var(--shadow-card)' }}>
        <GeometricPattern styleType="geometric" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-7 space-y-3">
            <p className="text-xs font-medium text-[var(--accent-gold)] tracking-wide">
              {greeting}
            </p>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-[var(--text-primary)] tracking-tight text-balance">
              {language === 'bn' ? 'আল্লাহর স্মরণে প্রশান্ত হৃদয়' : 'Tranquil Remembrance, Every Day'}
            </h1>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs sm:text-sm text-[var(--text-secondary)]">
              <span>{gregorianDate}</span>
              {hijriDate && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-[var(--accent-primary)]">{hijriDate}</span>
                </>
              )}
            </div>

            <div className="pt-3 flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                size="lg"
                onClick={() => onStartCounting(displayDhikr?.id)}
                data-testid="dashboard-start-counting"
              >
                <Play className="w-4 h-4 fill-current" />
                {activeSession && activeSession.status === 'in_progress' && activeSession.finalCount > 0
                  ? t.dashboard.continueCounting
                  : t.dashboard.startCounting}
              </Button>
              <Button variant="outline" size="lg" onClick={() => onNavigate('library')}>
                <BookOpen className="w-4 h-4" />
                {t.nav.library}
              </Button>
            </div>
          </div>

          {/* Current Active Dhikr Spotlight */}
          {displayDhikr && (
            <div className="lg:col-span-5 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] p-5 space-y-3">
              <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
                <span>{t.dashboard.activeDhikr}</span>
                <span className="tabular-nums">
                  {t.dashboard.target}: {activeSession?.target ?? displayDhikr.recommendedTarget}
                </span>
              </div>
              {displayDhikr.arabic && (
                <p className="font-arabic text-2xl sm:text-3xl text-right text-[var(--text-primary)] leading-loose">
                  {displayDhikr.arabic.length > 90
                    ? `${displayDhikr.arabic.slice(0, 90)}…`
                    : displayDhikr.arabic}
                </p>
              )}
              <div>
                <p className="text-base font-semibold text-[var(--text-primary)]">
                  {language === 'bn' && displayDhikr.nameBn ? displayDhikr.nameBn : displayDhikr.name}
                </p>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-2">
                  {language === 'bn' ? displayDhikr.bengaliTranslation : displayDhikr.englishTranslation}
                </p>
              </div>
              {activeSession && activeSession.dhikrId === displayDhikr.id && activeSession.finalCount > 0 && (
                <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs">
                  <span className="text-[var(--text-muted)]">{t.dashboard.count}</span>
                  <span className="font-mono-num font-semibold text-[var(--accent-primary)]">
                    {activeSession.finalCount} / {activeSession.target}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Primary KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Daily overview metrics">
        <Card className="space-y-1.5">
          <p className="text-xs text-[var(--text-muted)]">{t.dashboard.todayTotal}</p>
          <p className="text-3xl font-bold font-display tabular-nums text-[var(--text-primary)]" data-testid="dashboard-today-total">
            {summary.todayTotal.toLocaleString()}
          </p>
          <p className="text-xs text-[var(--text-secondary)] tabular-nums">
            {t.statistics.thisWeek}: {summary.thisWeekTotal.toLocaleString()}
          </p>
        </Card>

        <Card className="space-y-1.5">
          <p className="text-xs text-[var(--text-muted)]">{t.dashboard.completedGoals}</p>
          <p className="text-3xl font-bold font-display tabular-nums text-[var(--text-primary)]">
            {completedGoalsCount}
            <span className="text-lg font-normal text-[var(--text-muted)]">
              /{activeDailyGoals.length}
            </span>
          </p>
          <button
            type="button"
            onClick={() => onNavigate('goals')}
            className="text-xs font-medium text-[var(--accent-primary)] hover:underline cursor-pointer"
          >
            {t.nav.goals} →
          </button>
        </Card>

        <Card className="space-y-1.5">
          <p className="text-xs text-[var(--text-muted)]">{t.dashboard.dailyStreak}</p>
          <p className="text-3xl font-bold font-display tabular-nums text-[var(--text-primary)] inline-flex items-baseline gap-1.5">
            {summary.currentStreak}
            <span className="text-sm font-sans font-normal text-[var(--text-muted)]">{t.dashboard.days}</span>
          </p>
          <p className="text-xs text-[var(--text-secondary)] inline-flex items-center gap-1 tabular-nums">
            <Flame className="w-3.5 h-3.5 text-[var(--accent-gold)]" />
            {t.statistics.longestStreak}: {summary.longestStreak}
          </p>
        </Card>

        <Card className="space-y-1.5">
          <p className="text-xs text-[var(--text-muted)]">{t.statistics.lifetimeTotal}</p>
          <p className="text-3xl font-bold font-display tabular-nums text-[var(--text-primary)]">
            {summary.lifetimeTotal.toLocaleString()}
          </p>
          <button
            type="button"
            onClick={() => onNavigate('statistics')}
            className="text-xs font-medium text-[var(--accent-primary)] hover:underline cursor-pointer"
          >
            {t.nav.statistics} →
          </button>
        </Card>
      </section>

      {/* Daily Progress + Weekly Summary */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Daily Goal Progress */}
        <Card className="lg:col-span-7 flex flex-col justify-between space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">{t.dashboard.dailyProgress}</h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">{t.goals.gentleNote}</p>
            </div>
            <span className="text-lg font-bold font-mono-num text-[var(--accent-primary)]">
              {overallDailyPct}%
            </span>
          </div>

          <div className="h-2.5 w-full rounded-full bg-[var(--bg-surface-muted)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--accent-primary)] transition-all duration-300"
              style={{ width: `${overallDailyPct}%` }}
            />
          </div>

          {evaluatedDailyGoals.length > 0 ? (
            <div className="divide-y divide-[var(--border-subtle)]">
              {evaluatedDailyGoals.slice(0, 4).map(({ goal, progress }) => (
                <div key={goal.id} className="py-2.5 flex items-center justify-between gap-4 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--text-primary)] truncate">{goal.title}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {progress.achieved ? t.goals.completed : t.goals.inProgress}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-mono-num text-xs font-semibold text-[var(--text-primary)]">
                      {progress.current.toLocaleString()} / {progress.target.toLocaleString()}
                    </span>
                    <span className="block text-[11px] text-[var(--text-muted)] tabular-nums">
                      {progress.percentage}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-4 flex items-center justify-between gap-4">
              <p className="text-sm text-[var(--text-muted)]">{t.dashboard.noGoalsSet}</p>
              <Button variant="outline" size="sm" onClick={() => onNavigate('goals')}>
                <Target className="w-4 h-4" />
                {t.goals.newGoal}
              </Button>
            </div>
          )}
        </Card>

        {/* 7-Day Weekly Summary */}
        <Card className="lg:col-span-5 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">{t.dashboard.weeklySummary}</h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5 tabular-nums">
                {summary.thisWeekTotal.toLocaleString()} · {t.statistics.filters.last7}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('statistics')}
              className="text-xs font-medium text-[var(--accent-primary)] hover:underline cursor-pointer"
            >
              {t.dashboard.viewAll}
            </button>
          </div>

          <div className="grid grid-cols-7 gap-2 items-end h-36 pt-4">
            {weekSeries.map((pt) => {
              const barPct = pt.count > 0 ? Math.max(12, Math.round((pt.count / maxWeekVal) * 100)) : 6;
              const isToday = pt.key === todayKey;
              return (
                <div key={pt.key} className="flex flex-col items-center gap-1.5 h-full justify-end">
                  <span className="text-[10px] font-mono-num text-[var(--text-muted)]">
                    {pt.count > 0 ? pt.count : ''}
                  </span>
                  <div className="w-full max-w-[28px] flex-1 flex items-end">
                    <div
                      className="w-full rounded-t-lg transition-all duration-300"
                      style={{
                        height: `${barPct}%`,
                        backgroundColor: isToday
                          ? 'var(--accent-primary)'
                          : pt.count > 0
                            ? 'var(--accent-gold)'
                            : 'var(--bg-surface-muted)',
                      }}
                    />
                  </div>
                  <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{pt.label}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </section>

      {/* Quick Workspace Tools */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3" aria-label={t.dashboard.quickTools}>
        {[
          { page: 'customization' as PageRoute, label: t.nav.customization, icon: Palette },
          { page: 'collections' as PageRoute, label: t.nav.collections, icon: FolderHeart },
          { page: 'history' as PageRoute, label: t.nav.history, icon: Clock },
          { page: 'reminders' as PageRoute, label: t.nav.reminders, icon: Bell },
        ].map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.page}
              type="button"
              onClick={() => onNavigate(tool.page)}
              className="flex items-center gap-3 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-4 py-3.5 text-left hover:border-[var(--border-strong)] transition-colors cursor-pointer min-h-[54px]"
            >
              <span className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4" />
              </span>
              <span className="text-sm font-medium text-[var(--text-primary)] truncate">{tool.label}</span>
            </button>
          );
        })}
      </section>

      {/* Favorites + Recent Activity */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Favorite Dhikr Quick Access */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">{t.dashboard.favorites}</h2>
            <button
              type="button"
              onClick={() => onNavigate('library')}
              className="text-xs font-medium text-[var(--accent-primary)] hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              {t.dashboard.viewAll}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {favorites.map((item) => (
              <Card key={item.id} className="p-4 flex flex-col justify-between gap-3 hover:border-[var(--border-strong)] transition-colors">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectDhikrDetail(item.id)}
                      className="text-sm font-semibold text-[var(--text-primary)] hover:text-[var(--accent-primary)] text-left truncate cursor-pointer"
                    >
                      {language === 'bn' && item.nameBn ? item.nameBn : item.name}
                    </button>
                    <Heart className="w-3.5 h-3.5 text-[var(--accent-gold)] fill-current shrink-0" aria-hidden="true" />
                  </div>
                  {item.arabic && (
                    <p className="font-arabic text-xl text-right text-[var(--text-primary)] truncate">
                      {item.arabic}
                    </p>
                  )}
                  <p className="text-xs text-[var(--text-muted)] line-clamp-1">
                    {language === 'bn' ? item.bengaliPronunciation : item.englishTranslation}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
                  <span className="text-xs text-[var(--text-muted)] tabular-nums">
                    {t.dashboard.target} {item.recommendedTarget}
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => onStartCounting(item.id)}>
                    <Sparkles className="w-3.5 h-3.5" />
                    {t.library.countNow}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">{t.dashboard.recentActivity}</h2>
            <button
              type="button"
              onClick={() => onNavigate('history')}
              className="text-xs font-medium text-[var(--accent-primary)] hover:underline cursor-pointer"
            >
              {t.dashboard.viewAll}
            </button>
          </div>

          <Card className="p-0 overflow-hidden">
            {recentSessions.length === 0 ? (
              <div className="p-6 text-center space-y-3">
                <p className="text-sm text-[var(--text-secondary)]">{t.dashboard.noActivityYet}</p>
                <Button size="sm" variant="primary" onClick={() => onStartCounting(displayDhikr?.id)}>
                  {t.dashboard.startCounting}
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {recentSessions.map((session) => (
                  <div key={session.id} className="px-4 py-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                        {session.dhikrName}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        {formatDateTimeShort(session.lastUpdatedAt, language)}
                        <span aria-hidden="true"> · </span>
                        {formatDuration(session.durationSeconds)}
                        <span aria-hidden="true"> · </span>
                        {session.status === 'completed' ? t.history.completed : t.history.inProgress}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-mono-num font-semibold text-[var(--accent-primary)]">
                        {session.finalCount}/{session.target}
                      </span>
                      {session.status === 'in_progress' && (
                        <Button size="sm" variant="outline" onClick={() => onResumeSession(session)}>
                          {t.history.resume}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </section>
    </div>
  );
};
