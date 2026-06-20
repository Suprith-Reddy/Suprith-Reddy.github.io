/**
 * store.test.ts — Vitest coverage for the Store (§3.2) per T0.4 acceptance:
 *   CRUD · cascade (+ reviewLog RETAINED) · tag normalization · search substring
 *   · dueCards(now) returns a freshly-created card · export/import REPLACE
 *   round-trip preserving ids + seq.
 *
 * The test env (happy-dom / Node) has no IndexedDB, and fake-indexeddb is not
 * installed (T0.1 fixed the dep set; we may not add one). So this file ships a
 * small in-memory db that faithfully implements the exact `idb`
 * `IDBPDatabase<FlashDB>` surface `makeStore` uses — object stores by keyPath,
 * an autoIncrement reviewLog (monotonic seq), a `by-section`/`by-due` index with
 * key-range scans, and single-transaction `clear`/`put`/`delete`. This validates
 * the real storage semantics (cascade, seq preservation, due-range, substring)
 * without a browser. The concrete `openStore()` path is exercised in E2E (T2.3).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { IDBPDatabase } from 'idb';
import type { Card, Section, Settings } from '../types';
import { SCHEMA_VERSION } from '../types';
import { makeStore } from './store';
import {
  IDX_CARDS_BY_DUE,
  IDX_CARDS_BY_SECTION,
  STORE_CARDS,
  STORE_META,
  STORE_REVIEW_LOG,
  STORE_SECTIONS,
  type FlashDB
} from './migrations';

// ── minimal in-memory idb-compatible fake ─────────────────────────────────

// Provide IDBKeyRange.upperBound for dueCards (absent in happy-dom/Node).
class FakeKeyRange {
  constructor(public upper: number) {}
  static upperBound(upper: number): FakeKeyRange {
    return new FakeKeyRange(upper);
  }
  includes(v: number): boolean {
    return v <= this.upper;
  }
}
(globalThis as unknown as { IDBKeyRange: typeof FakeKeyRange }).IDBKeyRange = FakeKeyRange;

interface StoreSpec {
  keyPath: string;
  autoIncrement?: boolean;
  indexes?: Record<string, string>; // indexName -> keyPath (field)
}

const SPECS: Record<string, StoreSpec> = {
  [STORE_SECTIONS]: { keyPath: 'id' },
  [STORE_CARDS]: {
    keyPath: 'id',
    indexes: { [IDX_CARDS_BY_SECTION]: 'sectionId', [IDX_CARDS_BY_DUE]: 'dueDate' }
  },
  [STORE_REVIEW_LOG]: { keyPath: 'seq', autoIncrement: true },
  [STORE_META]: { keyPath: 'id' }
};

type Row = Record<string, unknown>;

class FakeObjectStore {
  seqCounter = 0;
  constructor(public spec: StoreSpec, public data: Map<unknown, Row>) {}

  private keyOf(value: Row): unknown {
    return value[this.spec.keyPath];
  }

  async get(key: unknown): Promise<Row | undefined> {
    return structuredClone(this.data.get(key));
  }
  async getAll(): Promise<Row[]> {
    return [...this.data.values()].map((v) => structuredClone(v));
  }
  async put(value: Row): Promise<unknown> {
    const v = structuredClone(value);
    this.data.set(this.keyOf(v), v);
    return this.keyOf(v);
  }
  async add(value: Row): Promise<unknown> {
    const v = structuredClone(value);
    if (this.spec.autoIncrement && v[this.spec.keyPath] === undefined) {
      v[this.spec.keyPath] = ++this.seqCounter;
    } else if (this.spec.autoIncrement) {
      // keep counter monotonic past any explicitly-written key
      this.seqCounter = Math.max(this.seqCounter, Number(v[this.spec.keyPath]));
    }
    this.data.set(this.keyOf(v), v);
    return this.keyOf(v);
  }
  async delete(key: unknown): Promise<void> {
    this.data.delete(key);
  }
  async clear(): Promise<void> {
    this.data.clear();
  }
  index(name: string): FakeIndex {
    const field = this.spec.indexes?.[name];
    if (!field) throw new Error(`No index ${name}`);
    return new FakeIndex(this, field);
  }
}

class FakeIndex {
  constructor(public store: FakeObjectStore, public field: string) {}
  private match(rowVal: unknown, query: unknown): boolean {
    if (query instanceof FakeKeyRange) return query.includes(rowVal as number);
    return rowVal === query;
  }
  async getAll(query: unknown): Promise<Row[]> {
    return [...this.store.data.values()]
      .filter((r) => this.match(r[this.field], query))
      .map((r) => structuredClone(r));
  }
  async getAllKeys(query: unknown): Promise<unknown[]> {
    return [...this.store.data.values()]
      .filter((r) => this.match(r[this.field], query))
      .map((r) => r[this.store.spec.keyPath]);
  }
}

class FakeTx {
  done = Promise.resolve();
  constructor(private stores: Map<string, FakeObjectStore>) {}
  objectStore(name: string): FakeObjectStore {
    const s = this.stores.get(name);
    if (!s) throw new Error(`Store ${name} not in transaction`);
    return s;
  }
}

function makeFakeDb(): IDBPDatabase<FlashDB> {
  const stores = new Map<string, FakeObjectStore>();
  for (const [name, spec] of Object.entries(SPECS)) {
    stores.set(name, new FakeObjectStore(spec, new Map()));
  }
  const db = {
    get: (name: string, key: unknown) => stores.get(name)!.get(key),
    getAll: (name: string) => stores.get(name)!.getAll(),
    getAllFromIndex: (name: string, idx: string, query: unknown) =>
      stores.get(name)!.index(idx).getAll(query),
    put: (name: string, value: Row) => stores.get(name)!.put(value),
    add: (name: string, value: Row) => stores.get(name)!.add(value),
    delete: (name: string, key: unknown) => stores.get(name)!.delete(key),
    transaction: (names: string[] | string) => {
      const list = Array.isArray(names) ? names : [names];
      const sub = new Map<string, FakeObjectStore>();
      for (const n of list) sub.set(n, stores.get(n)!);
      return new FakeTx(sub);
    }
  };
  return db as unknown as IDBPDatabase<FlashDB>;
}

// ── tests ──────────────────────────────────────────────────────────────────

function freshStore() {
  return makeStore(makeFakeDb());
}

describe('Store — sections + cards CRUD', () => {
  it('creates, lists (ordered), renames sections', async () => {
    const store = freshStore();
    const a = await store.createSection('Alpha');
    const b = await store.createSection('Beta');
    expect(a.order).toBe(0);
    expect(b.order).toBe(1);

    await store.renameSection(a.id, 'Alpha-renamed');
    const list = await store.listSections();
    expect(list.map((s) => s.name)).toEqual(['Alpha-renamed', 'Beta']);
  });

  it('creates a card with defaults (box=1, dueDate=createdAt, lastReviewed=null)', async () => {
    const store = freshStore();
    const sec = await store.createSection('S');
    const card = await store.createCard({
      sectionId: sec.id,
      front: 'Q',
      back: 'A',
      tags: []
    });
    expect(card.box).toBe(1);
    expect(card.lastReviewed).toBeNull();
    expect(card.dueDate).toBe(card.createdAt);
    expect(card.modifiedAt).toBe(card.createdAt);

    const got = await store.getCard(card.id);
    expect(got).toEqual(card);
  });

  it('updateCard bumps modifiedAt and cannot change id/createdAt', async () => {
    const store = freshStore();
    const sec = await store.createSection('S');
    const card = await store.createCard({ sectionId: sec.id, front: 'Q', back: 'A', tags: [] });
    await new Promise((r) => setTimeout(r, 2));
    const updated = await store.updateCard(card.id, {
      front: 'Q2',
      // attempt to sneak id/createdAt (typed away, but prove runtime guard):
      ...({ id: 'HACK', createdAt: 0 } as object)
    });
    expect(updated.id).toBe(card.id);
    expect(updated.createdAt).toBe(card.createdAt);
    expect(updated.front).toBe('Q2');
    expect(updated.modifiedAt).toBeGreaterThanOrEqual(card.modifiedAt);
  });

  it('recordReview updates schedule fields but does NOT bump modifiedAt', async () => {
    const store = freshStore();
    const sec = await store.createSection('S');
    const card = await store.createCard({ sectionId: sec.id, front: 'Q', back: 'A', tags: [] });
    const reviewed = await store.recordReview(card.id, {
      box: 2,
      lastReviewed: 123,
      dueDate: 999
    });
    expect(reviewed.box).toBe(2);
    expect(reviewed.lastReviewed).toBe(123);
    expect(reviewed.dueDate).toBe(999);
    expect(reviewed.modifiedAt).toBe(card.modifiedAt); // unchanged
  });

  it('deleteCard + restoreCard round-trips by original id', async () => {
    const store = freshStore();
    const sec = await store.createSection('S');
    const card = await store.createCard({ sectionId: sec.id, front: 'Q', back: 'A', tags: [] });
    await store.deleteCard(card.id);
    expect(await store.getCard(card.id)).toBeUndefined();
    await store.restoreCard(card);
    expect(await store.getCard(card.id)).toEqual(card);
  });

  it('listCards filters by section', async () => {
    const store = freshStore();
    const s1 = await store.createSection('S1');
    const s2 = await store.createSection('S2');
    await store.createCard({ sectionId: s1.id, front: 'a', back: 'a', tags: [] });
    await store.createCard({ sectionId: s1.id, front: 'b', back: 'b', tags: [] });
    await store.createCard({ sectionId: s2.id, front: 'c', back: 'c', tags: [] });
    expect((await store.listCards(s1.id)).length).toBe(2);
    expect((await store.listCards(s2.id)).length).toBe(1);
    expect((await store.listCards()).length).toBe(3);
  });
});

describe('Store — cascade delete retains reviewLog', () => {
  it('deleteSection removes section + its cards in one tx; reviewLog RETAINED', async () => {
    const store = freshStore();
    const sec = await store.createSection('S');
    const c1 = await store.createCard({ sectionId: sec.id, front: '1', back: '1', tags: [] });
    const c2 = await store.createCard({ sectionId: sec.id, front: '2', back: '2', tags: [] });
    await store.appendReview({ cardId: c1.id, ts: 1, grade: 'good', mode: 'leitner', elapsedMs: 10 });
    await store.appendReview({ cardId: c2.id, ts: 2, grade: 'again', mode: 'leitner', elapsedMs: 20 });

    await store.deleteSection(sec.id);

    expect(await store.listSections()).toEqual([]);
    expect((await store.listCards()).length).toBe(0);
    // reviewLog retained (orphan cardIds acceptable for analytics).
    const reviews = await store.allReviews();
    expect(reviews.length).toBe(2);
    expect(reviews.map((r) => r.cardId).sort()).toEqual([c1.id, c2.id].sort());
  });

  it('restoreSection re-creates section + cards by original ids in one tx', async () => {
    const store = freshStore();
    const sec = await store.createSection('S');
    const c1 = await store.createCard({ sectionId: sec.id, front: '1', back: '1', tags: [] });
    const c2 = await store.createCard({ sectionId: sec.id, front: '2', back: '2', tags: [] });
    await store.deleteSection(sec.id);

    await store.restoreSection(sec, [c1, c2]);
    const list = await store.listSections();
    expect(list).toEqual([sec]);
    const cards = await store.listCards(sec.id);
    expect(cards.map((c) => c.id).sort()).toEqual([c1.id, c2.id].sort());
  });
});

describe('Store — tag normalization chokepoint', () => {
  it('normalizes tags on createCard (lowercase, strip #, trim, de-dupe)', async () => {
    const store = freshStore();
    const sec = await store.createSection('S');
    const card = await store.createCard({
      sectionId: sec.id,
      front: 'q',
      back: 'a',
      tags: ['#SQL', '  sql  ', 'Joins', '', '#joins']
    });
    expect(card.tags).toEqual(['sql', 'joins']);
  });

  it('normalizes tags on updateCard', async () => {
    const store = freshStore();
    const sec = await store.createSection('S');
    const card = await store.createCard({ sectionId: sec.id, front: 'q', back: 'a', tags: [] });
    const updated = await store.updateCard(card.id, { tags: ['##Index', 'INDEX'] });
    expect(updated.tags).toEqual(['index']);
  });

  it('cardsByTag matches normalized tag exactly; allTags is sorted unique', async () => {
    const store = freshStore();
    const sec = await store.createSection('S');
    await store.createCard({ sectionId: sec.id, front: 'q1', back: 'a', tags: ['#SQL'] });
    await store.createCard({ sectionId: sec.id, front: 'q2', back: 'a', tags: ['joins', 'sql'] });
    expect((await store.cardsByTag('#sql')).length).toBe(2);
    expect((await store.cardsByTag('joins')).length).toBe(1);
    expect(await store.allTags()).toEqual(['joins', 'sql']);
  });
});

describe('Store — search substring', () => {
  it('searchCards is a case-insensitive substring over front+back+tags', async () => {
    const store = freshStore();
    const sec = await store.createSection('S');
    await store.createCard({ sectionId: sec.id, front: 'What is a B-Tree?', back: 'index', tags: ['db'] });
    await store.createCard({ sectionId: sec.id, front: 'HTTP status', back: '200 OK', tags: ['web'] });

    expect((await store.searchCards('b-tree')).length).toBe(1);
    expect((await store.searchCards('INDEX')).length).toBe(1); // back match
    expect((await store.searchCards('web')).length).toBe(1); // tag match
    expect((await store.searchCards('#web')).length).toBe(1); // strips leading #
    expect((await store.searchCards('')).length).toBe(2); // empty → all
    expect((await store.searchCards('nope')).length).toBe(0);
  });
});

describe('Store — dueCards returns a freshly-created card', () => {
  it('a new card (dueDate=createdAt) is due now', async () => {
    const store = freshStore();
    const sec = await store.createSection('S');
    const card = await store.createCard({ sectionId: sec.id, front: 'q', back: 'a', tags: [] });
    const now = Date.now();
    const due = await store.dueCards(now);
    expect(due.map((c) => c.id)).toContain(card.id);
  });

  it('excludes future-due cards and filters by section', async () => {
    const store = freshStore();
    const s1 = await store.createSection('S1');
    const s2 = await store.createSection('S2');
    const cNow = await store.createCard({ sectionId: s1.id, front: 'q', back: 'a', tags: [] });
    const cFuture = await store.createCard({ sectionId: s1.id, front: 'q2', back: 'a', tags: [] });
    await store.recordReview(cFuture.id, { box: 2, lastReviewed: Date.now(), dueDate: Date.now() + 1_000_000 });
    await store.createCard({ sectionId: s2.id, front: 'q3', back: 'a', tags: [] });

    const now = Date.now();
    const dueAll = await store.dueCards(now);
    expect(dueAll.map((c) => c.id)).toContain(cNow.id);
    expect(dueAll.map((c) => c.id)).not.toContain(cFuture.id);

    const dueS1 = await store.dueCards(now, s1.id);
    expect(dueS1.every((c) => c.sectionId === s1.id)).toBe(true);
    expect(dueS1.map((c) => c.id)).toContain(cNow.id);
  });
});

describe('Store — review log + settings', () => {
  it('appendReview assigns monotonic seq; allReviews chronological', async () => {
    const store = freshStore();
    const sec = await store.createSection('S');
    const c = await store.createCard({ sectionId: sec.id, front: 'q', back: 'a', tags: [] });
    await store.appendReview({ cardId: c.id, ts: 1, grade: 'good', mode: 'shuffle', elapsedMs: 5 });
    await store.appendReview({ cardId: c.id, ts: 2, grade: 'again', mode: 'leitner', elapsedMs: 6 });
    const reviews = await store.allReviews();
    expect(reviews.map((r) => r.seq)).toEqual([1, 2]);
  });

  it('getSettings returns defaults on first run; updateSettings persists', async () => {
    const store = freshStore();
    const s = await store.getSettings();
    expect(s).toMatchObject({ id: 'singleton', theme: 'system', reviewMode: 'shuffle', schemaVersion: SCHEMA_VERSION });
    const updated = await store.updateSettings({ theme: 'dark', lastBackupAt: 42 });
    expect(updated.theme).toBe('dark');
    expect(updated.lastBackupAt).toBe(42);
    expect((await store.getSettings()).theme).toBe('dark');
  });
});

describe('Store — export/import REPLACE round-trip', () => {
  async function seed() {
    const store = freshStore();
    const sec = await store.createSection('S');
    const c1 = await store.createCard({ sectionId: sec.id, front: 'q1', back: 'a1', tags: ['t1'] });
    const c2 = await store.createCard({ sectionId: sec.id, front: 'q2', back: 'a2', tags: ['t2'] });
    await store.appendReview({ cardId: c1.id, ts: 1, grade: 'good', mode: 'leitner', elapsedMs: 5 });
    await store.appendReview({ cardId: c2.id, ts: 2, grade: 'again', mode: 'leitner', elapsedMs: 6 });
    await store.updateSettings({ theme: 'dark' });
    return { store, sec, c1, c2 };
  }

  it('exportAll then importAll into a fresh store preserves ids + seq', async () => {
    const { store } = await seed();
    const backup = await store.exportAll();

    const fresh = freshStore();
    const summary = await fresh.importAll(backup);
    expect(summary).toEqual({ sections: 1, cards: 2, reviews: 2 });

    const re = await fresh.exportAll();
    // ids preserved
    expect(re.sections.map((s) => s.id)).toEqual(backup.sections.map((s) => s.id));
    expect(re.cards.map((c) => c.id).sort()).toEqual(backup.cards.map((c) => c.id).sort());
    // seq preserved exactly
    expect(re.reviewLog.map((r) => r.seq)).toEqual(backup.reviewLog.map((r) => r.seq));
    expect(re.reviewLog.map((r) => r.cardId)).toEqual(backup.reviewLog.map((r) => r.cardId));
    // settings round-trip
    expect(re.settings.theme).toBe('dark');
  });

  it('appendReview after importAll does NOT collide with imported seqs', async () => {
    // Regression (adversarial review, critical): importAll must advance the
    // reviewLog autoIncrement generator past the max imported seq. If it used
    // `put` (which preserves the key but does NOT advance the generator), the
    // next live `appendReview` (add with no key) would assign seq=1 and OVERWRITE
    // an imported entry — silently corrupting the append-only log.
    const { store } = await seed();
    const backup = await store.exportAll();
    const maxImportedSeq = Math.max(...backup.reviewLog.map((r) => r.seq));
    expect(backup.reviewLog.length).toBe(2);

    const fresh = freshStore();
    await fresh.importAll(backup);

    // A new live grade after import.
    await fresh.appendReview({
      cardId: 'new-card',
      ts: 99,
      grade: 'good',
      mode: 'leitner',
      elapsedMs: 7
    });

    const all = await fresh.allReviews();
    // No imported entry was overwritten: count grew by exactly one.
    expect(all.length).toBe(backup.reviewLog.length + 1);
    // The new entry's seq is strictly greater than every imported seq.
    const newEntry = all.find((r) => r.cardId === 'new-card');
    expect(newEntry).toBeDefined();
    expect(newEntry!.seq).toBeGreaterThan(maxImportedSeq);
    // All seqs remain unique.
    const seqs = all.map((r) => r.seq);
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it('importAll REPLACES existing data (wipe + load)', async () => {
    const { store } = await seed();
    const backup = await store.exportAll();

    const other = freshStore();
    const otherSec = await other.createSection('PRE-EXISTING');
    await other.createCard({ sectionId: otherSec.id, front: 'x', back: 'y', tags: [] });

    await other.importAll(backup);
    const sections = await other.listSections();
    expect(sections.map((s) => s.name)).toEqual(['S']); // PRE-EXISTING wiped
    expect((await other.listCards()).length).toBe(2);
  });

  it('importAll rejects on schemaVersion mismatch', async () => {
    const store = freshStore();
    const bad = {
      app: 'flash',
      schemaVersion: SCHEMA_VERSION + 1,
      exportedAt: 0,
      sections: [] as Section[],
      cards: [] as Card[],
      reviewLog: [],
      settings: {} as Omit<Settings, 'id'>
    };
    await expect(store.importAll(bad as never)).rejects.toThrow(/schemaVersion/);
  });
});
