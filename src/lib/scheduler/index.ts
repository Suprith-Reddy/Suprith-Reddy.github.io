/**
 * scheduler/index.ts — Scheduler interface + getScheduler (§3.3).
 *
 * OWNERSHIP (§7): T0.4 owns this FROZEN interface and the `getScheduler`
 * SIGNATURE. T1.3 implements `shuffle.ts` + `leitner.ts` and fills the
 * `getScheduler` BODY (it imports those modules here). Do NOT change the
 * interface or signature — Wave 1 codes against it.
 *
 * Semantics (frozen, for T1.3 to implement — see §3.3):
 *   - shuffle.buildQueue = Fisher–Yates over all passed cards.
 *   - shuffle.next       = { box, lastReviewed: now, dueDate } — only lastReviewed advances.
 *   - leitner.buildQueue = cards.filter(dueDate <= now), hardest-first
 *                          (ascending box, then ascending dueDate).
 *   - leitner.next       = good → box+1 (capped at LEITNER_BOXES); again → box 1;
 *                          dueDate = now + CADENCE_DAYS[newBox-1] * DAY_MS.
 */
import type { Card, Grade, ReviewMode } from '../types';
import { makeShuffleScheduler } from './shuffle';
import { leitnerScheduler } from './leitner';

export interface Scheduler {
  mode: ReviewMode;
  /** Order/select the cards to study this session. Pure. */
  buildQueue(cards: Card[], now: number): Card[];
  /** Given a grade, return the card-field updates to persist. Pure, deterministic. */
  next(card: Card, grade: Grade, now: number): Pick<Card, 'box' | 'lastReviewed' | 'dueDate'>;
}

// The shuffle scheduler is stateless aside from its RNG, so a single default
// instance (Math.random) is reused. Tests that need a deterministic order build
// their own via `makeShuffleScheduler(rng)`.
const shuffleScheduler: Scheduler = makeShuffleScheduler();

/**
 * Return the scheduler for the given mode (§3.3). Body filled by T1.3; the
 * SIGNATURE is frozen by T0.4.
 */
export function getScheduler(mode: ReviewMode): Scheduler {
  return mode === 'leitner' ? leitnerScheduler : shuffleScheduler;
}
