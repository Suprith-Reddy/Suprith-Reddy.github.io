/**
 * _fakeDb.ts — minimal in-memory idb-compatible DB for store unit tests (T0.5).
 *
 * The test env (happy-dom / Node) has no IndexedDB and `fake-indexeddb` is not
 * installed (T0.1 froze the dep set; we may not add one). This faithfully
 * implements the exact `idb` `IDBPDatabase<FlashDB>` surface that `makeStore`
 * uses (object stores by keyPath, autoIncrement reviewLog, by-section/by-due
 * indexes with key-range scans, single-transaction clear/put/delete). It mirrors
 * the helper already proven in `db/store.test.ts`, kept here so the reactive
 * store tests can build a real `Store` via `makeStore(makeFakeDb())`.
 *
 * Not shipped to production (no `.svelte.ts`/`.test.ts` suffix means it is only
 * imported by tests). It is excluded from the app bundle because nothing in
 * `src/**` imports it outside tests.
 */
import type { IDBPDatabase } from 'idb';
import {
  IDX_CARDS_BY_DUE,
  IDX_CARDS_BY_SECTION,
  STORE_CARDS,
  STORE_META,
  STORE_REVIEW_LOG,
  STORE_SECTIONS,
  type FlashDB
} from '../db/migrations';

class FakeKeyRange {
  constructor(public upper: number) {}
  static upperBound(upper: number): FakeKeyRange {
    return new FakeKeyRange(upper);
  }
  includes(v: number): boolean {
    return v <= this.upper;
  }
}

/** Install IDBKeyRange.upperBound (absent in happy-dom/Node) for `dueCards`. */
export function installFakeKeyRange(): void {
  (globalThis as unknown as { IDBKeyRange: typeof FakeKeyRange }).IDBKeyRange = FakeKeyRange;
}

interface StoreSpec {
  keyPath: string;
  autoIncrement?: boolean;
  indexes?: Record<string, string>;
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

/** Build a fresh in-memory `IDBPDatabase<FlashDB>`-shaped fake. */
export function makeFakeDb(): IDBPDatabase<FlashDB> {
  installFakeKeyRange();
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
