import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Palette,
  Plus,
  RotateCcw,
  Undo2,
  Vibrate,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type {
  AppSettings,
  CountingSession,
  DhikrItem,
  PageRoute,
} from '../types/dhikr';
import { db, generateId } from '../db/database';
import { getTranslations } from '../i18n/translations';
import {
  addAnotherRound,
  continuePastTarget,
  createCounterState,
  getCounterMetrics,
  incrementCounter,
  resetCounter,
  undoCounter,
  type CounterState,
} from '../utils/counterEngine';
import { formatDuration, toLocalDayKey } from '../utils/dateUtils';
import { playCompletionChime, playTapSound, triggerHaptic } from '../utils/feedback';
import { Button, ConfirmDialog, Input, Modal } from '../components/ui/Primitives';
import { GeometricPattern } from '../components/GeometricPattern';
import { TasbihDial } from '../components/TasbihDial';

interface CounterPageProps {
  dhikr: DhikrItem;
  allDhikrs: DhikrItem[];
  resumedSession?: CountingSession | null;
  settings: AppSettings;
  onUpdateCustomization: (patch: Partial<AppSettings['customization']>) => void;
  onSwitchDhikr: (dhikrId: string) => void;
  onNavigate: (page: PageRoute) => void;
  onActiveSessionChange: (sessionId: string | null) => void;
}

export const CounterPage: React.FC<CounterPageProps> = ({
  dhikr,
  allDhikrs,
  resumedSession,
  settings,
  onUpdateCustomization,
  onSwitchDhikr,
  onNavigate,
  onActiveSessionChange,
}) => {
  const t = getTranslations(settings.language);
  const cust = settings.customization;

  const [sessionId, setSessionId] = useState<string>(() =>
    resumedSession && resumedSession.dhikrId === dhikr.id ? resumedSession.id : generateId('sess')
  );
  const [sessionStartMs, setSessionStartMs] = useState<number>(() =>
    resumedSession && resumedSession.dhikrId === dhikr.id ? resumedSession.startTime : Date.now()
  );
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(() =>
    resumedSession && resumedSession.dhikrId === dhikr.id ? resumedSession.durationSeconds : 0
  );
  const [counter, setCounter] = useState<CounterState>(() => {
    if (resumedSession && resumedSession.dhikrId === dhikr.id) {
      return createCounterState(
        resumedSession.target,
        resumedSession.finalCount,
        resumedSession.roundsCompleted
      );
    }
    return createCounterState(dhikr.recommendedTarget || settings.defaultTarget, 0, 0);
  });

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [showTargetEditor, setShowTargetEditor] = useState(false);
  const [targetInput, setTargetInput] = useState(String(counter.target));
  const [switcherQuery, setSwitcherQuery] = useState('');
  const [holdProgress, setHoldProgress] = useState(0);

  const longPressTimerRef = useRef<number | null>(null);
  const longPressIntervalRef = useRef<number | null>(null);
  const sessionIdRef = useRef(sessionId);
  const elapsedRef = useRef(elapsedSeconds);
  const startMsRef = useRef(sessionStartMs);

  sessionIdRef.current = sessionId;
  elapsedRef.current = elapsedSeconds;
  startMsRef.current = sessionStartMs;

  // When switching Dhikr or loading a resumed session, sync state cleanly
  useEffect(() => {
    if (resumedSession && resumedSession.dhikrId === dhikr.id) {
      setSessionId(resumedSession.id);
      setSessionStartMs(resumedSession.startTime);
      setElapsedSeconds(resumedSession.durationSeconds);
      setCounter(
        createCounterState(
          resumedSession.target,
          resumedSession.finalCount,
          resumedSession.roundsCompleted
        )
      );
      setTargetInput(String(resumedSession.target));
      onActiveSessionChange(resumedSession.id);
      return;
    }

    // Check if there is an existing in-progress session for this Dhikr today so reload preserves progress
    let cancelled = false;
    (async () => {
      const todayKey = toLocalDayKey(new Date());
      const todaySessions = await db.sessions
        .where('dhikrId')
        .equals(dhikr.id)
        .filter((s) => s.dayKey === todayKey && s.status === 'in_progress')
        .sortBy('lastUpdatedAt');
      if (cancelled) return;

      const latest = todaySessions[todaySessions.length - 1];
      if (latest) {
        setSessionId(latest.id);
        setSessionStartMs(latest.startTime);
        setElapsedSeconds(latest.durationSeconds);
        setCounter(createCounterState(latest.target, latest.finalCount, latest.roundsCompleted));
        setTargetInput(String(latest.target));
        onActiveSessionChange(latest.id);
      } else {
        const freshId = generateId('sess');
        const target = dhikr.recommendedTarget || settings.defaultTarget;
        setSessionId(freshId);
        setSessionStartMs(Date.now());
        setElapsedSeconds(0);
        setCounter(createCounterState(target, 0, 0));
        setTargetInput(String(target));
        onActiveSessionChange(freshId);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dhikr.id, resumedSession?.id]);

  // Session timer ticks while counter has started (>0)
  useEffect(() => {
    if (counter.count === 0) return;
    const id = window.setInterval(() => {
      setElapsedSeconds((sec) => sec + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [counter.count > 0]);

  const persistSession = useCallback(
    (nextState: CounterState, durationSec: number) => {
      const now = Date.now();
      const completed = nextState.roundsCompleted > 0 || nextState.count >= nextState.target;
      const record: CountingSession = {
        id: sessionIdRef.current,
        dhikrId: dhikr.id,
        dhikrName: settings.language === 'bn' && dhikr.nameBn ? dhikr.nameBn : dhikr.name,
        category: dhikr.category,
        startingCount: 0,
        finalCount: nextState.count,
        target: nextState.target,
        roundsCompleted: nextState.roundsCompleted,
        startTime: startMsRef.current,
        lastUpdatedAt: now,
        completionTime: completed ? now : undefined,
        durationSeconds: durationSec,
        status: completed && !nextState.continuingPastTarget && nextState.count === nextState.target * nextState.round
          ? 'completed'
          : completed
            ? 'completed'
            : 'in_progress',
        dayKey: toLocalDayKey(new Date(startMsRef.current)),
      };
      db.sessions.put(record).catch(() => {});
    },
    [dhikr, settings.language]
  );

  const handleIncrement = useCallback(() => {
    setCounter((prev) => {
      const { next, didIncrement, reachedTarget } = incrementCounter(
        prev,
        Date.now(),
        settings.tapDebounceMs
      );
      if (!didIncrement) return prev;

      if (reachedTarget) {
        playCompletionChime(cust.sound);
        triggerHaptic(cust.vibration, true);
      } else {
        playTapSound(cust.sound);
        triggerHaptic(cust.vibration, false);
      }

      persistSession(next, elapsedRef.current);
      return next;
    });
  }, [cust.sound, cust.vibration, persistSession, settings.tapDebounceMs]);

  const handleUndo = useCallback(() => {
    setCounter((prev) => {
      if (prev.count <= 0) return prev;
      const next = undoCounter(prev);
      persistSession(next, elapsedRef.current);
      return next;
    });
  }, [persistSession]);

  const handleAddRound = useCallback(() => {
    setCounter((prev) => {
      const next = addAnotherRound(prev);
      persistSession(next, elapsedRef.current);
      return next;
    });
  }, [persistSession]);

  const handleContinuePast = useCallback(() => {
    setCounter((prev) => {
      const next = continuePastTarget(prev);
      persistSession(next, elapsedRef.current);
      return next;
    });
  }, [persistSession]);

  const handleConfirmedReset = useCallback(() => {
    const freshId = generateId('sess');
    const freshTarget = counter.target;
    setSessionId(freshId);
    setSessionStartMs(Date.now());
    setElapsedSeconds(0);
    setCounter(resetCounter(freshTarget));
    onActiveSessionChange(freshId);
  }, [counter.target, onActiveSessionChange]);

  const handleApplyTarget = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(targetInput, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return;
    setCounter((prev) => {
      const next = { ...prev, target: parsed, justCompletedRound: false };
      if (next.count > 0) persistSession(next, elapsedRef.current);
      return next;
    });
    setShowTargetEditor(false);
  };

  // Keyboard Space / Enter support when no modal or input is focused
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (showResetConfirm || showSwitcher || showTargetEditor) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        handleIncrement();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleIncrement, handleUndo, showResetConfirm, showSwitcher, showTargetEditor]);

  // Long-press reset handlers
  const startLongPress = () => {
    const started = Date.now();
    longPressIntervalRef.current = window.setInterval(() => {
      const pct = Math.min(100, Math.round(((Date.now() - started) / 650) * 100));
      setHoldProgress(pct);
    }, 35);
    longPressTimerRef.current = window.setTimeout(() => {
      clearLongPress();
      setShowResetConfirm(true);
    }, 650);
  };

  const clearLongPress = () => {
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    if (longPressIntervalRef.current) window.clearInterval(longPressIntervalRef.current);
    longPressTimerRef.current = null;
    longPressIntervalRef.current = null;
    setHoldProgress(0);
  };

  const metrics = getCounterMetrics(counter);

  const filteredSwitchDhikrs = allDhikrs.filter((item) => {
    const q = switcherQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      item.name.toLowerCase().includes(q) ||
      (item.nameBn || '').toLowerCase().includes(q) ||
      item.arabic.includes(q) ||
      item.bengaliPronunciation.toLowerCase().includes(q)
    );
  });

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between overflow-hidden bg-[var(--bg-canvas)]">
      <GeometricPattern
        styleType={cust.backgroundStyle}
        customImage={cust.customBackgroundImage}
      />

      {/* Top Distraction-Free Header */}
      <header className="relative z-20 w-full max-w-4xl mx-auto px-4 pt-safe py-3.5 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onNavigate('home')}
          aria-label={t.common.back}
          className="h-11 px-3 inline-flex items-center gap-2 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">{t.nav.home}</span>
        </button>

        <button
          type="button"
          onClick={() => setShowSwitcher(true)}
          className="min-h-[44px] max-w-[55vw] sm:max-w-xs px-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)] hover:border-[var(--border-strong)] cursor-pointer"
          aria-label={t.counter.switchDhikr}
        >
          <span className="truncate">
            {settings.language === 'bn' && dhikr.nameBn ? dhikr.nameBn : dhikr.name}
          </span>
          <ChevronDown className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              onUpdateCustomization({
                sound: cust.sound === 'off' ? 'wood-bead' : 'off',
              })
            }
            aria-label={cust.sound === 'off' ? 'Enable tap sound' : 'Mute tap sound'}
            className="h-11 w-11 inline-flex items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            {cust.sound === 'off' ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5 text-[var(--accent-primary)]" />}
          </button>

          <button
            type="button"
            onClick={() =>
              onUpdateCustomization({
                vibration: cust.vibration === 'off' ? 'bead' : 'off',
              })
            }
            aria-label={cust.vibration === 'off' ? 'Enable vibration' : 'Disable vibration'}
            className="h-11 w-11 inline-flex items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <Vibrate className={`w-5 h-5 ${cust.vibration !== 'off' ? 'text-[var(--accent-primary)]' : 'opacity-45'}`} />
          </button>

          <button
            type="button"
            onClick={() => onNavigate('customization')}
            aria-label={t.counter.customize}
            className="h-11 w-11 inline-flex items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <Palette className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Center Stage: Recitation Text + Tasbih Dial */}
      <div className="relative z-10 flex-1 w-full max-w-2xl mx-auto px-5 py-4 flex flex-col items-center justify-center gap-6">
        {/* Recitation Display */}
        <div className="w-full text-center space-y-2.5 max-w-xl">
          {cust.showArabic && dhikr.arabic && (
            <p className="font-arabic text-3xl sm:text-4xl text-[var(--text-primary)] leading-loose px-2">
              {dhikr.arabic}
            </p>
          )}

          {cust.showBengaliPronunciation && dhikr.bengaliPronunciation && (
            <p className="text-base sm:text-lg font-medium text-[var(--accent-primary)]">
              {dhikr.bengaliPronunciation}
            </p>
          )}

          {cust.showTranslations && (
            <div className="space-y-1 text-xs sm:text-sm text-[var(--text-secondary)] max-w-lg mx-auto leading-relaxed">
              {dhikr.bengaliTranslation && <p>{dhikr.bengaliTranslation}</p>}
              {dhikr.englishTranslation && (
                <p className="text-[var(--text-muted)]">{dhikr.englishTranslation}</p>
              )}
            </div>
          )}
        </div>

        {/* Completion Banner when target reached */}
        <AnimatePresence>
          {counter.justCompletedRound && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              role="status"
              aria-live="polite"
              className="w-full max-w-md rounded-2xl bg-[var(--bg-surface)] border border-[var(--accent-gold)] p-4 text-center space-y-3 shadow-lg"
            >
              <div className="flex items-center justify-center gap-2 text-[var(--accent-primary)] font-semibold text-sm">
                <CheckCircle2 className="w-5 h-5 text-[var(--accent-gold)]" />
                <span>{t.counter.targetReached}</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">{t.counter.targetReachedDesc}</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button size="sm" variant="primary" onClick={handleAddRound}>
                  <Plus className="w-4 h-4" />
                  {t.counter.addRound}
                </Button>
                <Button size="sm" variant="outline" onClick={handleContinuePast}>
                  {t.counter.continuePast}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Central Tactile Tasbih Counter */}
        <TasbihDial
          count={counter.count}
          target={counter.target}
          percentage={metrics.percentage}
          round={counter.round}
          customization={cust}
          onTap={handleIncrement}
          tapLabel={t.counter.tapToCount}
        />

        {/* Compact Telemetry Strip (Unboxed clean metadata, tabular numerals) */}
        <div className="w-full max-w-md grid grid-cols-4 gap-2 text-center pt-1">
          <button
            type="button"
            onClick={() => {
              setTargetInput(String(counter.target));
              setShowTargetEditor(true);
            }}
            className="rounded-xl py-2 px-1 hover:bg-[var(--accent-soft)] transition-colors cursor-pointer"
            title="Edit target"
          >
            <span className="block text-[11px] text-[var(--text-muted)]">{t.counter.remaining}</span>
            <span className="block text-sm font-semibold font-mono-num text-[var(--text-primary)]">
              {metrics.remaining}
            </span>
          </button>

          <div className="py-2 px-1">
            <span className="block text-[11px] text-[var(--text-muted)]">{t.counter.previous}</span>
            <span className="block text-sm font-semibold font-mono-num text-[var(--text-primary)]">
              {counter.previousCount}
            </span>
          </div>

          {cust.showPercentage ? (
            <div className="py-2 px-1">
              <span className="block text-[11px] text-[var(--text-muted)]">{t.counter.progress}</span>
              <span className="block text-sm font-semibold font-mono-num text-[var(--accent-primary)]">
                {metrics.percentage}%
              </span>
            </div>
          ) : (
            <div className="py-2 px-1">
              <span className="block text-[11px] text-[var(--text-muted)]">{t.counter.round}</span>
              <span className="block text-sm font-semibold font-mono-num text-[var(--text-primary)]">
                {counter.round}
              </span>
            </div>
          )}

          {cust.showTimer ? (
            <div className="py-2 px-1">
              <span className="block text-[11px] text-[var(--text-muted)]">{t.counter.duration}</span>
              <span className="block text-sm font-semibold font-mono-num text-[var(--text-primary)]">
                {formatDuration(elapsedSeconds)}
              </span>
            </div>
          ) : (
            <div className="py-2 px-1">
              <span className="block text-[11px] text-[var(--text-muted)]">{t.counter.round}</span>
              <span className="block text-sm font-semibold font-mono-num text-[var(--text-primary)]">
                {counter.round}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Ergonomic Bottom Control Bar */}
      <footer className="relative z-20 w-full max-w-xl mx-auto px-5 pb-safe py-4">
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={handleUndo}
            disabled={counter.count === 0}
            aria-label={t.counter.undo}
          >
            <Undo2 className="w-4 h-4" />
            {t.counter.undo}
          </Button>

          <Button
            variant="secondary"
            onClick={handleAddRound}
            aria-label={t.counter.addRound}
          >
            <Plus className="w-4 h-4" />
            <span>
              {t.counter.round} {counter.round}
            </span>
          </Button>

          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            onMouseDown={startLongPress}
            onMouseUp={clearLongPress}
            onMouseLeave={clearLongPress}
            onTouchStart={startLongPress}
            onTouchEnd={clearLongPress}
            aria-label={t.counter.reset}
            className="relative overflow-hidden min-h-[44px] px-4 py-2 rounded-xl border border-[var(--border-strong)] text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--accent-soft)] inline-flex items-center gap-2 cursor-pointer"
          >
            {holdProgress > 0 && (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 bg-[var(--accent-gold-soft)] transition-all"
                style={{ width: `${holdProgress}%` }}
              />
            )}
            <RotateCcw className="w-4 h-4 relative z-10" />
            <span className="relative z-10">{t.counter.reset}</span>
          </button>
        </div>

        <p className="mt-2.5 text-center text-[11px] text-[var(--text-muted)]">
          {t.counter.savedLocally} · {t.counter.spaceHint} · {t.counter.holdToReset}
        </p>
      </footer>

      {/* Reset Confirmation */}
      <ConfirmDialog
        open={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={handleConfirmedReset}
        title={t.counter.resetConfirmTitle}
        description={t.counter.resetConfirmDesc}
        confirmLabel={t.counter.reset}
        cancelLabel={t.common.cancel}
        destructive
      />

      {/* Quick Target Editor Modal */}
      <Modal
        open={showTargetEditor}
        onClose={() => setShowTargetEditor(false)}
        title={t.dashboard.target}
        maxWidthClass="max-w-xs"
      >
        <form onSubmit={handleApplyTarget} className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {[33, 34, 100, 300, 500, 1000].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setTargetInput(String(preset))}
                className="px-3 py-1.5 rounded-lg text-xs font-mono-num font-medium bg-[var(--bg-surface-muted)] text-[var(--text-primary)] hover:bg-[var(--accent-soft)] cursor-pointer"
              >
                {preset}
              </button>
            ))}
          </div>
          <div>
            <label htmlFor="counter-target-input" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              {t.customForm.targetLabel}
            </label>
            <Input
              id="counter-target-input"
              type="number"
              min={1}
              max={100000}
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowTargetEditor(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" variant="primary">
              {t.common.save}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Switch Dhikr Modal */}
      <Modal
        open={showSwitcher}
        onClose={() => setShowSwitcher(false)}
        title={t.counter.switchDhikr}
      >
        <div className="space-y-3">
          <Input
            placeholder={t.library.searchPlaceholder}
            value={switcherQuery}
            onChange={(e) => setSwitcherQuery(e.target.value)}
          />
          <div className="max-h-80 overflow-y-auto divide-y divide-[var(--border-subtle)]">
            {filteredSwitchDhikrs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSwitchDhikr(item.id);
                  setShowSwitcher(false);
                }}
                className="w-full py-3 px-2 text-left flex items-center justify-between gap-3 hover:bg-[var(--accent-soft)] rounded-xl transition-colors cursor-pointer"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                    {settings.language === 'bn' && item.nameBn ? item.nameBn : item.name}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] truncate">
                    {item.bengaliPronunciation}
                  </p>
                </div>
                <span className="text-xs font-mono-num text-[var(--text-muted)] shrink-0">
                  {item.recommendedTarget}
                </span>
              </button>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
};
