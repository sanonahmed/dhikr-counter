import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addAnotherRound,
  continuePastTarget,
  createCounterState,
  getCounterMetrics,
  incrementCounter,
  resetCounter,
  undoCounter,
} from './counterEngine';
import {
  buildDailySeries,
  computeAnalyticsSummary,
  computeStreaks,
  deduplicateSessions,
  evaluateGoalProgress,
  resolveDateRange,
} from './analytics';
import { mergeById, sessionsToCsv, validateBackupJson } from './backup';
import { addDays, formatDuration } from './dateUtils';
import type { CountingSession, GoalItem } from '../types/dhikr';

test('counterEngine increments, guards accidental rapid double-tap, undoes, and completes rounds', () => {
  let state = createCounterState(3, 0, 0);

  // First tap at t=1000
  let res = incrementCounter(state, 1000, 95);
  assert.equal(res.didIncrement, true);
  assert.equal(res.next.count, 1);
  state = res.next;

  // Accidental double-tap 30ms later is rejected
  res = incrementCounter(state, 1030, 95);
  assert.equal(res.didIncrement, false);
  assert.equal(res.next.count, 1);

  // Valid second tap
  res = incrementCounter(state, 1150, 95);
  assert.equal(res.didIncrement, true);
  assert.equal(res.next.count, 2);
  state = res.next;

  // Third tap reaches target (3)
  res = incrementCounter(state, 1300, 95);
  assert.equal(res.reachedTarget, true);
  assert.equal(res.next.roundsCompleted, 1);
  assert.equal(res.next.justCompletedRound, true);
  state = res.next;

  // Add another round raises currentRoundTarget to 6
  state = addAnotherRound(state);
  const metrics = getCounterMetrics(state);
  assert.equal(metrics.currentRoundTarget, 6);
  assert.equal(metrics.remaining, 3);
  assert.equal(metrics.percentage, 0);

  // Continue past target clears completion flag
  state = continuePastTarget(state);
  assert.equal(state.continuingPastTarget, true);

  // Undo decrements count
  state = undoCounter(state);
  assert.equal(state.count, 2);

  // Reset returns to 0
  state = resetCounter(33);
  assert.equal(state.count, 0);
  assert.equal(state.target, 33);
});

test('analytics deduplicates sessions and computes accurate streaks, totals, and goals', () => {
  const sampleSessions: CountingSession[] = [
    {
      id: 's1',
      dhikrId: 'astaghfirullah',
      dhikrName: 'Astaghfirullah',
      category: 'istighfar',
      startingCount: 0,
      finalCount: 100,
      target: 100,
      roundsCompleted: 1,
      startTime: 1730000000000,
      lastUpdatedAt: 1730000100000,
      completionTime: 1730000100000,
      durationSeconds: 120,
      status: 'completed',
      dayKey: '2026-11-20',
    },
    // Duplicate id 's1' with newer update must not be double counted
    {
      id: 's1',
      dhikrId: 'astaghfirullah',
      dhikrName: 'Astaghfirullah',
      category: 'istighfar',
      startingCount: 0,
      finalCount: 105,
      target: 100,
      roundsCompleted: 1,
      startTime: 1730000000000,
      lastUpdatedAt: 1730000200000,
      completionTime: 1730000100000,
      durationSeconds: 125,
      status: 'completed',
      dayKey: '2026-11-20',
    },
    {
      id: 's2',
      dhikrId: 'durood-sharif',
      dhikrName: 'Durood Sharif',
      category: 'durood',
      startingCount: 0,
      finalCount: 50,
      target: 100,
      roundsCompleted: 0,
      startTime: 1730100000000,
      lastUpdatedAt: 1730100100000,
      durationSeconds: 90,
      status: 'in_progress',
      dayKey: '2026-11-21',
    },
    {
      id: 's3',
      dhikrId: 'subhanallah',
      dhikrName: 'SubhanAllah',
      category: 'tasbih',
      startingCount: 0,
      finalCount: 33,
      target: 33,
      roundsCompleted: 1,
      startTime: 1730200000000,
      lastUpdatedAt: 1730200100000,
      completionTime: 1730200100000,
      durationSeconds: 45,
      status: 'completed',
      dayKey: '2026-11-22',
    },
  ];

  const deduped = deduplicateSessions(sampleSessions);
  assert.equal(deduped.length, 3);

  const summary = computeAnalyticsSummary(sampleSessions, new Date(2026, 10, 22));
  assert.equal(summary.lifetimeTotal, 188); // 105 + 50 + 33
  assert.equal(summary.totalIstighfar, 105);
  assert.equal(summary.totalDurood, 50);
  assert.equal(summary.totalTasbih, 33);
  assert.equal(summary.todayTotal, 33);
  assert.equal(summary.currentStreak, 3);
  assert.equal(summary.longestStreak, 3);
  assert.equal(summary.personalBestCount, 105);
  assert.equal(summary.mostUsedDhikr?.name, 'Astaghfirullah');

  const streaks = computeStreaks(sampleSessions, '2026-11-22');
  assert.equal(streaks.currentStreak, 3);

  const dailyGoal: GoalItem = {
    id: 'g1',
    title: 'Daily Tasbih',
    period: 'daily',
    scope: 'tasbih',
    targetCount: 33,
    isActive: true,
    createdAt: 0,
    updatedAt: 0,
  };
  const progress = evaluateGoalProgress(dailyGoal, sampleSessions, '2026-11-22');
  assert.equal(progress.achieved, true);
  assert.equal(progress.percentage, 100);

  const bounds = resolveDateRange('last7', '2026-11-22');
  const series = buildDailySeries(sampleSessions, bounds);
  assert.equal(series.length, 7);
  assert.equal(series[series.length - 1].count, 33);
});

test('backup validates JSON, merges without duplicates, and formats CSV cleanly', () => {
  const invalid = validateBackupJson('{"app":"wrong"}');
  assert.equal(invalid.valid, false);

  const valid = validateBackupJson(
    JSON.stringify({
      schemaVersion: 1,
      app: 'dhikr-counter',
      exportedAt: '2026-11-22T00:00:00.000Z',
      dhikrs: [{ id: 'd1', name: 'Test Dhikr' }],
      sessions: [],
      collections: [],
      goals: [],
      reminders: [],
      presets: [],
    })
  );
  assert.equal(valid.valid, true);
  assert.equal(valid.summary?.dhikrs, 1);

  const merged = mergeById([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }]);
  assert.equal(merged.length, 3);

  const csv = sessionsToCsv([
    {
      id: 's1',
      dhikrId: 'd1',
      dhikrName: 'Durood, Sharif',
      category: 'durood',
      startingCount: 0,
      finalCount: 10,
      target: 10,
      roundsCompleted: 1,
      startTime: 1730000000000,
      lastUpdatedAt: 1730000050000,
      durationSeconds: 50,
      status: 'completed',
      dayKey: '2026-11-22',
    },
  ]);
  assert.ok(csv.includes('"Durood, Sharif"'));
  assert.equal(formatDuration(125), '02:05');
  assert.equal(addDays('2026-11-22', -1), '2026-11-21');
});
