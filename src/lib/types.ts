export type ID = string;
export type Grade = 'again' | 'good';   // MVP Leitner binary (keys 1/2). 1–4 ease reserved for future SM-2 (delta-4).
export type ReviewMode = 'shuffle' | 'leitner';
export type ThemePref = 'system' | 'light' | 'dark';

export type ReviewScope =
  | { kind: 'all' }
  | { kind: 'section'; id: ID }
  | { kind: 'tag'; tag: string };

export interface Section { id: ID; name: string; order: number; createdAt: number; }

export interface Card {
  id: ID;
  sectionId: ID;
  front: string;            // Markdown SOURCE (question)
  back: string;             // Markdown SOURCE (answer)
  tags: string[];           // normalized: lowercase, no '#', trimmed, de-duped (enforced by Store — §3.2)
  box: number;              // Leitner box 1..LEITNER_BOXES (1 = hardest / shortest interval)
  lastReviewed: number | null;
  dueDate: number;          // ms epoch. NEVER null. A new card is due immediately (dueDate = createdAt).
  createdAt: number;
  modifiedAt: number;       // bumped only on CONTENT edits (not on review — see recordReview)
}

export interface ReviewLogEntry {
  seq: number;              // store-assigned autoIncrement key; monotonic ⇒ chronological
  cardId: ID;
  ts: number;               // ms epoch when graded
  grade: Grade;
  mode: ReviewMode;         // scheduler that produced this review
  elapsedMs: number;        // ms from card-shown to grade (see §3.6 review store)
}

export interface Settings {
  id: 'singleton';
  theme: ThemePref;
  reviewMode: ReviewMode;
  lastBackupAt: number | null;
  onboardedAt: number | null;   // set once after first-run sample-deck seed (idempotency flag — T1.10)
  schemaVersion: number;
}

export interface BackupFile {
  app: 'flash';
  schemaVersion: number;
  exportedAt: number;
  sections: Section[];
  cards: Card[];
  reviewLog: ReviewLogEntry[];
  settings: Omit<Settings, 'id'>;
}

export interface ImportSummary { sections: number; cards: number; reviews: number; }

export const SCHEMA_VERSION = 1;
export const LEITNER_BOXES = 3;
export const CADENCE_DAYS: readonly number[] = [1, 3, 7]; // index = box-1; box1→1d, box2→3d, box3→7d
export const DAY_MS = 86_400_000;
