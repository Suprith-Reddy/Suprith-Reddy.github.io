/**
 * leitner.ts — the "leitner" Scheduler (§3.3, T1.3).
 *
 * Exact, deterministic semantics (frozen by §3.3 — no approximations):
 *   - buildQueue = cards.filter(c => c.dueDate <= now), ordered HARDEST-FIRST:
 *       ascending `box`, then (tie-break) ascending `dueDate`.
 *     New cards have box=1 & dueDate=createdAt (set in Store.createCard), so they
 *     are immediately due and sort to the front.
 *   - next:
 *       good  → newBox = min(card.box + 1, LEITNER_BOXES)
 *       again → newBox = 1
 *       returns { box: newBox, lastReviewed: now,
 *                 dueDate: now + CADENCE_DAYS[newBox - 1] * DAY_MS }   (rolling 24h,
 *                 NOT calendar-aligned).
 *
 * Pure: `buildQueue` returns a NEW sorted array (input untouched); `next` returns
 * a fresh field patch.
 */
import type { Card, Grade } from '../types';
import { CADENCE_DAYS, DAY_MS, LEITNER_BOXES } from '../types';
import type { Scheduler } from './index';

export const leitnerScheduler: Scheduler = {
  mode: 'leitner',

  buildQueue(cards: Card[], now: number): Card[] {
    return cards
      .filter((c) => c.dueDate <= now)
      .sort((a, b) => {
        if (a.box !== b.box) return a.box - b.box; // hardest (lowest box) first
        return a.dueDate - b.dueDate; // tie-break: most-overdue first
      });
  },

  next(card: Card, grade: Grade, now: number): Pick<Card, 'box' | 'lastReviewed' | 'dueDate'> {
    const newBox = grade === 'good' ? Math.min(card.box + 1, LEITNER_BOXES) : 1;
    // CADENCE_DAYS is index = box-1; box is clamped to 1..LEITNER_BOXES above so
    // the lookup is always in range and never undefined.
    const days = CADENCE_DAYS[newBox - 1] ?? CADENCE_DAYS[CADENCE_DAYS.length - 1]!;
    return {
      box: newBox,
      lastReviewed: now,
      dueDate: now + days * DAY_MS
    };
  }
};
