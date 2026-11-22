import React, { useMemo, useState } from 'react';
import { Clock, Download, Eye, Play, Search, Trash2 } from 'lucide-react';
import type { CountingSession, DhikrCategory, Language } from '../types/dhikr';
import { db } from '../db/database';
import { getTranslations } from '../i18n/translations';
import { downloadTextFile, sessionsToCsv } from '../utils/backup';
import { formatDateTimeShort, formatDuration, toLocalDayKey } from '../utils/dateUtils';
import { Button, Card, ConfirmDialog, EmptyState, Input, Modal, Select } from '../components/ui/Primitives';

interface HistoryPageProps {
  language: Language;
  sessions: CountingSession[];
  onResumeSession: (session: CountingSession) => void;
  onStartCounting: () => void;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({
  language,
  sessions,
  onResumeSession,
  onStartCounting,
}) => {
  const t = getTranslations(language);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'in_progress'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | DhikrCategory>('all');
  const [selectedSession, setSelectedSession] = useState<CountingSession | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CountingSession | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...sessions]
      .sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt)
      .filter((s) => {
        if (statusFilter !== 'all' && s.status !== statusFilter) return false;
        if (categoryFilter !== 'all' && s.category !== categoryFilter) return false;
        if (q && !s.dhikrName.toLowerCase().includes(q)) return false;
        return true;
      });
  }, [sessions, query, statusFilter, categoryFilter]);

  const handleExportCsv = () => {
    const csv = sessionsToCsv(filtered);
    downloadTextFile(`dhikr-history-${toLocalDayKey()}.csv`, csv, 'text/csv;charset=utf-8');
  };

  const handleExportJson = () => {
    downloadTextFile(
      `dhikr-sessions-${toLocalDayKey()}.json`,
      JSON.stringify(filtered, null, 2),
      'application/json'
    );
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await db.sessions.delete(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-[var(--text-primary)]">{t.history.title}</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">{t.history.subtitle}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={filtered.length === 0}>
            <Download className="w-4 h-4" />
            {t.history.exportCsv}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportJson} disabled={filtered.length === 0}>
            <Download className="w-4 h-4" />
            {t.history.exportJson}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        <div className="relative sm:col-span-6">
          <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            aria-label={t.common.search}
            placeholder={t.history.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="sm:col-span-3">
          <Select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'completed' | 'in_progress')}
          >
            <option value="all">{t.history.allStatuses}</option>
            <option value="completed">{t.history.completed}</option>
            <option value="in_progress">{t.history.inProgress}</option>
          </Select>
        </div>
        <div className="sm:col-span-3">
          <Select
            aria-label="Filter by category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as 'all' | DhikrCategory)}
          >
            <option value="all">{t.categories.all}</option>
            <option value="durood">{t.categories.durood}</option>
            <option value="istighfar">{t.categories.istighfar}</option>
            <option value="tasbih">{t.categories.tasbih}</option>
            <option value="daily_adhkar">{t.categories.daily_adhkar}</option>
            <option value="custom">{t.categories.custom}</option>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Clock className="w-6 h-6" />}
          title={t.history.emptyTitle}
          description={t.history.emptyDesc}
          action={
            <Button variant="primary" onClick={onStartCounting}>
              {t.dashboard.startCounting}
            </Button>
          }
        />
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="divide-y divide-[var(--border-subtle)]">
            {filtered.map((session) => (
              <div
                key={session.id}
                className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                    {session.dhikrName}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {t.categories[session.category]}
                    <span aria-hidden="true"> · </span>
                    {formatDateTimeShort(session.startTime, language)}
                    <span aria-hidden="true"> · </span>
                    {formatDuration(session.durationSeconds)}
                    <span aria-hidden="true"> · </span>
                    <span
                      className={
                        session.status === 'completed'
                          ? 'text-[var(--accent-primary)] font-medium'
                          : 'text-[var(--accent-gold)] font-medium'
                      }
                    >
                      {session.status === 'completed' ? t.history.completed : t.history.inProgress}
                    </span>
                  </p>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                  <span className="font-mono-num text-sm font-semibold text-[var(--text-primary)] mr-2">
                    {session.finalCount} / {session.target}
                  </span>

                  {session.status === 'in_progress' && (
                    <Button size="sm" variant="primary" onClick={() => onResumeSession(session)}>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      {t.history.resume}
                    </Button>
                  )}

                  <button
                    type="button"
                    onClick={() => setSelectedSession(session)}
                    aria-label={`View details for ${session.dhikrName}`}
                    className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--accent-soft)] cursor-pointer"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeleteTarget(session)}
                    aria-label={`Delete session ${session.dhikrName}`}
                    className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-red-600 hover:bg-red-500/10 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Session Details Modal */}
      <Modal
        open={Boolean(selectedSession)}
        onClose={() => setSelectedSession(null)}
        title={selectedSession?.dhikrName || 'Session Details'}
      >
        {selectedSession && (
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-[var(--text-muted)]">{t.history.startCount}</dt>
              <dd className="font-mono-num font-semibold text-[var(--text-primary)] mt-0.5">
                {selectedSession.startingCount}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-muted)]">{t.history.finalCount}</dt>
              <dd className="font-mono-num font-semibold text-[var(--accent-primary)] mt-0.5">
                {selectedSession.finalCount} / {selectedSession.target}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-muted)]">{t.history.duration}</dt>
              <dd className="font-mono-num font-medium text-[var(--text-primary)] mt-0.5">
                {formatDuration(selectedSession.durationSeconds)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-muted)]">{t.counter.round}</dt>
              <dd className="font-mono-num font-medium text-[var(--text-primary)] mt-0.5">
                {selectedSession.roundsCompleted}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-muted)]">{t.history.startedAt}</dt>
              <dd className="text-xs text-[var(--text-primary)] mt-0.5">
                {formatDateTimeShort(selectedSession.startTime, language)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-muted)]">{t.history.completedAt}</dt>
              <dd className="text-xs text-[var(--text-primary)] mt-0.5">
                {selectedSession.completionTime
                  ? formatDateTimeShort(selectedSession.completionTime, language)
                  : '—'}
              </dd>
            </div>
          </dl>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDelete()}
        title="Delete this session?"
        description="Removing a session will also recalculate your statistics."
        confirmLabel={t.common.delete}
        cancelLabel={t.common.cancel}
        destructive
      />
    </div>
  );
};
