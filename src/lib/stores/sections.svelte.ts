/**
 * sections.svelte.ts — reactive sections store (§3.6, T0.5).
 *
 * Wraps the async `Store` (§3.2) and exposes an ordered, reactive in-memory cache
 * of sections that views bind to. Mutations call the `Store` first, then update
 * the cache (so the persisted truth and the rune cache stay consistent).
 *
 * Public surface is FROZEN by §3.6 — do not change signatures.
 *   - `removeSection` returns the deleted section + its cards as an undo payload
 *     (the caller hands this back to `restoreSection`); the Store retains the
 *     reviewLog (append-only), so undo re-creates by ORIGINAL ids.
 */
import type { Card, ID, Section } from '../types';
import { getStore } from './_store.svelte';

// Reactive ordered cache. Exposed via a `{ value }` getter object so views can
// read `sections.value` reactively (Svelte 5 runes-in-module pattern).
let _sections = $state<Section[]>([]);

export const sections: { value: Section[] } = {
  get value() {
    return _sections;
  }
};

/** Load all sections (ordered by `order`) into the cache. */
export async function loadSections(): Promise<void> {
  const store = await getStore();
  _sections = await store.listSections();
}

/** Create a section, append to the cache (Store assigns order), and return it. */
export async function addSection(name: string): Promise<Section> {
  const store = await getStore();
  const section = await store.createSection(name);
  _sections = [..._sections, section];
  return section;
}

/** Rename a section in the Store and patch the cache in place. */
export async function renameSection(id: ID, name: string): Promise<void> {
  const store = await getStore();
  await store.renameSection(id, name);
  _sections = _sections.map((s) => (s.id === id ? { ...s, name } : s));
}

/**
 * Delete a section (cascade: section + its cards in one Store tx; reviewLog
 * retained). Returns the deleted section + its cards so the caller can offer an
 * undo (Toast) that calls `restoreSection`.
 */
export async function removeSection(
  id: ID
): Promise<{ section: Section; cards: Card[] }> {
  const store = await getStore();
  const cached = _sections.find((s) => s.id === id);
  // Snapshot the section out of the reactive proxy so the undo payload (and any
  // later structuredClone into IndexedDB on restore) is a plain object.
  const section = cached ? $state.snapshot(cached) : await sectionById(store, id);
  const cards = await store.listCards(id);
  await store.deleteSection(id);
  _sections = _sections.filter((s) => s.id !== id);
  return { section, cards };
}

/**
 * Undo of `removeSection`: re-create the section + its cards by ORIGINAL ids in
 * one Store tx, then re-insert into the cache keeping `order` ordering.
 */
export async function restoreSection(p: {
  section: Section;
  cards: Card[];
}): Promise<void> {
  const store = await getStore();
  await store.restoreSection(p.section, p.cards);
  const without = _sections.filter((s) => s.id !== p.section.id);
  _sections = [...without, p.section].sort(
    (a, b) => a.order - b.order || a.createdAt - b.createdAt
  );
}

/** Test-only: clear the reactive sections cache between unit tests. */
export function _resetSectionsForTests(): void {
  _sections = [];
}

/** Fallback lookup if the section isn't already in the cache (e.g. not loaded). */
async function sectionById(
  store: Awaited<ReturnType<typeof getStore>>,
  id: ID
): Promise<Section> {
  const all = await store.listSections();
  const found = all.find((s) => s.id === id);
  if (!found) throw new Error(`Section not found: ${id}`);
  return found;
}
