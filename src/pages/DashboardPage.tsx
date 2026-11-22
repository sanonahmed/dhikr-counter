import React from 'react';
import type { CountingSession, DhikrItem, Language } from '../types/dhikr';
import { getTranslations } from '../i18n/translations';
import { formatDateTimeShort, formatDuration } from '../utils/dateUtils';

interface DashboardPageProps {
  language: Language;
  dhikrs: DhikrItem[];
  sessions: CountingSession[];
  onStartCounting: (dhikrId?: string) => void;
  onResumeSession: (session: CountingSession) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  language,
  dhikrs,
  sessions,
  onStartCounting,
  onResumeSession,
}) => {
  const t = getTranslations(language);
  const recentSessions = [...sessions]
    .sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt)
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <section className="space-y-3" aria-labelledby="home-dhikr-heading">
        <h1 id="home-dhikr-heading" className="text-base font-semibold text-[var(--text-primary)]">
          {t.nav.library}
        </h1>
        {dhikrs.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] divide-y divide-[var(--border-subtle)]">
            {dhikrs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onStartCounting(item.id)}
                className="w-full px-4 py-3.5 text-left flex items-center justify-between gap-4 hover:bg-[var(--accent-soft)] transition-colors cursor-pointer"
                aria-label={`${language === 'bn' && item.nameBn ? item.nameBn : item.name}, ${t.library.countNow}`}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[var(--text-primary)] truncate">
                    {language === 'bn' && item.nameBn ? item.nameBn : item.name}
                  </span>
                  {item.arabic && (
                    <span className="block font-arabic text-lg text-[var(--text-secondary)] truncate" dir="rtl">
                      {item.arabic}
                    </span>
                  )}
                  <span className="block text-xs text-[var(--text-muted)] truncate">
                    {language === 'bn' ? item.bengaliPronunciation : item.englishTranslation}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-[var(--text-muted)] tabular-nums">
                  {t.dashboard.target} {item.recommendedTarget}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">{t.dashboard.noActivityYet}</p>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="home-recent-activity-heading">
        <h2 id="home-recent-activity-heading" className="text-base font-semibold text-[var(--text-primary)]">
          {t.dashboard.recentActivity}
        </h2>
        {recentSessions.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] divide-y divide-[var(--border-subtle)]">
            {recentSessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() =>
                  session.status === 'in_progress'
                    ? onResumeSession(session)
                    : onStartCounting(session.dhikrId)
                }
                className="w-full px-4 py-3.5 text-left flex items-center justify-between gap-4 hover:bg-[var(--accent-soft)] transition-colors cursor-pointer"
                aria-label={`${session.dhikrName}, ${session.finalCount} / ${session.target}, ${session.status === 'completed' ? t.history.completed : t.history.inProgress}`}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[var(--text-primary)] truncate">
                    {session.dhikrName}
                  </span>
                  <span className="block text-xs text-[var(--text-muted)] mt-0.5">
                    {formatDateTimeShort(session.lastUpdatedAt, language)}
                    <span aria-hidden="true"> · </span>
                    {formatDuration(session.durationSeconds)}
                    <span aria-hidden="true"> · </span>
                    {session.status === 'completed' ? t.history.completed : t.history.inProgress}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-mono-num font-semibold text-[var(--accent-primary)]">
                  {session.finalCount}/{session.target}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">{t.dashboard.noActivityYet}</p>
        )}
      </section>
    </div>
  );
};
