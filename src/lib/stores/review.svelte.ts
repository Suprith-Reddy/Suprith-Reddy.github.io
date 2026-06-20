/**
 * review.svelte.ts — review session state machine (§3.6, T0.5).
 *
 * Drives a study session:
 *   startSession(scope, mode)
 *     → fetch the scope's cards from the Store
 *     → scheduler = getScheduler(mode); queue = scheduler.buildQueue(cards, now)
 *     → show queue[0]; start the elapsed clock.
 *   flip()  → reveal the answer; mirror it into the global LiveRegion.
 *             Does NOT reset the elapsed clock (the clock measures shown→grade).
 *   grade(g)
 *     → updates = scheduler.next(current, g, now)
 *     → store.recordReview(current.id, updates)      (schedule fields; no modifiedAt bump)
 *     → store.appendReview({cardId, ts, grade, mode, elapsedMs})   (real timing)
 *     → advance to the next card (restart the clock) or finish (build summary).
 *
 * Public surface is FROZEN by §3.6.
 *
 * Seams for determinism/parallelism (not part of the frozen API, underscore-prefixed):
 *   - `_setClockForTests(fn)` overrides the `now()` clock so elapsedMs is exact.
 *   - `_setSchedulerProviderForTests(fn)` overrides `getScheduler` so this store can
 *     be unit-tested BEFORE T1.3 lands the real schedulers (getScheduler currently
 *     throws by design until then).
 */
import type { Card, Grade, ReviewMode, ReviewScope } from '../types';
import { getScheduler, type Scheduler } from '../scheduler/index';
import { announce } from '../a11y/liveRegion';
import { getStore } from './_store.svelte';

// ── reactive session state ───────────────────────────────────────────────────
let _queue = $state<Card[]>([]);
let _index = $state<number>(0);
let _revealed = $state<boolean>(false);
let _summary = $state<{ reviewed: number; again: number; good: number } | null>(null);

// Non-reactive session bookkeeping.
let _mode: ReviewMode = 'shuffle';
let _scheduler: Scheduler | null = null;
let _shownAt = 0; // clock: ms when the CURRENT card was first shown.
let _tally = { reviewed: 0, again: 0, good: 0 };

export const current: { value: Card | null } = {
  get value() {
    return _index < _queue.length ? (_queue[_index] ?? null) : null;
  }
};

export const revealed: { value: boolean } = {
  get value() {
    return _revealed;
  }
};

export const position: { value: { index: number; total: number } } = {
  get value() {
    return { index: _index, total: _queue.length };
  }
};

export const summary: {
  value: { reviewed: number; again: number; good: number } | null;
} = {
  get value() {
    return _summary;
  }
};

/**
 * Begin a session over `scope` with scheduler `mode`. Fetches the scope's cards,
 * builds the queue, and shows the first card (starting its elapsed clock).
 */
export async function startSession(scope: ReviewScope, mode: ReviewMode): Promise<void> {
  const store = await getStore();
  const cards = await fetchScopeCards(scope);
  _mode = mode;
  _scheduler = schedulerProvider(mode);
  _queue = _scheduler.buildQueue(cards, clock());
  _index = 0;
  _revealed = false;
  _summary = null;
  _tally = { reviewed: 0, again: 0, good: 0 };
  startClock();
  void store; // store already used for fetch; kept for symmetry/clarity.
}

/** Reveal the current answer and mirror it to the LiveRegion. Clock keeps running. */
export function flip(): void {
  if (_revealed) return;
  const card = current.value;
  if (!card) return;
  _revealed = true;
  announce(card.back);
}

/**
 * Grade the current card: compute schedule updates, persist the review (record +
 * append the log entry with real `elapsedMs`), tally, then advance.
 */
export async function grade(g: Grade): Promise<void> {
  const card = current.value;
  if (!card || !_scheduler) return;

  const at = clock();
  const elapsedMs = Math.max(0, at - _shownAt);
  const updates = _scheduler.next(card, g, at);

  const store = await getStore();
  await store.recordReview(card.id, updates);
  await store.appendReview({
    cardId: card.id,
    ts: at,
    grade: g,
    mode: _mode,
    elapsedMs
  });

  _tally = {
    reviewed: _tally.reviewed + 1,
    again: _tally.again + (g === 'again' ? 1 : 0),
    good: _tally.good + (g === 'good' ? 1 : 0)
  };

  advance();
}

/** Advance to the next card (restart the clock) or finish the session. */
function advance(): void {
  _index += 1;
  _revealed = false;
  if (_index >= _queue.length) {
    _summary = { ..._tally };
  } else {
    startClock();
  }
}

/** Start/restart the elapsed clock for the now-current card. */
function startClock(): void {
  _shownAt = clock();
}

/** Resolve the cards in scope from the Store. */
async function fetchScopeCards(scope: ReviewScope): Promise<Card[]> {
  const store = await getStore();
  switch (scope.kind) {
    case 'all':
      return store.listCards();
    case 'section':
      return store.listCards(scope.id);
    case 'tag':
      return store.cardsByTag(scope.tag);
  }
}

// ── injectable seams (test-only) ─────────────────────────────────────────────

let _clock: () => number = () => Date.now();
let _schedulerProvider: (mode: ReviewMode) => Scheduler = getScheduler;

function clock(): number {
  return _clock();
}

function schedulerProvider(mode: ReviewMode): Scheduler {
  return _schedulerProvider(mode);
}

/** Test-only: override the `now()` clock for deterministic elapsedMs. */
export function _setClockForTests(fn: () => number): void {
  _clock = fn;
}

/**
 * Test-only: override `getScheduler` (which throws until T1.3 lands the real
 * schedulers) so the session machine can be unit-tested in isolation.
 */
export function _setSchedulerProviderForTests(
  fn: ((mode: ReviewMode) => Scheduler) | null
): void {
  _schedulerProvider = fn ?? getScheduler;
}

/** Test-only: reset all session state. */
export function _resetReviewForTests(): void {
  _queue = [];
  _index = 0;
  _revealed = false;
  _summary = null;
  _mode = 'shuffle';
  _scheduler = null;
  _shownAt = 0;
  _tally = { reviewed: 0, again: 0, good: 0 };
  _clock = () => Date.now();
  _schedulerProvider = getScheduler;
}
