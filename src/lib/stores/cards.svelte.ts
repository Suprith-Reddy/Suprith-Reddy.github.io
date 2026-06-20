/**
 * cards.svelte.ts — reactive cards store (§3.6, T0.5).
 *
 * Maintains a reactive per-section cache of cards. `cardsOf(sectionId)` reads the
 * cache reactively; `loadCards(sectionId?)` fills it from the `Store` (§3.2).
 * Mutations call the Store first, then patch the cache.
 *
 * Public surface is FROZEN by §3.6.
 *   - `addCard` defaults (box=1, dueDate=createdAt, …) + tag normalization are the
 *     Store's responsibility — this layer just reflects the returned card.
 *   - `moveCard` (F-4) reassigns section via `editCard({sectionId})`, which bumps
 *     modifiedAt and moves the card between section buckets in the cache.
 *   - `removeCard` returns the deleted card for an undo Toast → `restoreCard`.
 */
import type { Card, ID } from '../types';
import { getStore } from './_store.svelte';

// Reactive cache keyed by sectionId → that section's cards. Using a Map kept in
// a $state so reassignment triggers reactivity for `cardsOf`.
let _bySection = $state<Map<ID, Card[]>>(new Map());

/** Reactive getter: the cached cards for `sectionId` (empty array if unloaded). */
export function cardsOf(sectionId: ID): Card[] {
  return _bySection.get(sectionId) ?? [];
}

/** Replace the cache bucket for `sectionId` (immutably) to trigger reactivity. */
function setBucket(sectionId: ID, cards: Card[]): void {
  const next = new Map(_bySection);
  next.set(sectionId, cards);
  _bySection = next;
}

/**
 * Load cards into the cache. With a `sectionId`, loads just that section's bucket.
 * Without one, loads ALL cards and rebuilds every bucket (used by views that need
 * the full set, e.g. search/stats priming).
 */
export async function loadCards(sectionId?: ID): Promise<void> {
  const store = await getStore();
  if (sectionId !== undefined) {
    setBucket(sectionId, await store.listCards(sectionId));
    return;
  }
  const all = await store.listCards();
  const next = new Map<ID, Card[]>();
  for (const c of all) {
    const bucket = next.get(c.sectionId);
    if (bucket) bucket.push(c);
    else next.set(c.sectionId, [c]);
  }
  _bySection = next;
}

/** Create a card (Store applies defaults + tag normalization) and cache it. */
export async function addCard(
  input: Pick<Card, 'sectionId' | 'front' | 'back' | 'tags'>
): Promise<Card> {
  const store = await getStore();
  const card = await store.createCard(input);
  setBucket(card.sectionId, [...cardsOf(card.sectionId), card]);
  return card;
}

/**
 * Edit a card's content (Store sets modifiedAt, normalizes tags). If the patch
 * changes `sectionId`, the card is moved between cache buckets.
 */
export async function editCard(
  id: ID,
  patch: Partial<Omit<Card, 'id' | 'createdAt'>>
): Promise<Card> {
  const store = await getStore();
  const updated = await store.updateCard(id, patch);
  applyToCache(id, updated);
  return updated;
}

/** F-4: reassign a card to another section (bumps modifiedAt via editCard). */
export async function moveCard(id: ID, sectionId: ID): Promise<Card> {
  return editCard(id, { sectionId });
}

/** Delete a card; return it so the caller can offer an undo → `restoreCard`. */
export async function removeCard(id: ID): Promise<Card> {
  const store = await getStore();
  const cached = findInCache(id);
  // Snapshot out of the reactive proxy so the undo payload is a plain object that
  // can be structuredClone'd back into IndexedDB by `restoreCard`.
  const card = cached ? $state.snapshot(cached) : await store.getCard(id);
  if (!card) throw new Error(`Card not found: ${id}`);
  await store.deleteCard(id);
  removeFromCache(id);
  return card;
}

/** Undo of `removeCard`: re-put by ORIGINAL id and re-insert into its bucket. */
export async function restoreCard(card: Card): Promise<void> {
  const store = await getStore();
  await store.restoreCard(card);
  // Drop any stale copy, then append to the (possibly fresh) bucket.
  removeFromCache(card.id);
  setBucket(card.sectionId, [...cardsOf(card.sectionId), card]);
}

// ── cache helpers ───────────────────────────────────────────────────────────

function findInCache(id: ID): Card | undefined {
  for (const bucket of _bySection.values()) {
    const found = bucket.find((c) => c.id === id);
    if (found) return found;
  }
  return undefined;
}

function removeFromCache(id: ID): void {
  const next = new Map<ID, Card[]>();
  for (const [sid, bucket] of _bySection) {
    next.set(
      sid,
      bucket.filter((c) => c.id !== id)
    );
  }
  _bySection = next;
}

/** Place `updated` into the correct bucket, removing any prior copy (handles moves). */
function applyToCache(id: ID, updated: Card): void {
  const next = new Map<ID, Card[]>();
  for (const [sid, bucket] of _bySection) {
    next.set(
      sid,
      bucket.filter((c) => c.id !== id)
    );
  }
  const dest = next.get(updated.sectionId) ?? [];
  next.set(updated.sectionId, [...dest, updated]);
  _bySection = next;
}

/** Test-only: clear the reactive cache between unit tests. */
export function _resetCardsCache(): void {
  _bySection = new Map();
}
