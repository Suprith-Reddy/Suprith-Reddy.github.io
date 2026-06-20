/**
 * shuffle.ts — the "shuffle" Scheduler (§3.3, T1.3).
 *
 * Exact, deterministic semantics (frozen by §3.3):
 *   - buildQueue = Fisher–Yates (`util/shuffle.ts`) over ALL passed cards
 *     (shuffle mode ignores dueDate — every card is in play).
 *   - next       = { box: card.box, lastReviewed: now, dueDate: card.dueDate }
 *                  Only `lastReviewed` advances; box/dueDate are untouched, so
 *                  "last studied" is correct even in shuffle mode and no
 *                  scheduling change leaks into the Leitner state.
 *
 * Pure: `buildQueue` returns a NEW array (it never mutates its input); `next`
 * returns a fresh field patch. `rng` is injectable so the queue order is
 * deterministic under test (defaults to Math.random in production).
 */
import type { Card, Grade } from '../types';
import { shuffle } from '../util/shuffle';
import type { Scheduler } from './index';

/** Construct a shuffle scheduler. `rng` defaults to Math.random (DI for tests). */
export function makeShuffleScheduler(rng: () => number = Math.random): Scheduler {
  return {
    mode: 'shuffle',
    buildQueue(cards: Card[], _now: number): Card[] {
      return shuffle(cards, rng);
    },
    next(card: Card, _grade: Grade, now: number): Pick<Card, 'box' | 'lastReviewed' | 'dueDate'> {
      return { box: card.box, lastReviewed: now, dueDate: card.dueDate };
    }
  };
}
