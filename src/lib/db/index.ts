/**
 * db/index.ts — the FROZEN `Store` interface + error type + `openStore` (§3.2).
 *
 * OWNERSHIP (§7): T0.4 owns this. The interface is frozen — Wave 1 (stores,
 * backup, etc.) codes against it. The concrete idb implementation lives in
 * `store.ts`; `openStore()` here returns the singleton from there.
 */
import type {
  BackupFile,
  Card,
  ID,
  ImportSummary,
  ReviewLogEntry,
  Section,
  Settings
} from '../types';

/** Thrown when IndexedDB is unavailable (e.g. Safari private mode, blocked storage). */
export class StoreUnavailableError extends Error {
  constructor(message = 'IndexedDB is unavailable on this device/context.') {
    super(message);
    this.name = 'StoreUnavailableError';
  }
}

export type ValidateResult =
  | { ok: true; data: BackupFile }
  | { ok: false; error: string };

export interface Store {
  // sections (listSections ordered by `order`)
  listSections(): Promise<Section[]>;
  createSection(name: string): Promise<Section>;
  renameSection(id: ID, name: string): Promise<void>;
  /** cascade: section + its cards in ONE transaction. reviewLog is RETAINED. */
  deleteSection(id: ID): Promise<void>;
  /** undo of deleteSection — re-puts by ORIGINAL ids in one transaction. */
  restoreSection(section: Section, cards: Card[]): Promise<void>;

  // cards
  listCards(sectionId?: ID): Promise<Card[]>;
  getCard(id: ID): Promise<Card | undefined>;
  /** box=1, dueDate=createdAt, lastReviewed=null, tags normalized. */
  createCard(input: Pick<Card, 'sectionId' | 'front' | 'back' | 'tags'>): Promise<Card>;
  /** CONTENT edit: sets modifiedAt=now; tags normalized. Cannot patch id/createdAt. */
  updateCard(id: ID, patch: Partial<Omit<Card, 'id' | 'createdAt'>>): Promise<Card>;
  /** scheduler-driven update; does NOT bump modifiedAt. */
  recordReview(id: ID, fields: Pick<Card, 'box' | 'lastReviewed' | 'dueDate'>): Promise<Card>;
  deleteCard(id: ID): Promise<void>;
  /** undo of deleteCard — re-puts by ORIGINAL id. */
  restoreCard(card: Card): Promise<void>;
  /** case-insensitive SUBSTRING over raw front+back+tags; query normalized; unordered. */
  searchCards(query: string): Promise<Card[]>;
  /** exact match on normalized tag. */
  cardsByTag(tag: string): Promise<Card[]>;
  /** cards with dueDate <= now (all cards are scheduled; never null). */
  dueCards(now: number, sectionId?: ID): Promise<Card[]>;
  /** sorted unique normalized tags. */
  allTags(): Promise<string[]>;

  // review log
  /** store assigns seq. */
  appendReview(entry: Omit<ReviewLogEntry, 'seq'>): Promise<void>;
  /** returned in seq (chronological) order. */
  allReviews(): Promise<ReviewLogEntry[]>;

  // backup — REPLACE-only (delta-5)
  exportAll(): Promise<BackupFile>;
  /** validates schemaVersion; wipes all stores; loads atomically; preserves ids + seq. */
  importAll(data: BackupFile): Promise<ImportSummary>;

  // settings
  /** returns defaults on first run. */
  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<Settings>;
}

export { openStore } from './store';
