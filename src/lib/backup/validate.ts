/**
 * backup/validate.ts — backup JSON validation (§3.8, T1.8).
 *
 * `validateBackup(json)` checks an unknown value (typically the parsed contents
 * of a user-selected file) against the `BackupFile` shape and returns a
 * discriminated `ValidateResult`:
 *   - `{ ok: true, data }`  — `data` is a structurally-valid `BackupFile`.
 *   - `{ ok: false, error }` — `error` is a human-readable reason.
 *
 * It enforces the contract gates: `app === 'flash'`, `schemaVersion === SCHEMA_VERSION`,
 * and the presence/shape of `sections`, `cards`, `reviewLog`, and `settings`.
 * It is PURE (no Store, no DOM) so it is trivially unit-testable.
 *
 * Note: the Store's `importAll` ALSO re-validates `schemaVersion`; this is the
 * caller-facing gate that produces friendly messages before we ever touch the DB.
 */
import type {
  BackupFile,
  Card,
  ReviewLogEntry,
  Section,
  Settings
} from '../types';
import { SCHEMA_VERSION, LEITNER_BOXES } from '../types';
import type { ValidateResult } from '../db/index';

type Rec = Record<string, unknown>;

function isObject(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** number | null */
function isNumberOrNull(v: unknown): v is number | null {
  return v === null || isFiniteNumber(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(isString);
}

function validateSection(v: unknown, i: number): string | null {
  if (!isObject(v)) return `sections[${i}] is not an object`;
  if (!isString(v.id)) return `sections[${i}].id must be a string`;
  if (!isString(v.name)) return `sections[${i}].name must be a string`;
  if (!isFiniteNumber(v.order)) return `sections[${i}].order must be a number`;
  if (!isFiniteNumber(v.createdAt)) return `sections[${i}].createdAt must be a number`;
  return null;
}

function validateCard(v: unknown, i: number): string | null {
  if (!isObject(v)) return `cards[${i}] is not an object`;
  if (!isString(v.id)) return `cards[${i}].id must be a string`;
  if (!isString(v.sectionId)) return `cards[${i}].sectionId must be a string`;
  if (!isString(v.front)) return `cards[${i}].front must be a string`;
  if (!isString(v.back)) return `cards[${i}].back must be a string`;
  if (!isStringArray(v.tags)) return `cards[${i}].tags must be a string[]`;
  // box MUST be an integer in 1..LEITNER_BOXES. An out-of-range box would make
  // leitner.next read CADENCE_DAYS[box-1] = undefined → dueDate = NaN, which
  // compares false in every by-due range scan (the card never becomes due) and
  // can poison the by-due index. Reject rather than load a scheduler-breaking value.
  if (!Number.isInteger(v.box) || (v.box as number) < 1 || (v.box as number) > LEITNER_BOXES) {
    return `cards[${i}].box must be an integer in 1..${LEITNER_BOXES}`;
  }
  if (!isNumberOrNull(v.lastReviewed)) return `cards[${i}].lastReviewed must be a number or null`;
  // dueDate is NEVER null and must be a positive finite ms-epoch (contract §3.1);
  // a non-finite or non-positive dueDate breaks scheduling/the by-due index.
  if (!isFiniteNumber(v.dueDate) || v.dueDate <= 0) {
    return `cards[${i}].dueDate must be a positive number`;
  }
  if (!isFiniteNumber(v.createdAt)) return `cards[${i}].createdAt must be a number`;
  if (!isFiniteNumber(v.modifiedAt)) return `cards[${i}].modifiedAt must be a number`;
  return null;
}

function validateReview(v: unknown, i: number): string | null {
  if (!isObject(v)) return `reviewLog[${i}] is not an object`;
  if (!isFiniteNumber(v.seq)) return `reviewLog[${i}].seq must be a number`;
  if (!isString(v.cardId)) return `reviewLog[${i}].cardId must be a string`;
  if (!isFiniteNumber(v.ts)) return `reviewLog[${i}].ts must be a number`;
  if (v.grade !== 'again' && v.grade !== 'good') {
    return `reviewLog[${i}].grade must be 'again' | 'good'`;
  }
  if (v.mode !== 'shuffle' && v.mode !== 'leitner') {
    return `reviewLog[${i}].mode must be 'shuffle' | 'leitner'`;
  }
  if (!isFiniteNumber(v.elapsedMs)) return `reviewLog[${i}].elapsedMs must be a number`;
  return null;
}

function validateSettings(v: unknown): string | null {
  if (!isObject(v)) return 'settings is not an object';
  if (v.theme !== 'system' && v.theme !== 'light' && v.theme !== 'dark') {
    return "settings.theme must be 'system' | 'light' | 'dark'";
  }
  if (v.reviewMode !== 'shuffle' && v.reviewMode !== 'leitner') {
    return "settings.reviewMode must be 'shuffle' | 'leitner'";
  }
  if (!isNumberOrNull(v.lastBackupAt)) return 'settings.lastBackupAt must be a number or null';
  if (!isNumberOrNull(v.onboardedAt)) return 'settings.onboardedAt must be a number or null';
  if (!isFiniteNumber(v.schemaVersion)) return 'settings.schemaVersion must be a number';
  return null;
}

/**
 * Validate an unknown value as a `BackupFile` (§3.8). Returns a discriminated
 * result; never throws.
 */
export function validateBackup(json: unknown): ValidateResult {
  if (!isObject(json)) {
    return { ok: false, error: 'Backup is not a JSON object.' };
  }
  if (json.app !== 'flash') {
    return { ok: false, error: "Not a Flash backup (missing app: 'flash')." };
  }
  if (json.schemaVersion !== SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Unsupported schema version ${String(json.schemaVersion)} (expected ${SCHEMA_VERSION}).`
    };
  }
  if (!isFiniteNumber(json.exportedAt)) {
    return { ok: false, error: 'Backup is missing a valid exportedAt timestamp.' };
  }

  if (!Array.isArray(json.sections)) return { ok: false, error: 'Backup.sections must be an array.' };
  if (!Array.isArray(json.cards)) return { ok: false, error: 'Backup.cards must be an array.' };
  if (!Array.isArray(json.reviewLog)) {
    return { ok: false, error: 'Backup.reviewLog must be an array.' };
  }

  for (let i = 0; i < json.sections.length; i++) {
    const err = validateSection(json.sections[i], i);
    if (err) return { ok: false, error: err };
  }
  for (let i = 0; i < json.cards.length; i++) {
    const err = validateCard(json.cards[i], i);
    if (err) return { ok: false, error: err };
  }
  for (let i = 0; i < json.reviewLog.length; i++) {
    const err = validateReview(json.reviewLog[i], i);
    if (err) return { ok: false, error: err };
  }

  const settingsErr = validateSettings(json.settings);
  if (settingsErr) return { ok: false, error: settingsErr };

  // All gates passed — assert the validated shape.
  const data: BackupFile = {
    app: 'flash',
    schemaVersion: json.schemaVersion,
    exportedAt: json.exportedAt,
    sections: json.sections as Section[],
    cards: json.cards as Card[],
    reviewLog: json.reviewLog as ReviewLogEntry[],
    settings: json.settings as Omit<Settings, 'id'>
  };
  return { ok: true, data };
}
