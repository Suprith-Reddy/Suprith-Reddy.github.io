/**
 * util.test.ts — unit coverage for the T0.4 utilities:
 * id (uuid shape), tags (normalization chokepoint), shuffle (Fisher–Yates,
 * pure + deterministic with injected rng), time (local-day helpers, isDue).
 */
import { describe, expect, it } from 'vitest';
import type { Card } from '../types';
import { DAY_MS } from '../types';
import { newId } from './id';
import { normalizeTag, normalizeTags } from './tags';
import { shuffle } from './shuffle';
import { daysBetweenLocal, isDue, isSameLocalDay, now, startOfLocalDay } from './time';

describe('id', () => {
  it('newId returns a v4 UUID-shaped string, unique across calls', () => {
    const a = newId();
    const b = newId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
});

describe('tags', () => {
  it('normalizeTag lowercases, strips leading #, trims', () => {
    expect(normalizeTag('#SQL')).toBe('sql');
    expect(normalizeTag('  Joins ')).toBe('joins');
    expect(normalizeTag('##nested')).toBe('nested');
    expect(normalizeTag('#')).toBe('');
    expect(normalizeTag('')).toBe('');
  });

  it('normalizeTags drops empties + de-dupes preserving first-seen order', () => {
    expect(normalizeTags(['#A', 'a', '', '  ', 'B', '#b'])).toEqual(['a', 'b']);
    expect(normalizeTags(null)).toEqual([]);
    expect(normalizeTags(undefined)).toEqual([]);
  });
});

describe('shuffle', () => {
  it('is pure (input untouched) and returns a permutation', () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(input, () => 0.5);
    expect(input).toEqual([1, 2, 3, 4, 5]);
    expect(out.slice().sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('is deterministic with a fixed rng', () => {
    const seq = [0.1, 0.9, 0.3, 0.7];
    let i = 0;
    const rng = () => seq[i++ % seq.length]!;
    let j = 0;
    const rng2 = () => seq[j++ % seq.length]!;
    expect(shuffle([1, 2, 3, 4, 5], rng)).toEqual(shuffle([1, 2, 3, 4, 5], rng2));
  });
});

describe('time', () => {
  it('now returns a number close to Date.now', () => {
    expect(Math.abs(now() - Date.now())).toBeLessThan(1000);
  });

  it('startOfLocalDay is midnight-aligned and idempotent', () => {
    const t = Date.now();
    const s = startOfLocalDay(t);
    expect(startOfLocalDay(s)).toBe(s);
    const d = new Date(s);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
  });

  it('isSameLocalDay + daysBetweenLocal', () => {
    const t = startOfLocalDay(Date.now());
    expect(isSameLocalDay(t, t + 1000)).toBe(true);
    expect(isSameLocalDay(t, t + DAY_MS)).toBe(false);
    expect(daysBetweenLocal(t, t + DAY_MS)).toBe(1);
    expect(daysBetweenLocal(t + DAY_MS, t)).toBe(-1);
    expect(daysBetweenLocal(t, t + 5 * DAY_MS)).toBe(5);
  });

  it('isDue is true when dueDate <= now', () => {
    const base = { id: 'x', sectionId: 's', front: '', back: '', tags: [], box: 1, lastReviewed: null, createdAt: 0, modifiedAt: 0 };
    const dueNow: Card = { ...base, dueDate: 100 };
    expect(isDue(dueNow, 100)).toBe(true);
    expect(isDue(dueNow, 101)).toBe(true);
    expect(isDue({ ...base, dueDate: 200 }, 100)).toBe(false);
  });
});
