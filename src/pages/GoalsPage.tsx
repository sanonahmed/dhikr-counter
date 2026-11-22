import React, { useState } from 'react';
import { Award, CheckCircle2, Flame, Plus, Target, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import type {
  CountingSession,
  DhikrItem,
  GoalItem,
  GoalPeriod,
  GoalScope,
  Language,
} from '../types/dhikr';
import { db, generateId } from '../db/database';
import { getTranslations } from '../i18n/translations';
import { computeAnalyticsSummary, evaluateGoalProgress } from '../utils/analytics';
import { toLocalDayKey } from '../utils/dateUtils';
import { Button, Card, ConfirmDialog, EmptyState, Input, Modal, Select } from '../components/ui/Primitives';

interface GoalsPageProps {
  language: Language;
  goals: GoalItem[];
  sessions: CountingSession[];
  dhikrs: DhikrItem[];
}

export const GoalsPage: React.FC<GoalsPageProps> = ({
  language,
  goals,
  sessions,
  dhikrs,
}) => {
  const t = getTranslations(language);
  const todayKey = toLocalDayKey(new Date());
  const summary = computeAnalyticsSummary(sessions, new Date());

  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [period, setPeriod] = useState<GoalPeriod>('daily');
  const [scope, setScope] = useState<GoalScope>('durood');
  const [dhikrId, setDhikrId] = useState<string>(dhikrs[0]?.id || '');
  const [targetCount, setTargetCount] = useState('100');
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GoalItem | null>(null);

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError('Please provide a goal title.');
      return;
    }
    const num = parseInt(targetCount, 10);
    if (!Number.isFinite(num) || num < 1) {
      setError('Target count must be at least 1.');
      return;
    }
    const now = Date.now();
    await db.goals.put({
      id: generateId('goal'),
      title: title.trim(),
      period,
      scope,
      dhikrId: scope === 'dhikr' ? dhikrId : undefined,
      targetCount: num,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    setTitle('');
    setTargetCount('100');
    setModalOpen(false);
  };

  const handleToggleActive = async (goal: GoalItem) => {
    await db.goals.update(goal.id, { isActive: !goal.isActive, updatedAt: Date.now() });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await db.goals.delete(deleteTarget.id);
    setDeleteTarget(null);
  };

  const periodLabel = (p: GoalPeriod) =>
    p === 'daily' ? t.goals.daily : p === 'weekly' ? t.goals.weekly : t.goals.monthly;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-[var(--text-primary)]">{t.goals.title}</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">{t.goals.subtitle}</p>
        </div>
        <Button variant="primary" onClick={() => setModalOpen(true)} data-testid="add-goal-btn">
          <Plus className="w-4 h-4" />
          {t.goals.newGoal}
        </Button>
      </div>

      {/* Encouraging Personal Records Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-[var(--text-muted)]">{t.dashboard.dailyStreak}</p>
            <p className="text-2xl font-bold font-display tabular-nums text-[var(--text-primary)] mt-1">
              {summary.currentStreak} {t.dashboard.days}
            </p>
          </div>
          <Flame className="w-6 h-6 text-[var(--accent-gold)] shrink-0" aria-hidden="true" />
        </Card>

        <Card className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-[var(--text-muted)]">{t.statistics.longestStreak}</p>
            <p className="text-2xl font-bold font-display tabular-nums text-[var(--text-primary)] mt-1">
              {summary.longestStreak} {t.dashboard.days}
            </p>
          </div>
          <Award className="w-6 h-6 text-[var(--accent-primary)] shrink-0" aria-hidden="true" />
        </Card>

        <Card className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-[var(--text-muted)]">{t.statistics.personalBest}</p>
            <p className="text-2xl font-bold font-display tabular-nums text-[var(--text-primary)] mt-1">
              {summary.personalBestCount.toLocaleString()}
            </p>
          </div>
          <Target className="w-6 h-6 text-[var(--accent-primary)] shrink-0" aria-hidden="true" />
        </Card>
      </div>

      <p className="text-xs text-[var(--text-muted)]">{t.goals.gentleNote}</p>

      {goals.length === 0 ? (
        <EmptyState
          icon={<Target className="w-6 h-6" />}
          title={t.goals.emptyTitle}
          description={t.goals.emptyDesc}
          action={
            <Button variant="primary" onClick={() => setModalOpen(true)}>
              <Plus className="w-4 h-4" />
              {t.goals.newGoal}
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {goals.map((goal) => {
            const progress = evaluateGoalProgress(goal, sessions, todayKey);
            return (
              <motion.div
                key={goal.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className={`space-y-4 ${!goal.isActive ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">
                        {periodLabel(goal.period)}
                        <span aria-hidden="true"> · </span>
                        {progress.achieved ? (
                          <span className="text-[var(--accent-primary)] font-medium inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> {t.goals.completed}
                          </span>
                        ) : (
                          <span>{t.goals.inProgress}</span>
                        )}
                      </p>
                      <h2 className="text-base font-semibold text-[var(--text-primary)] mt-1">
                        {goal.title}
                      </h2>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void handleToggleActive(goal)}
                      >
                        {goal.isActive ? 'Pause' : 'Resume'}
                      </Button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(goal)}
                        aria-label={`Delete goal ${goal.title}`}
                        className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-red-600 hover:bg-red-500/10 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-mono-num font-semibold text-[var(--text-primary)]">
                        {progress.current.toLocaleString()} / {progress.target.toLocaleString()}
                      </span>
                      <span className="font-mono-num text-xs text-[var(--accent-primary)] font-semibold">
                        {progress.percentage}%
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-[var(--bg-surface-muted)] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${progress.percentage}%`,
                          backgroundColor: progress.achieved
                            ? 'var(--accent-gold)'
                            : 'var(--accent-primary)',
                        }}
                      />
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t.goals.newGoal}>
        <form onSubmit={(e) => void handleCreateGoal(e)} className="space-y-4">
          {error && (
            <div role="alert" className="rounded-xl bg-red-500/10 border border-red-500/30 px-3.5 py-2.5 text-xs text-red-600">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="goal-title" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              {t.goals.titleLabel}
            </label>
            <Input
              id="goal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Morning Durood 100"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="goal-period" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                {t.goals.periodLabel}
              </label>
              <Select
                id="goal-period"
                value={period}
                onChange={(e) => setPeriod(e.target.value as GoalPeriod)}
              >
                <option value="daily">{t.goals.daily}</option>
                <option value="weekly">{t.goals.weekly}</option>
                <option value="monthly">{t.goals.monthly}</option>
              </Select>
            </div>

            <div>
              <label htmlFor="goal-target" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                {t.goals.targetLabel}
              </label>
              <Input
                id="goal-target"
                type="number"
                min={1}
                value={targetCount}
                onChange={(e) => setTargetCount(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="goal-scope" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              {t.goals.scopeLabel}
            </label>
            <Select
              id="goal-scope"
              value={scope}
              onChange={(e) => setScope(e.target.value as GoalScope)}
            >
              <option value="all">{t.goals.allDhikr}</option>
              <option value="durood">{t.categories.durood}</option>
              <option value="istighfar">{t.categories.istighfar}</option>
              <option value="tasbih">{t.categories.tasbih}</option>
              <option value="daily_adhkar">{t.categories.daily_adhkar}</option>
              <option value="dhikr">{t.goals.specificDhikr}</option>
            </Select>
          </div>

          {scope === 'dhikr' && (
            <div>
              <label htmlFor="goal-dhikr" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Dhikr
              </label>
              <Select
                id="goal-dhikr"
                value={dhikrId}
                onChange={(e) => setDhikrId(e.target.value)}
              >
                {dhikrs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {language === 'bn' && d.nameBn ? d.nameBn : d.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="pt-2 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" variant="primary">
              {t.goals.saveGoal}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDelete()}
        title={`Remove goal "${deleteTarget?.title}"?`}
        description="Your past Dhikr counts and analytics remain untouched."
        confirmLabel={t.common.delete}
        cancelLabel={t.common.cancel}
        destructive
      />
    </div>
  );
};
