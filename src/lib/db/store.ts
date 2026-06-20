/**
 * db/store.ts — concrete `Store` (§3.2) implementation over `idb` (T0.4).
 *
 * The reactive `lib/stores/*` layer (T0.5) never touches IndexedDB directly;
 * it goes through this `Store`. The interface + error type live in `index.ts`
 * (frozen, §3.2); this file is the implementation behind `openStore()`.
 *
 * Design note (testability): the storage logic is written against an
 * `IDBPDatabase<FlashDB>` and built by `makeStore(db)`. `openStore()` simply
 * opens the real DB and wraps it. Unit tests inject a minimal in-memory
 * idb-compatible db so the pure storage semantics (CRUD, cascade, search,
 * export/import round-trip) are testable without a browser IndexedDB. No new
 * runtime dependency is required.
 *
 * Transaction guarantees (§3.2):
 *   - deleteSection: section row + all its cards in ONE readwrite tx; reviewLog
 *     is RETAINED (append-only is sacrosanct; orphan cardIds acceptable).
 *   - restoreSection / restoreCard: re-put by ORIGINAL id in ONE tx.
 *   - importAll: validate schemaVersion, wipe ALL stores, then load atomically
 *     in ONE tx — ids AND reviewLog seq are preserved (seq written explicitly
 *     even though the store is autoIncrement).
 */
import { openDB, type IDBPDatabase } from 'idb';
import type {
  BackupFile,
  Card,
  ID,
  ImportSummary,
  ReviewLogEntry,
  Section,
  Settings
} from '../types';
import { SCHEMA_VERSION } from '../types';
import { newId } from '../util/id';
import { normalizeTags } from '../util/tags';
import { StoreUnavailableError, type Store } from './index';
import {
  DB_NAME,
  DB_VERSION,
  IDX_CARDS_BY_DUE,
  IDX_CARDS_BY_SECTION,
  STORE_CARDS,
  STORE_META,
  STORE_REVIEW_LOG,
  STORE_SECTIONS,
  SETTINGS_KEY,
  defaultSettings,
  runMigrations,
  type FlashDB
} from './migrations';

/** Build a `Store` backed by an (already-open) idb database. Exported for tests. */
export function makeStore(db: IDBPDatabase<FlashDB>): Store {
  /** Load + normalize the settings singleton (defaults on first run). */
  async function readSettings(): Promise<Settings> {
    const row = await db.get(STORE_META, SETTINGS_KEY);
    return row ?? defaultSettings();
  }

  return {
    // ── sections ──────────────────────────────────────────────────────────
    async listSections(): Promise<Section[]> {
      const all = await db.getAll(STORE_SECTIONS);
      return all.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
    },

    async createSection(name: string): Promise<Section> {
      const existing = await db.getAll(STORE_SECTIONS);
      const maxOrder = existing.reduce((m, s) => Math.max(m, s.order), -1);
      const section: Section = {
        id: newId(),
        name,
        order: maxOrder + 1,
        createdAt: Date.now()
      };
      await db.put(STORE_SECTIONS, section);
      return section;
    },

    async renameSection(id: ID, name: string): Promise<void> {
      const section = await db.get(STORE_SECTIONS, id);
      if (!section) throw new Error(`Section not found: ${id}`);
      await db.put(STORE_SECTIONS, { ...section, name });
    },

    async deleteSection(id: ID): Promise<void> {
      // Cascade: section + its cards in ONE transaction. reviewLog RETAINED.
      const tx = db.transaction([STORE_SECTIONS, STORE_CARDS], 'readwrite');
      const cardsStore = tx.objectStore(STORE_CARDS);
      const cardIds = await cardsStore.index(IDX_CARDS_BY_SECTION).getAllKeys(id);
      await Promise.all([
        tx.objectStore(STORE_SECTIONS).delete(id),
        ...cardIds.map((cid) => cardsStore.delete(cid))
      ]);
      await tx.done;
    },

    async restoreSection(section: Section, cards: Card[]): Promise<void> {
      // Undo of deleteSection — re-put by ORIGINAL ids in ONE transaction.
      const tx = db.transaction([STORE_SECTIONS, STORE_CARDS], 'readwrite');
      const cardsStore = tx.objectStore(STORE_CARDS);
      await Promise.all([
        tx.objectStore(STORE_SECTIONS).put(section),
        ...cards.map((c) => cardsStore.put(c))
      ]);
      await tx.done;
    },

    // ── cards ─────────────────────────────────────────────────────────────
    async listCards(sectionId?: ID): Promise<Card[]> {
      if (sectionId === undefined) return db.getAll(STORE_CARDS);
      return db.getAllFromIndex(STORE_CARDS, IDX_CARDS_BY_SECTION, sectionId);
    },

    async getCard(id: ID): Promise<Card | undefined> {
      return db.get(STORE_CARDS, id);
    },

    async createCard(
      input: Pick<Card, 'sectionId' | 'front' | 'back' | 'tags'>
    ): Promise<Card> {
      const ts = Date.now();
      const card: Card = {
        id: newId(),
        sectionId: input.sectionId,
        front: input.front,
        back: input.back,
        tags: normalizeTags(input.tags),
        box: 1,
        lastReviewed: null,
        dueDate: ts, // new card is due immediately (dueDate = createdAt)
        createdAt: ts,
        modifiedAt: ts
      };
      await db.put(STORE_CARDS, card);
      return card;
    },

    async updateCard(
      id: ID,
      patch: Partial<Omit<Card, 'id' | 'createdAt'>>
    ): Promise<Card> {
      const existing = await db.get(STORE_CARDS, id);
      if (!existing) throw new Error(`Card not found: ${id}`);
      // Cannot patch id/createdAt (compile-time via Omit; enforced at runtime too).
      const next: Card = {
        ...existing,
        ...patch,
        id: existing.id,
        createdAt: existing.createdAt,
        // CONTENT edit bumps modifiedAt; tags re-normalized through the chokepoint.
        tags: patch.tags !== undefined ? normalizeTags(patch.tags) : existing.tags,
        modifiedAt: Date.now()
      };
      await db.put(STORE_CARDS, next);
      return next;
    },

    async recordReview(
      id: ID,
      fields: Pick<Card, 'box' | 'lastReviewed' | 'dueDate'>
    ): Promise<Card> {
      const existing = await db.get(STORE_CARDS, id);
      if (!existing) throw new Error(`Card not found: ${id}`);
      // Scheduler-driven update; does NOT bump modifiedAt.
      const next: Card = {
        ...existing,
        box: fields.box,
        lastReviewed: fields.lastReviewed,
        dueDate: fields.dueDate
      };
      await db.put(STORE_CARDS, next);
      return next;
    },

    async deleteCard(id: ID): Promise<void> {
      await db.delete(STORE_CARDS, id);
    },

    async restoreCard(card: Card): Promise<void> {
      // Undo of deleteCard — re-put by ORIGINAL id.
      await db.put(STORE_CARDS, card);
    },

    async searchCards(query: string): Promise<Card[]> {
      // Normalize query (trim, lowercase, strip leading '#'); case-insensitive
      // SUBSTRING over raw front + back + tags. Unordered.
      const q = query.trim().toLowerCase().replace(/^#+/, '');
      const all = await db.getAll(STORE_CARDS);
      if (q === '') return all;
      return all.filter((c) => {
        const hay = `${c.front}\n${c.back}\n${c.tags.join(' ')}`.toLowerCase();
        return hay.includes(q);
      });
    },

    async cardsByTag(tag: string): Promise<Card[]> {
      // Exact match on normalized tag.
      const [norm] = normalizeTags([tag]);
      if (norm === undefined) return [];
      const all = await db.getAll(STORE_CARDS);
      return all.filter((c) => c.tags.includes(norm));
    },

    async dueCards(now: number, sectionId?: ID): Promise<Card[]> {
      // by-due index range scan: dueDate <= now. dueDate is never null, so new
      // cards (dueDate = createdAt) are included.
      const range = IDBKeyRange.upperBound(now);
      const due = await db.getAllFromIndex(STORE_CARDS, IDX_CARDS_BY_DUE, range);
      return sectionId === undefined ? due : due.filter((c) => c.sectionId === sectionId);
    },

    async allTags(): Promise<string[]> {
      const all = await db.getAll(STORE_CARDS);
      const set = new Set<string>();
      for (const c of all) for (const t of c.tags) set.add(t);
      return [...set].sort();
    },

    // ── review log ────────────────────────────────────────────────────────
    async appendReview(entry: Omit<ReviewLogEntry, 'seq'>): Promise<void> {
      // Store assigns seq via autoIncrement (keyPath 'seq').
      await db.add(STORE_REVIEW_LOG, entry as ReviewLogEntry);
    },

    async allReviews(): Promise<ReviewLogEntry[]> {
      // keyPath 'seq' autoIncrement ⇒ getAll returns ascending seq (chronological).
      return db.getAll(STORE_REVIEW_LOG);
    },

    // ── backup (REPLACE-only, delta-5) ──────────────────────────────────────
    async exportAll(): Promise<BackupFile> {
      const [sections, cards, reviewLog, settings] = await Promise.all([
        this.listSections(),
        db.getAll(STORE_CARDS),
        db.getAll(STORE_REVIEW_LOG),
        readSettings()
      ]);
      const { id: _id, ...settingsNoId } = settings;
      return {
        app: 'flash',
        schemaVersion: SCHEMA_VERSION,
        exportedAt: Date.now(),
        sections,
        cards,
        reviewLog: reviewLog.sort((a, b) => a.seq - b.seq),
        settings: settingsNoId
      };
    },

    async importAll(data: BackupFile): Promise<ImportSummary> {
      if (data.schemaVersion !== SCHEMA_VERSION) {
        throw new Error(
          `Unsupported schemaVersion ${data.schemaVersion} (expected ${SCHEMA_VERSION}).`
        );
      }
      // Wipe ALL stores + load atomically in ONE transaction. ids preserved
      // (keyPath 'id'); reviewLog seq preserved by writing the key explicitly.
      const tx = db.transaction(
        [STORE_SECTIONS, STORE_CARDS, STORE_REVIEW_LOG, STORE_META],
        'readwrite'
      );
      const sections = tx.objectStore(STORE_SECTIONS);
      const cards = tx.objectStore(STORE_CARDS);
      const reviewLog = tx.objectStore(STORE_REVIEW_LOG);
      const meta = tx.objectStore(STORE_META);

      // INVARIANT: do NOT `await` any non-idb promise between the clears and the
      // puts below — the single readwrite tx auto-commits when it has no pending
      // requests at the end of a microtask, so an unrelated await here could close
      // it ("transaction finished"). All work stays inside one Promise.all batch.
      await Promise.all([
        sections.clear(),
        cards.clear(),
        reviewLog.clear(),
        meta.clear()
      ]);

      await Promise.all([
        ...data.sections.map((s) => sections.put(s)),
        ...data.cards.map((c) => cards.put(c)),
        // Preserve seq exactly AND advance the autoIncrement key generator.
        // `put`/`add` with an explicit key on an autoIncrement store preserves the
        // key, but only `add` advances the internal generator to max(key)+1. Using
        // `put` would leave the generator at its reset value, so the next live
        // `appendReview` (db.add with no key) would assign seq=1 and OVERWRITE an
        // imported entry — silently corrupting the append-only log. The stores were
        // just cleared, so there are no key conflicts; `add` is safe and correct.
        ...data.reviewLog.map((r) => reviewLog.add(r)),
        meta.put({ ...data.settings, id: SETTINGS_KEY } satisfies Settings)
      ]);
      await tx.done;

      return {
        sections: data.sections.length,
        cards: data.cards.length,
        reviews: data.reviewLog.length
      };
    },

    // ── settings ────────────────────────────────────────────────────────────
    async getSettings(): Promise<Settings> {
      return readSettings();
    },

    async updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<Settings> {
      const current = await readSettings();
      const next: Settings = { ...current, ...patch, id: SETTINGS_KEY };
      await db.put(STORE_META, next);
      return next;
    }
  };
}

let singleton: Promise<Store> | null = null;

/**
 * Open (or return the cached) `Store` singleton over the real IndexedDB.
 * Rejects with `StoreUnavailableError` when IndexedDB is blocked/absent
 * (e.g. Safari private mode, or a non-browser context without a polyfill).
 */
export function openStore(): Promise<Store> {
  if (singleton) return singleton;

  const idb: IDBFactory | undefined =
    typeof indexedDB !== 'undefined' ? indexedDB : undefined;
  if (!idb) {
    return Promise.reject(new StoreUnavailableError());
  }

  singleton = openDB<FlashDB>(DB_NAME, DB_VERSION, {
    upgrade: runMigrations
  })
    .then((db) => makeStore(db))
    .catch((err) => {
      // Reset so a later retry (e.g. after the user leaves private mode) can work.
      singleton = null;
      throw new StoreUnavailableError(
        err instanceof Error ? err.message : 'Failed to open IndexedDB.'
      );
    });

  return singleton;
}

/** Test-only: clear the cached singleton so a fresh DB can be injected. */
export function __resetStoreSingletonForTests(): void {
  singleton = null;
}
