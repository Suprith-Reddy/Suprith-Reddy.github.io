/**
 * stats.helpers.test.ts — unit tests for the pure T1.7 stats math.
 *
 * Pure functions only (no DOM / no Store), so these run fast and deterministically.
 * We pin `now` to a fixed local instant and build minimal Card/Section/ReviewLog
 * fixtures.
 */
import { describe, expect, it } from 'vitest';
import type { Card, ReviewLogEntry, Section } from '../lib/types';
import { LEITNER_BOXES, DAY_MS } from '../lib/types';
import { startOfLocalDay } from '../lib/util/time';
import {
  boxDistribution,
  computeStats,
  computeStreak,
  dueToday,
  endOfLocalDay,
  sectionMastery
} from './stats.helpers';

// A fixed reference instant: 2026-06-19 12:00 local.
const NOW = new Date(2026, 5, 19, 12, 0, 0, 0).getTime();

function section(id: string, order = 0): Section {
  return { id, name: `S-${id}`, order, createdAt: 0 };
}

function card(partial: Partial<Card> & Pick<Card, 'id' | 'sectionId'>): Card {
  return {
    front: 'q',
    back: 'a',
    tags: [],
    box: 1,
    lastReviewed: null,
    dueDate: 0,
    createdAt: 0,
    modifiedAt: 0,
    ...partial
  };
}

function review(ts: number, cardId = 'c'): ReviewLogEntry {
  return { seq: 0, cardId, ts, grade: 'good', mode: 'leitner', elapsedMs: 100 };
}

describe('endOfLocalDay', () => {
  it('is start of next local day minus 1 ms', () => {
    const end = endOfLocalDay(NOW);
    const startNext = new Date(startOfLocalDay(NOW));
    startNext.setDate(startNext.getDate() + 1);
    expect(end).toBe(startNext.getTime() - 1);
  });

  it('is on the same local day as the input', () => {
    expect(startOfLocalDay(endOfLocalDay(NOW))).toBe(startOfLocalDay(NOW));
  });
});

describe('dueToday', () => {
  it('counts cards due by end of today, including ones scheduled later today', () => {
    const cards: Card[] = [
      card({ id: 'a', sectionId: 's', dueDate: NOW - DAY_MS }), // overdue
      card({ id: 'b', sectionId: 's', dueDate: endOfLocalDay(NOW) }), // late today
      card({ id: 'c', sectionId: 's', dueDate: endOfLocalDay(NOW) + 1 }) // tomorrow
    ];
    expect(dueToday(cards, NOW)).toBe(2);
  });

  it('a freshly-created card (dueDate=createdAt<=now) is due today', () => {
    const cards: Card[] = [card({ id: 'a', sectionId: 's', dueDate: NOW, createdAt: NOW })];
    expect(dueToday(cards, NOW)).toBe(1);
  });
});

describe('computeStreak', () => {
  it('is 0 with no reviews', () => {
    expect(computeStreak([], NOW)).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    const today = startOfLocalDay(NOW);
    const log = [
      review(today + 1000),
      review(today - DAY_MS + 1000),
      review(today - 2 * DAY_MS + 1000)
    ];
    expect(computeStreak(log, NOW)).toBe(3);
  });

  it('ends at yesterday when nothing studied yet today', () => {
    const today = startOfLocalDay(NOW);
    const log = [review(today - DAY_MS + 1000), review(today - 2 * DAY_MS + 1000)];
    expect(computeStreak(log, NOW)).toBe(2);
  });

  it('is 0 when the most recent review is older than yesterday (lapsed)', () => {
    const today = startOfLocalDay(NOW);
    const log = [review(today - 2 * DAY_MS + 1000)];
    expect(computeStreak(log, NOW)).toBe(0);
  });

  it('multiple reviews on the same day count as one day', () => {
    const today = startOfLocalDay(NOW);
    const log = [review(today + 1000), review(today + 2000), review(today - DAY_MS + 500)];
    expect(computeStreak(log, NOW)).toBe(2);
  });

  it('stops at the first gap', () => {
    const today = startOfLocalDay(NOW);
    // today, yesterday studied; day -2 missing; day -3 studied (not counted).
    const log = [
      review(today + 1000),
      review(today - DAY_MS + 1000),
      review(today - 3 * DAY_MS + 1000)
    ];
    expect(computeStreak(log, NOW)).toBe(2);
  });

  it('uses calendar-correct "yesterday" (DST-safe anchor)', () => {
    // Regression (adversarial review): the "yesterday" anchor must be derived the
    // same DST-safe way as the backward walk — startOfLocalDay(today - 1) — NOT
    // `today - DAY_MS`. The real previous local-day-start can be 23h or 25h before
    // today's start around a DST transition. We build the "yesterday" entry using
    // the *correct* previous day-start so the test is TZ-independent: a review on
    // today + the calendar-correct previous day must report a 2-day streak.
    const today = startOfLocalDay(NOW);
    const prevDayStart = startOfLocalDay(today - 1); // true previous local day
    const log = [review(today + 1000), review(prevDayStart + 1000)];
    expect(computeStreak(log, NOW)).toBe(2);
  });

  it('reports a 2-day streak when only yesterday+today (calendar-correct) studied', () => {
    const today = startOfLocalDay(NOW);
    const prevDayStart = startOfLocalDay(today - 1);
    const twoAgoStart = startOfLocalDay(prevDayStart - 1);
    // Studied the real previous day and the day before it, but not yet today.
    const log = [review(prevDayStart + 1000), review(twoAgoStart + 1000)];
    expect(computeStreak(log, NOW)).toBe(2);
  });
});

describe('boxDistribution', () => {
  it('counts cards per box (length = LEITNER_BOXES)', () => {
    const cards: Card[] = [
      card({ id: 'a', sectionId: 's', box: 1 }),
      card({ id: 'b', sectionId: 's', box: 1 }),
      card({ id: 'c', sectionId: 's', box: 2 }),
      card({ id: 'd', sectionId: 's', box: LEITNER_BOXES })
    ];
    const dist = boxDistribution(cards);
    expect(dist).toHaveLength(LEITNER_BOXES);
    expect(dist[0]).toBe(2);
    expect(dist[1]).toBe(1);
    expect(dist[LEITNER_BOXES - 1]).toBe(1);
  });

  it('clamps out-of-range boxes into bounds', () => {
    const cards: Card[] = [
      card({ id: 'a', sectionId: 's', box: 0 }),
      card({ id: 'b', sectionId: 's', box: 999 })
    ];
    const dist = boxDistribution(cards);
    expect(dist[0]).toBe(1);
    expect(dist[LEITNER_BOXES - 1]).toBe(1);
  });

  it('is all zeros for no cards', () => {
    expect(boxDistribution([])).toEqual(new Array(LEITNER_BOXES).fill(0));
  });
});

describe('sectionMastery', () => {
  it('computes % of cards in the top box per section', () => {
    const sections = [section('s1', 0), section('s2', 1)];
    const cards: Card[] = [
      card({ id: 'a', sectionId: 's1', box: LEITNER_BOXES }),
      card({ id: 'b', sectionId: 's1', box: 1 }),
      card({ id: 'c', sectionId: 's1', box: LEITNER_BOXES }),
      card({ id: 'd', sectionId: 's1', box: 2 }),
      card({ id: 'e', sectionId: 's2', box: LEITNER_BOXES })
    ];
    const m = sectionMastery(sections, cards);
    expect(m[0]).toMatchObject({ total: 4, mastered: 2, percent: 50 });
    expect(m[1]).toMatchObject({ total: 1, mastered: 1, percent: 100 });
  });

  it('reports 0% (not NaN) for an empty section', () => {
    const m = sectionMastery([section('s1')], []);
    expect(m[0]).toMatchObject({ total: 0, mastered: 0, percent: 0 });
    expect(Number.isNaN(m[0]!.percent)).toBe(false);
  });

  it('preserves the order of the passed sections', () => {
    const sections = [section('b', 0), section('a', 1)];
    const m = sectionMastery(sections, []);
    expect(m.map((x) => x.section.id)).toEqual(['b', 'a']);
  });
});

describe('computeStats', () => {
  it('composes totals + all sub-stats', () => {
    const sections = [section('s1')];
    const cards: Card[] = [
      card({ id: 'a', sectionId: 's1', box: LEITNER_BOXES, dueDate: NOW }),
      card({ id: 'b', sectionId: 's1', box: 1, dueDate: endOfLocalDay(NOW) + DAY_MS })
    ];
    const log = [review(startOfLocalDay(NOW) + 1000)];
    const stats = computeStats(sections, cards, log, NOW);
    expect(stats.totalCards).toBe(2);
    expect(stats.totalSections).toBe(1);
    expect(stats.totalReviews).toBe(1);
    expect(stats.dueToday).toBe(1);
    expect(stats.streak).toBe(1);
    expect(stats.boxes).toHaveLength(LEITNER_BOXES);
    expect(stats.mastery[0]).toMatchObject({ percent: 50 });
  });
});
