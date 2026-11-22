export interface CounterState {
  count: number;
  target: number;
  round: number;
  roundsCompleted: number;
  previousCount: number;
  lastTapTimestamp: number;
  justCompletedRound: boolean;
  continuingPastTarget: boolean;
}

export function createCounterState(target: number, initialCount = 0, roundsCompleted = 0): CounterState {
  const safeTarget = Math.max(1, Math.floor(target));
  return {
    count: Math.max(0, Math.floor(initialCount)),
    target: safeTarget,
    round: roundsCompleted + 1,
    roundsCompleted,
    previousCount: Math.max(0, Math.floor(initialCount) - 1),
    lastTapTimestamp: 0,
    justCompletedRound: false,
    continuingPastTarget: initialCount > safeTarget,
  };
}

export function incrementCounter(
  state: CounterState,
  nowMs: number,
  debounceMs = 95
): { next: CounterState; didIncrement: boolean; reachedTarget: boolean } {
  if (state.lastTapTimestamp > 0 && nowMs - state.lastTapTimestamp < debounceMs) {
    return { next: state, didIncrement: false, reachedTarget: false };
  }

  const nextCount = state.count + 1;
  const targetThreshold = state.target * state.round;
  const reachedTarget = !state.continuingPastTarget && nextCount === targetThreshold;

  return {
    didIncrement: true,
    reachedTarget,
    next: {
      ...state,
      previousCount: state.count,
      count: nextCount,
      lastTapTimestamp: nowMs,
      roundsCompleted: reachedTarget ? state.roundsCompleted + 1 : state.roundsCompleted,
      justCompletedRound: reachedTarget,
    },
  };
}

export function undoCounter(state: CounterState): CounterState {
  if (state.count <= 0) return state;
  const nextCount = state.count - 1;
  const expectedRoundsCompleted = Math.floor(nextCount / state.target);
  return {
    ...state,
    previousCount: Math.max(0, nextCount - 1),
    count: nextCount,
    roundsCompleted: Math.min(state.roundsCompleted, expectedRoundsCompleted),
    justCompletedRound: false,
  };
}

export function addAnotherRound(state: CounterState): CounterState {
  return {
    ...state,
    round: state.round + 1,
    justCompletedRound: false,
    continuingPastTarget: false,
  };
}

export function continuePastTarget(state: CounterState): CounterState {
  return {
    ...state,
    justCompletedRound: false,
    continuingPastTarget: true,
  };
}

export function resetCounter(target: number): CounterState {
  return createCounterState(target, 0, 0);
}

export function getCounterMetrics(state: CounterState) {
  const currentRoundTarget = state.target * state.round;
  const roundStart = state.target * (state.round - 1);
  const countInCurrentRound = Math.max(0, state.count - roundStart);
  const remaining = Math.max(0, currentRoundTarget - state.count);
  const percentage =
    state.target > 0
      ? Math.min(100, Math.round((countInCurrentRound / state.target) * 100))
      : 0;

  return {
    currentRoundTarget,
    countInCurrentRound,
    remaining,
    percentage,
  };
}
