/**
 * scheduler.test.ts — heavy unit coverage for the §3.3 Scheduler semantics (T1.3).
 *
 * Asserts the EXACT, deterministic contract:
 *   - shuffle: queue is a permutation of ALL cards (dueDate ignored); next only
 *     advances lastReviewed (box/dueDate untouched) — in BOTH modes lastReviewed
 *     advances on grade.
 *   - leitner: buildQueue filters dueDate<=now, hardest-first (asc box, asc dueDate);
 *     next maps good→box+1 (capped), again→box1, dueDate offsets == CADENCE_DAYS.
 */
import { describe, expect, it } from 'vitest';
import type { Card, Grade } from '../types';
import { CADENCE_DAYS, DAY_MS, LEITNER_BOXES } from '../types';
import { getScheduler } from './index';
import { makeShuffleScheduler } from './shuffle';
import { leitnerScheduler } from './leitner';

let nextId = 0;
function card(partial: Partial<Card> = {}): Card {
  const id = `c${nextId++}`;
  return {
    id,
    sectionId: 's1',
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

/** Deterministic RNG: a cyclic sequence in [0,1). */
function seededRng(seq: number[]): () => number {
  let i = 0;
  return () => {
    const v = seq[i % seq.length]!;
    i += 1;
    return v;
  };
}

describe('getScheduler', () => {
  it('returns the leitner scheduler for "leitner"', () => {
    expect(getScheduler('leitner').mode).toBe('leitner');
  });
  it('returns a shuffle scheduler for "shuffle"', () => {
    expect(getScheduler('shuffle').mode).toBe('shuffle');
  });
});

describe('shuffle scheduler', () => {
  it('buildQueue includes ALL cards regardless of dueDate (no filtering)', () => {
    const s = makeShuffleScheduler(seededRng([0]));
    const cards = [
      card({ dueDate: 0 }),
      card({ dueDate: 10 ** 15 }), // far future — still included in shuffle
      card({ dueDate: 5 })
    ];
    const q = s.buildQueue(cards, 100);
    expect(q).toHaveLength(cards.length);
    expect(q.map((c) => c.id).sort()).toEqual(cards.map((c) => c.id).sort());
  });

  it('buildQueue does not mutate the input array', () => {
    const s = makeShuffleScheduler(seededRng([0.9, 0.1, 0.5]));
    const cards = [card(), card(), card(), card()];
    const before = cards.map((c) => c.id);
    s.buildQueue(cards, 0);
    expect(cards.map((c) => c.id)).toEqual(before);
  });

  it('buildQueue is a permutation (deterministic under a seeded RNG)', () => {
    const cards = [card(), card(), card(), card(), card()];
    const a = makeShuffleScheduler(seededRng([0.1, 0.7, 0.3, 0.9])).buildQueue(cards, 0);
    const b = makeShuffleScheduler(seededRng([0.1, 0.7, 0.3, 0.9])).buildQueue(cards, 0);
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id)); // same seed → same order
    expect(a.map((c) => c.id).sort()).toEqual(cards.map((c) => c.id).sort());
  });

  it('next advances ONLY lastReviewed; box + dueDate untouched (both grades)', () => {
    const s = makeShuffleScheduler();
    const c = card({ box: 2, dueDate: 12345, lastReviewed: null });
    for (const g of ['good', 'again'] as Grade[]) {
      const patch = s.next(c, g, 999);
      expect(patch).toEqual({ box: 2, lastReviewed: 999, dueDate: 12345 });
    }
  });
});

describe('leitner scheduler — buildQueue', () => {
  const now = 1000;

  it('filters to cards with dueDate <= now', () => {
    const due1 = card({ dueDate: now });
    const due2 = card({ dueDate: now - 1 });
    const notDue = card({ dueDate: now + 1 });
    const q = leitnerScheduler.buildQueue([due1, due2, notDue], now);
    expect(q.map((c) => c.id).sort()).toEqual([due1.id, due2.id].sort());
  });

  it('orders hardest-first: ascending box', () => {
    const b3 = card({ box: 3, dueDate: 0 });
    const b1 = card({ box: 1, dueDate: 0 });
    const b2 = card({ box: 2, dueDate: 0 });
    const q = leitnerScheduler.buildQueue([b3, b1, b2], now);
    expect(q.map((c) => c.box)).toEqual([1, 2, 3]);
  });

  it('tie-breaks equal boxes by ascending dueDate (most overdue first)', () => {
    const later = card({ box: 1, dueDate: now - 10 });
    const earlier = card({ box: 1, dueDate: now - 100 });
    const q = leitnerScheduler.buildQueue([later, earlier], now);
    expect(q.map((c) => c.id)).toEqual([earlier.id, later.id]);
  });

  it('does not mutate the input array', () => {
    const cards = [card({ box: 3, dueDate: 0 }), card({ box: 1, dueDate: 0 })];
    const before = cards.map((c) => c.id);
    leitnerScheduler.buildQueue(cards, now);
    expect(cards.map((c) => c.id)).toEqual(before);
  });

  it('returns a freshly-created card (box=1, dueDate=createdAt) as due', () => {
    const fresh = card({ box: 1, createdAt: 500, dueDate: 500 });
    expect(leitnerScheduler.buildQueue([fresh], 500).map((c) => c.id)).toEqual([fresh.id]);
  });
});

describe('leitner scheduler — next', () => {
  const now = 1_000_000;

  it('good promotes box+1 with dueDate = now + CADENCE_DAYS[newBox-1]*DAY_MS', () => {
    for (let box = 1; box < LEITNER_BOXES; box++) {
      const patch = leitnerScheduler.next(card({ box }), 'good', now);
      const newBox = box + 1;
      expect(patch.box).toBe(newBox);
      expect(patch.lastReviewed).toBe(now);
      expect(patch.dueDate).toBe(now + CADENCE_DAYS[newBox - 1]! * DAY_MS);
    }
  });

  it('good at the top box stays capped at LEITNER_BOXES', () => {
    const patch = leitnerScheduler.next(card({ box: LEITNER_BOXES }), 'good', now);
    expect(patch.box).toBe(LEITNER_BOXES);
    expect(patch.dueDate).toBe(now + CADENCE_DAYS[LEITNER_BOXES - 1]! * DAY_MS);
  });

  it('again resets to box 1 with dueDate = now + CADENCE_DAYS[0]*DAY_MS', () => {
    for (let box = 1; box <= LEITNER_BOXES; box++) {
      const patch = leitnerScheduler.next(card({ box }), 'again', now);
      expect(patch.box).toBe(1);
      expect(patch.lastReviewed).toBe(now);
      expect(patch.dueDate).toBe(now + CADENCE_DAYS[0]! * DAY_MS);
    }
  });

  it('dueDate offsets exactly equal the CADENCE_DAYS table (rolling 24h)', () => {
    // box1 good → box2 → 3 days; box2 good → box3 → 7 days; box3 good → box3 → 7 days.
    expect(leitnerScheduler.next(card({ box: 1 }), 'good', 0).dueDate).toBe(3 * DAY_MS);
    expect(leitnerScheduler.next(card({ box: 2 }), 'good', 0).dueDate).toBe(7 * DAY_MS);
    expect(leitnerScheduler.next(card({ box: 3 }), 'good', 0).dueDate).toBe(7 * DAY_MS);
    // any again → box1 → 1 day.
    expect(leitnerScheduler.next(card({ box: 3 }), 'again', 0).dueDate).toBe(1 * DAY_MS);
  });
});
