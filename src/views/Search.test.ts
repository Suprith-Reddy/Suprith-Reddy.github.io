/**
 * Search.test.ts — unit coverage for the T1.5 search/filter view's pure logic.
 *
 * Component mounting libs (@testing-library/svelte) are not in the frozen dep set
 * (T0.1), so we test the pure helpers exported from Search.svelte's `<script
 * module>` block (`combineResults`, `previewOf`) plus an integration check of the
 * store query path the view relies on, using the in-memory fake DB (same pattern
 * as stores.test.ts / store.test.ts).
 */
import { describe, expect, it } from 'vitest';
import type { Card } from '../lib/types';
import { combineResults, previewOf } from './Search.svelte';
import { makeStore } from '../lib/db/store';
import { makeFakeDb } from '../lib/stores/_fakeDb';

function card(partial: Partial<Card> & Pick<Card, 'id' | 'front' | 'tags'>): Card {
  return {
    sectionId: 's1',
    back: '',
    box: 1,
    lastReviewed: null,
    dueDate: 0,
    createdAt: 0,
    modifiedAt: 0,
    ...partial
  };
}

describe('combineResults', () => {
  const sql = card({ id: 'a', front: 'SELECT *', tags: ['sql', 'db'] });
  const js = card({ id: 'b', front: 'closures', tags: ['js'] });
  const both = card({ id: 'c', front: 'ORM', tags: ['sql', 'js'] });

  it('passes search results through unchanged when no tags selected', () => {
    expect(combineResults([sql, js, both], [])).toEqual([sql, js, both]);
  });

  it('keeps only cards carrying ALL selected tags (AND filter)', () => {
    expect(combineResults([sql, js, both], ['sql'])).toEqual([sql, both]);
    expect(combineResults([sql, js, both], ['sql', 'js'])).toEqual([both]);
    expect(combineResults([sql, js, both], ['js'])).toEqual([js, both]);
  });

  it('returns empty when no card has all selected tags', () => {
    expect(combineResults([sql, js, both], ['sql', 'missing'])).toEqual([]);
  });

  it('preserves search-result order and de-dupes by id', () => {
    const dup = card({ id: 'a', front: 'dup', tags: ['sql', 'db'] });
    expect(combineResults([sql, dup, js], [])).toEqual([sql, js]);
  });
});

describe('previewOf', () => {
  it('collapses whitespace and trims', () => {
    expect(previewOf(card({ id: 'x', front: '  a\n\n  b  ', tags: [] }))).toBe('a b');
  });

  it('falls back to a placeholder for an empty front', () => {
    expect(previewOf(card({ id: 'x', front: '   ', tags: [] }))).toBe('(empty card)');
  });

  it('truncates long fronts with an ellipsis', () => {
    const long = 'x'.repeat(200);
    const out = previewOf(card({ id: 'x', front: long, tags: [] }), 80);
    expect(out.length).toBeLessThanOrEqual(80);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('store query path (what the view calls)', () => {
  it('searchCards substring + cardsByTag exact match feed combineResults', async () => {
    const store = makeStore(makeFakeDb());
    const sec = await store.createSection('S');
    await store.createCard({ sectionId: sec.id, front: 'SQL joins', back: 'inner/outer', tags: ['SQL', 'DB'] });
    await store.createCard({ sectionId: sec.id, front: 'JS closures', back: 'scope', tags: ['#JS'] });

    // Substring search is case-insensitive over front+back+tags.
    const found = await store.searchCards('JOIN');
    expect(found.map((c) => c.front)).toEqual(['SQL joins']);

    // Tags are normalized by the store; the view's AND filter uses the same form.
    const all = await store.searchCards('');
    const sqlOnly = combineResults(all, ['sql']);
    expect(sqlOnly.map((c) => c.front)).toEqual(['SQL joins']);

    const tags = await store.allTags();
    expect(tags).toEqual(['db', 'js', 'sql']);
  });
});
