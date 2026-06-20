/**
 * time.ts — time helpers (T0.4).
 *
 * Exports per §4 T0.4 acceptance: now / DAY_MS / startOfLocalDay /
 * isSameLocalDay / isDue(card, now) / daysBetweenLocal.
 *
 * "Local day" boundaries use the host's local timezone (the user studies on
 * their own device, so calendar streaks / due-today should be local, not UTC).
 * The Leitner cadence itself is a rolling 24h offset (§3.3) — that lives in the
 * scheduler, not here. These helpers are for calendar-aligned stats (T1.7).
 */
import type { Card } from '../types';
import { DAY_MS } from '../types';

// Re-export DAY_MS so consumers can import it from the time module (per T0.4 surface).
export { DAY_MS };

/** Current wall-clock time in ms epoch. Wrapped so tests can reason about it. */
export function now(): number {
  return Date.now();
}

/** Start of the local calendar day (00:00:00.000 local) containing `ts`, as ms epoch. */
export function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** True when `a` and `b` fall on the same local calendar day. */
export function isSameLocalDay(a: number, b: number): boolean {
  return startOfLocalDay(a) === startOfLocalDay(b);
}

/**
 * Whole local-calendar days between `a` and `b` (b - a), by day boundary.
 * Positive when `b` is on a later day than `a`; negative if earlier; 0 same day.
 * Uses day-start normalization so DST shifts don't produce fractional days.
 */
export function daysBetweenLocal(a: number, b: number): number {
  const diff = startOfLocalDay(b) - startOfLocalDay(a);
  return Math.round(diff / DAY_MS);
}

/**
 * Is the card due at instant `now`? A card is due when `dueDate <= now`.
 * `dueDate` is NEVER null (types.ts) — a freshly-created card has dueDate =
 * createdAt and is therefore immediately due.
 */
export function isDue(card: Card, nowTs: number): boolean {
  return card.dueDate <= nowTs;
}
