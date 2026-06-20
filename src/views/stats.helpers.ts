/**
 * stats.helpers.ts — pure, unit-tested stats computations for Stats.svelte (T1.7).
 *
 * These functions are deliberately PURE (no Store / no rune access): the view
 * loads the raw data (sections, cards, reviewLog) via the §3.6 stores, then hands
 * it here. Keeping them pure makes the stats math (the part most likely to be
 * subtly wrong — streaks, day boundaries, mastery) directly unit-testable without
 * a DOM or IndexedDB.
 *
 * Definitions are exactly per the T1.7 acceptance row:
 *   - due-today  = cards `isDue(card, endOfLocalDay(now))`            (shared time.ts#isDue)
 *   - streak     = consecutive local-calendar days ending today (or yesterday if
 *                  none yet today) each with ≥1 reviewLog entry
 *   - mastery    = per section, % of that section's cards with box===LEITNER_BOXES
 *   - per-box distribution = count of cards in each Leitner box (1..LEITNER_BOXES)
 *
 * `time.ts` (T0.4, frozen surface) exposes startOfLocalDay/isSameLocalDay/isDue
 * but NOT endOfLocalDay, so we derive end-of-day here from startOfLocalDay
 * (start of NEXT local day minus 1 ms) rather than editing the shared module.
 */
import type { Card, ReviewLogEntry, Section } from '../lib/types';
import { LEITNER_BOXES } from '../lib/types';
import { isDue, startOfLocalDay } from '../lib/util/time';

/**
 * Last instant (ms epoch) of the local calendar day containing `ts`.
 * = start of the next local day − 1 ms. Computed via Date so it survives DST
 * (the next day's 00:00 is found by advancing the calendar date, not adding 24h).
 */
export function endOfLocalDay(ts: number): number {
  const d = new Date(startOfLocalDay(ts));
  d.setDate(d.getDate() + 1); // 00:00 of the following local day
  return d.getTime() - 1;
}

/**
 * Cards due by the end of today (local). Using end-of-day (rather than `now`)
 * means a card scheduled for later today still counts as "due today" — the
 * motivating, calendar-aligned reading the stats screen wants.
 */
export function dueToday(cards: readonly Card[], now: number): number {
  const cutoff = endOfLocalDay(now);
  let n = 0;
  for (const c of cards) if (isDue(c, cutoff)) n++;
  return n;
}

/**
 * Study streak: consecutive local-calendar days, each with ≥1 review, ending
 * today — or, if there is no review yet today, ending yesterday (so an unbroken
 * streak isn't reported as 0 just because you haven't studied yet this morning).
 *
 * Returns 0 when there are no reviews, or when the most recent review is older
 * than yesterday (the streak has lapsed).
 */
export function computeStreak(reviewLog: readonly ReviewLogEntry[], now: number): number {
  if (reviewLog.length === 0) return 0;

  // Set of local-day-start timestamps that have ≥1 review.
  const studiedDays = new Set<number>();
  for (const entry of reviewLog) studiedDays.add(startOfLocalDay(entry.ts));

  const today = startOfLocalDay(now);
  // Previous local day-start, computed DST-safely the same way as the loop step:
  // subtract 1 ms from today's day-start (landing in the prior local day) and
  // renormalize. `today - DAY_MS` is NOT safe across DST transitions (the prior
  // day-start can be 23h or 25h earlier), which could miss "yesterday".
  const yesterday = startOfLocalDay(today - 1);

  // Anchor: today if studied today, else yesterday if studied yesterday, else lapsed.
  let day: number;
  if (studiedDays.has(today)) day = today;
  else if (studiedDays.has(yesterday)) day = yesterday;
  else return 0;

  // Walk backwards one calendar day at a time while each day was studied.
  let streak = 0;
  while (studiedDays.has(day)) {
    streak++;
    day = startOfLocalDay(day - 1); // step to the previous local day (DST-safe via normalize)
  }
  return streak;
}

/** Count of cards in each Leitner box, index 0 → box 1 … index LEITNER_BOXES-1 → top box. */
export function boxDistribution(cards: readonly Card[]): number[] {
  const dist = new Array<number>(LEITNER_BOXES).fill(0);
  for (const c of cards) {
    // Clamp defensively so an out-of-range box never indexes past the array.
    const idx = Math.min(Math.max(c.box, 1), LEITNER_BOXES) - 1;
    dist[idx] = (dist[idx] ?? 0) + 1;
  }
  return dist;
}

export interface SectionMastery {
  section: Section;
  total: number;
  mastered: number; // cards with box === LEITNER_BOXES
  percent: number; // 0..100, integer; 0 when the section has no cards
}

/**
 * Per-section mastery: % of the section's cards sitting in the top Leitner box.
 * A section with no cards reports 0% (not NaN). One row per passed section, in
 * the order given (the view passes sections already ordered by `order`).
 */
export function sectionMastery(
  sections: readonly Section[],
  cards: readonly Card[]
): SectionMastery[] {
  // Bucket cards by section once (O(cards)) instead of filtering per section.
  const bySection = new Map<string, { total: number; mastered: number }>();
  for (const c of cards) {
    const agg = bySection.get(c.sectionId) ?? { total: 0, mastered: 0 };
    agg.total++;
    if (c.box === LEITNER_BOXES) agg.mastered++;
    bySection.set(c.sectionId, agg);
  }
  return sections.map((section) => {
    const agg = bySection.get(section.id) ?? { total: 0, mastered: 0 };
    const percent = agg.total === 0 ? 0 : Math.round((agg.mastered / agg.total) * 100);
    return { section, total: agg.total, mastered: agg.mastered, percent };
  });
}

export interface StatsSnapshot {
  totalCards: number;
  totalSections: number;
  totalReviews: number;
  dueToday: number;
  streak: number;
  boxes: number[]; // per-box counts, length LEITNER_BOXES
  mastery: SectionMastery[];
}

/** Compose every stat from raw data in one pass-friendly call (used by the view). */
export function computeStats(
  sections: readonly Section[],
  cards: readonly Card[],
  reviewLog: readonly ReviewLogEntry[],
  now: number
): StatsSnapshot {
  return {
    totalCards: cards.length,
    totalSections: sections.length,
    totalReviews: reviewLog.length,
    dueToday: dueToday(cards, now),
    streak: computeStreak(reviewLog, now),
    boxes: boxDistribution(cards),
    mastery: sectionMastery(sections, cards)
  };
}
