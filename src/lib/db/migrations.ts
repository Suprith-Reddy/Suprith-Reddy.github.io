/**
 * db/migrations.ts — IndexedDB schema definition + upgrade logic (T0.4).
 *
 * Object stores (§4 T0.4):
 *   - sections   keyPath 'id'
 *   - cards      keyPath 'id'   + index 'by-section' (sectionId), index 'by-due' (dueDate)
 *   - reviewLog  keyPath 'seq', autoIncrement:true   (monotonic seq ⇒ chronological)
 *   - meta       keyPath 'id'   (holds the Settings singleton, id:'singleton')
 *
 * `dueDate` is NEVER null (types.ts), so the 'by-due' index always indexes a
 * real number — new cards (dueDate = createdAt) are range-scannable + due now.
 */
import type { DBSchema, IDBPDatabase, IDBPTransaction, StoreNames } from 'idb';
import type { Card, ReviewLogEntry, Section, Settings } from '../types';
import { SCHEMA_VERSION } from '../types';

export const DB_NAME = 'flash';
/** idb's structural DB version. Bumping requires an upgrade branch below. */
export const DB_VERSION = 1;

export const STORE_SECTIONS = 'sections';
export const STORE_CARDS = 'cards';
export const STORE_REVIEW_LOG = 'reviewLog';
export const STORE_META = 'meta';

export const IDX_CARDS_BY_SECTION = 'by-section';
export const IDX_CARDS_BY_DUE = 'by-due';

export const SETTINGS_KEY = 'singleton';

/** Strongly-typed schema for the `idb` wrapper. */
export interface FlashDB extends DBSchema {
  [STORE_SECTIONS]: {
    key: string;
    value: Section;
  };
  [STORE_CARDS]: {
    key: string;
    value: Card;
    indexes: {
      [IDX_CARDS_BY_SECTION]: string;
      [IDX_CARDS_BY_DUE]: number;
    };
  };
  [STORE_REVIEW_LOG]: {
    key: number;
    value: ReviewLogEntry;
  };
  [STORE_META]: {
    key: string;
    value: Settings;
  };
}

/** Default Settings returned on first run (no row yet). */
export function defaultSettings(): Settings {
  return {
    id: SETTINGS_KEY,
    theme: 'system',
    reviewMode: 'shuffle',
    lastBackupAt: null,
    onboardedAt: null,
    schemaVersion: SCHEMA_VERSION
  };
}

/**
 * idb `upgrade` callback: create stores + indexes. Idempotent per store via
 * `objectStoreNames.contains` so re-running on an existing DB is safe.
 */
export function runMigrations(
  db: IDBPDatabase<FlashDB>,
  _oldVersion: number,
  _newVersion: number | null,
  _tx: IDBPTransaction<FlashDB, ArrayLike<StoreNames<FlashDB>>, 'versionchange'>
): void {
  if (!db.objectStoreNames.contains(STORE_SECTIONS)) {
    db.createObjectStore(STORE_SECTIONS, { keyPath: 'id' });
  }

  if (!db.objectStoreNames.contains(STORE_CARDS)) {
    const cards = db.createObjectStore(STORE_CARDS, { keyPath: 'id' });
    cards.createIndex(IDX_CARDS_BY_SECTION, 'sectionId');
    cards.createIndex(IDX_CARDS_BY_DUE, 'dueDate');
  }

  if (!db.objectStoreNames.contains(STORE_REVIEW_LOG)) {
    db.createObjectStore(STORE_REVIEW_LOG, { keyPath: 'seq', autoIncrement: true });
  }

  if (!db.objectStoreNames.contains(STORE_META)) {
    db.createObjectStore(STORE_META, { keyPath: 'id' });
  }
}
