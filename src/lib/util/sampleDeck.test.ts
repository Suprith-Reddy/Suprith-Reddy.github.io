/**
 * sampleDeck.test.ts — coverage for first-run seeding (T1.10, F-18).
 *
 * Uses the same in-memory `makeStore(makeFakeDb())` wiring as the store tests,
 * injected via `_setStoreForTests`, so seeding goes through the real reactive
 * stores + Store (defaults + tag normalization applied by the Store).
 *
 * Asserts:
 *   - the deck is seeded once and `onboardedAt` stamped (idempotency flag),
 *   - a second `maybeSeedSampleDeck()` is a no-op (no duplicate cards),
 *   - seeded cards land in the reactive caches with Store defaults
 *     (box=1, dueDate=createdAt, normalized tags) so they're immediately due.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { Store } from '../db/index';
import { makeStore } from '../db/store';
import { makeFakeDb } from '../stores/_fakeDb';
import { _setStoreForTests } from '../stores/_store.svelte';

import * as sectionsStore from '../stores/sections.svelte';
import * as cardsStore from '../stores/cards.svelte';
import * as settingsStore from '../stores/settings.svelte';

import { SAMPLE_DECK, maybeSeedSampleDeck, seedSampleDeck } from './sampleDeck';

let store: Store;

beforeEach(() => {
  store = makeStore(makeFakeDb());
  _setStoreForTests(store);
  sectionsStore._resetSectionsForTests();
  cardsStore._resetCardsCache();
  settingsStore._resetSettingsForTests();
});

const sampleCardCount = SAMPLE_DECK.reduce((n, s) => n + s.cards.length, 0);

describe('seedSampleDeck', () => {
  it('creates every authored section + card via the Store', async () => {
    const created = await seedSampleDeck();
    expect(created.length).toBe(sampleCardCount);

    const sections = await store.listSections();
    expect(sections.map((s) => s.name)).toEqual(SAMPLE_DECK.map((s) => s.name));

    const cards = await store.listCards();
    expect(cards.length).toBe(sampleCardCount);
  });

  it('applies Store defaults so seeded cards are immediately due', async () => {
    await seedSampleDeck();
    const cards = await store.listCards();
    const due = await store.dueCards(Date.now());
    expect(due.length).toBe(cards.length);
    for (const c of cards) {
      expect(c.box).toBe(1);
      expect(c.dueDate).toBe(c.createdAt);
      expect(c.lastReviewed).toBeNull();
    }
  });

  it('normalizes tags through the Store chokepoint', async () => {
    await seedSampleDeck();
    const cards = await store.listCards();
    for (const c of cards) {
      for (const t of c.tags) {
        expect(t).toBe(t.toLowerCase());
        expect(t.startsWith('#')).toBe(false);
        expect(t.trim()).toBe(t);
      }
    }
  });
});

describe('maybeSeedSampleDeck (idempotency)', () => {
  it('seeds + stamps onboardedAt on first run, returning true', async () => {
    expect(settingsStore.settings.value.onboardedAt).toBeNull();
    const did = await maybeSeedSampleDeck();
    expect(did).toBe(true);
    expect(settingsStore.settings.value.onboardedAt).not.toBeNull();
    expect((await store.listCards()).length).toBe(sampleCardCount);
  });

  it('is a no-op on a second call (no duplicate cards), returning false', async () => {
    await maybeSeedSampleDeck();
    const before = (await store.listCards()).length;
    const did = await maybeSeedSampleDeck();
    expect(did).toBe(false);
    expect((await store.listCards()).length).toBe(before);
  });

  it('does not seed when already onboarded (flag pre-set)', async () => {
    await settingsStore.loadSettings();
    await store.updateSettings({ onboardedAt: 123 });
    await settingsStore.loadSettings();
    const did = await maybeSeedSampleDeck();
    expect(did).toBe(false);
    expect((await store.listCards()).length).toBe(0);
  });
});
