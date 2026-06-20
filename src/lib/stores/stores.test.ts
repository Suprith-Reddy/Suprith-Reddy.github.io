/**
 * stores.test.ts — Vitest coverage for the §3.6 reactive store layer (T0.5).
 *
 * Each store is wired to a real `Store` built over an in-memory idb fake
 * (`makeStore(makeFakeDb())`), injected via `_setStoreForTests`. We assert the
 * cache reflects persisted truth, undo re-creates by original id, theme resolves
 * + applies `[data-theme]`, and the review session drives
 * scheduler.next → recordReview → appendReview with a real elapsedMs (clock
 * runs shown→grade; flip does not reset it).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { Card, Grade, ReviewMode } from '../types';
import { LEITNER_BOXES, CADENCE_DAYS, DAY_MS } from '../types';
import { makeStore } from '../db/store';
import type { Store } from '../db/index';
import type { Scheduler } from '../scheduler/index';
import { makeFakeDb } from './_fakeDb';
import { _setStoreForTests } from './_store.svelte';

import * as sectionsStore from './sections.svelte';
import * as cardsStore from './cards.svelte';
import * as settingsStore from './settings.svelte';
import * as reviewStore from './review.svelte';

let store: Store;

beforeEach(() => {
  store = makeStore(makeFakeDb());
  _setStoreForTests(store);
  sectionsStore._resetSectionsForTests();
  cardsStore._resetCardsCache();
  settingsStore._resetSettingsForTests();
  reviewStore._resetReviewForTests();
});

// ── sections ─────────────────────────────────────────────────────────────────
describe('sections store', () => {
  it('loads + adds sections into the reactive cache (ordered)', async () => {
    await sectionsStore.addSection('Alpha');
    await sectionsStore.addSection('Beta');
    await sectionsStore.loadSections();
    expect(sectionsStore.sections.value.map((s) => s.name)).toEqual(['Alpha', 'Beta']);
  });

  it('renames in place', async () => {
    const a = await sectionsStore.addSection('Alpha');
    await sectionsStore.renameSection(a.id, 'Renamed');
    expect(sectionsStore.sections.value.find((s) => s.id === a.id)?.name).toBe('Renamed');
  });

  it('removeSection returns undo payload (section + cards); reviewLog retained', async () => {
    const sec = await sectionsStore.addSection('S');
    const c1 = await store.createCard({ sectionId: sec.id, front: '1', back: '1', tags: [] });
    await store.appendReview({ cardId: c1.id, ts: 1, grade: 'good', mode: 'leitner', elapsedMs: 1 });

    const payload = await sectionsStore.removeSection(sec.id);
    expect(payload.section.id).toBe(sec.id);
    expect(payload.cards.map((c) => c.id)).toEqual([c1.id]);
    expect(sectionsStore.sections.value).toEqual([]);
    expect((await store.listSections()).length).toBe(0);
    // reviewLog retained
    expect((await store.allReviews()).length).toBe(1);
  });

  it('restoreSection re-creates by ORIGINAL id and re-inserts ordered', async () => {
    const a = await sectionsStore.addSection('A');
    const b = await sectionsStore.addSection('B');
    const payload = await sectionsStore.removeSection(a.id);
    await sectionsStore.restoreSection(payload);
    // a (order 0) should sort before b (order 1)
    expect(sectionsStore.sections.value.map((s) => s.id)).toEqual([a.id, b.id]);
    expect((await store.listSections()).map((s) => s.id)).toContain(a.id);
  });
});

// ── cards ────────────────────────────────────────────────────────────────────
describe('cards store', () => {
  it('addCard + cardsOf reflects the cache', async () => {
    const sec = await sectionsStore.addSection('S');
    const card = await cardsStore.addCard({ sectionId: sec.id, front: 'q', back: 'a', tags: ['#SQL'] });
    expect(card.tags).toEqual(['sql']); // normalized by Store
    expect(cardsStore.cardsOf(sec.id).map((c) => c.id)).toEqual([card.id]);
  });

  it('loadCards(sectionId) fills just that bucket', async () => {
    const s1 = await sectionsStore.addSection('S1');
    const s2 = await sectionsStore.addSection('S2');
    await store.createCard({ sectionId: s1.id, front: 'a', back: 'a', tags: [] });
    await store.createCard({ sectionId: s2.id, front: 'b', back: 'b', tags: [] });
    await cardsStore.loadCards(s1.id);
    expect(cardsStore.cardsOf(s1.id).length).toBe(1);
    expect(cardsStore.cardsOf(s2.id).length).toBe(0); // not loaded
  });

  it('editCard bumps modifiedAt and updates cache', async () => {
    const sec = await sectionsStore.addSection('S');
    const card = await cardsStore.addCard({ sectionId: sec.id, front: 'q', back: 'a', tags: [] });
    await new Promise((r) => setTimeout(r, 2));
    const updated = await cardsStore.editCard(card.id, { front: 'q2' });
    expect(updated.front).toBe('q2');
    expect(updated.modifiedAt).toBeGreaterThanOrEqual(card.modifiedAt);
    expect(cardsStore.cardsOf(sec.id)[0]?.front).toBe('q2');
  });

  it('moveCard reassigns section in cache + persists', async () => {
    const s1 = await sectionsStore.addSection('S1');
    const s2 = await sectionsStore.addSection('S2');
    const card = await cardsStore.addCard({ sectionId: s1.id, front: 'q', back: 'a', tags: [] });
    const moved = await cardsStore.moveCard(card.id, s2.id);
    expect(moved.sectionId).toBe(s2.id);
    expect(cardsStore.cardsOf(s1.id).length).toBe(0);
    expect(cardsStore.cardsOf(s2.id).map((c) => c.id)).toEqual([card.id]);
    expect((await store.getCard(card.id))?.sectionId).toBe(s2.id);
  });

  it('removeCard returns the card; restoreCard re-puts by original id', async () => {
    const sec = await sectionsStore.addSection('S');
    const card = await cardsStore.addCard({ sectionId: sec.id, front: 'q', back: 'a', tags: [] });
    const removed = await cardsStore.removeCard(card.id);
    expect(removed.id).toBe(card.id);
    expect(cardsStore.cardsOf(sec.id).length).toBe(0);
    expect(await store.getCard(card.id)).toBeUndefined();

    await cardsStore.restoreCard(removed);
    expect(cardsStore.cardsOf(sec.id).map((c) => c.id)).toEqual([card.id]);
    expect((await store.getCard(card.id))?.id).toBe(card.id);
  });
});

// ── settings ─────────────────────────────────────────────────────────────────
describe('settings store', () => {
  it('loads settings + applies [data-theme]', async () => {
    await settingsStore.loadSettings();
    expect(settingsStore.settings.value.theme).toBe('system');
    // system → light (no real prefers-color-scheme in jsdom/happy-dom → defaults light)
    expect(['light', 'dark']).toContain(settingsStore.effectiveTheme.value);
    expect(document.documentElement.getAttribute('data-theme')).toBe(
      settingsStore.effectiveTheme.value
    );
  });

  it('setTheme persists, resolves, and applies [data-theme]', async () => {
    await settingsStore.setTheme('dark');
    expect(settingsStore.settings.value.theme).toBe('dark');
    expect(settingsStore.effectiveTheme.value).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect((await store.getSettings()).theme).toBe('dark');
  });

  it('system theme tracks the OS preference seam', async () => {
    await settingsStore.setTheme('system');
    settingsStore._setSystemDarkForTests(true);
    expect(settingsStore.effectiveTheme.value).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    settingsStore._setSystemDarkForTests(false);
    expect(settingsStore.effectiveTheme.value).toBe('light');
  });

  it('setReviewMode + markBackup + markOnboarded persist', async () => {
    await settingsStore.setReviewMode('leitner');
    expect(settingsStore.settings.value.reviewMode).toBe('leitner');
    await settingsStore.markBackup(1000);
    expect(settingsStore.settings.value.lastBackupAt).toBe(1000);
    await settingsStore.markOnboarded(2000);
    expect(settingsStore.settings.value.onboardedAt).toBe(2000);
    expect((await store.getSettings()).reviewMode).toBe('leitner');
  });

  it('backupIsStale: true when never backed up or older than window', async () => {
    expect(settingsStore.backupIsStale(Date.now())).toBe(true); // never
    await settingsStore.markBackup(1_000_000);
    expect(settingsStore.backupIsStale(1_000_000 + DAY_MS)).toBe(false); // 1 day < 14
    expect(settingsStore.backupIsStale(1_000_000 + 15 * DAY_MS)).toBe(true); // > 14 days
    expect(settingsStore.backupIsStale(1_000_000 + 2 * DAY_MS, 1)).toBe(true); // custom window
  });
});

// ── review session ──────────────────────────────────────────────────────────

/** A deterministic fake leitner-ish scheduler so we can test before T1.3 lands. */
function fakeScheduler(mode: ReviewMode): Scheduler {
  return {
    mode,
    buildQueue(cards: Card[]): Card[] {
      // Preserve the Store's insertion order (deterministic for assertions);
      // the real shuffle/leitner ordering is T1.3's contract, not under test here.
      return [...cards];
    },
    next(card: Card, grade: Grade, now: number) {
      const newBox = grade === 'good' ? Math.min(card.box + 1, LEITNER_BOXES) : 1;
      return {
        box: newBox,
        lastReviewed: now,
        dueDate: now + (CADENCE_DAYS[newBox - 1] ?? 1) * DAY_MS
      };
    }
  };
}

describe('review session store', () => {
  beforeEach(() => {
    reviewStore._setSchedulerProviderForTests(fakeScheduler);
  });

  async function seedTwoCards(sectionId?: string) {
    const sec = sectionId ? { id: sectionId } : await sectionsStore.addSection('S');
    const c1 = await store.createCard({ sectionId: sec.id, front: 'q1', back: 'a1', tags: [] });
    const c2 = await store.createCard({ sectionId: sec.id, front: 'q2', back: 'a2', tags: [] });
    return { sec, c1, c2 };
  }

  it('startSession builds the queue and shows the first card', async () => {
    const { sec } = await seedTwoCards();
    await reviewStore.startSession({ kind: 'section', id: sec.id }, 'leitner');
    expect(reviewStore.position.value).toEqual({ index: 0, total: 2 });
    expect(reviewStore.current.value?.front).toBe('q1');
    expect(reviewStore.revealed.value).toBe(false);
    expect(reviewStore.summary.value).toBeNull();
  });

  it('flip reveals + does not reset the elapsed clock', async () => {
    let t = 1000;
    reviewStore._setClockForTests(() => t);
    const { sec } = await seedTwoCards();
    await reviewStore.startSession({ kind: 'section', id: sec.id }, 'leitner'); // shownAt = 1000
    t = 1300;
    reviewStore.flip();
    expect(reviewStore.revealed.value).toBe(true);
    t = 1500;
    await reviewStore.grade('good');
    const reviews = await store.allReviews();
    // elapsed measured shown(1000)→grade(1500) = 500, NOT reset by flip at 1300.
    expect(reviews[0]?.elapsedMs).toBe(500);
  });

  it('grade drives scheduler.next → recordReview → appendReview with real elapsedMs', async () => {
    let t = 0;
    reviewStore._setClockForTests(() => t);
    const { sec, c1 } = await seedTwoCards();
    await reviewStore.startSession({ kind: 'section', id: sec.id }, 'leitner');

    t = 250;
    await reviewStore.grade('good');

    // recordReview persisted the leitner-good schedule (box 1 → 2).
    const updated = await store.getCard(c1.id);
    expect(updated?.box).toBe(2);
    expect(updated?.lastReviewed).toBe(250);
    expect(updated?.dueDate).toBe(250 + CADENCE_DAYS[1]! * DAY_MS);
    // recordReview must NOT bump modifiedAt.
    expect(updated?.modifiedAt).toBe(updated?.createdAt);

    // appendReview wrote a log entry with the real fields.
    const reviews = await store.allReviews();
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({
      cardId: c1.id,
      grade: 'good',
      mode: 'leitner',
      elapsedMs: 250
    });

    // advanced to the second card, clock restarted.
    expect(reviewStore.position.value).toEqual({ index: 1, total: 2 });
    expect(reviewStore.current.value?.front).toBe('q2');
  });

  it('completing all cards yields a summary tally', async () => {
    reviewStore._setClockForTests(() => 0);
    const { sec } = await seedTwoCards();
    await reviewStore.startSession({ kind: 'section', id: sec.id }, 'shuffle');
    await reviewStore.grade('good');
    await reviewStore.grade('again');
    expect(reviewStore.current.value).toBeNull();
    expect(reviewStore.summary.value).toEqual({ reviewed: 2, again: 1, good: 1 });
  });

  it('scope=all studies every card; scope=tag filters by normalized tag', async () => {
    const sec = await sectionsStore.addSection('S');
    await store.createCard({ sectionId: sec.id, front: 'q1', back: 'a', tags: ['sql'] });
    await store.createCard({ sectionId: sec.id, front: 'q2', back: 'a', tags: ['web'] });

    await reviewStore.startSession({ kind: 'all' }, 'shuffle');
    expect(reviewStore.position.value.total).toBe(2);

    await reviewStore.startSession({ kind: 'tag', tag: '#SQL' }, 'shuffle');
    expect(reviewStore.position.value.total).toBe(1);
    expect(reviewStore.current.value?.front).toBe('q1');
  });
});
