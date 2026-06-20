/**
 * backup/import.ts — JSON backup import (REPLACE-only, delta-5, §3.8, T1.8).
 *
 * `importBackup(store, file)`:
 *   1. reads the `File` text,
 *   2. JSON-parses it (throws a friendly error on malformed JSON),
 *   3. validates the shape via `validateBackup` (throws on invalid),
 *   4. calls `store.importAll(data)` which WIPES all stores and loads atomically,
 *      preserving ids + seq, and returns an `ImportSummary`.
 *
 * Import is REPLACE-only in the MVP (delta-5): no merge mode. The caller (Settings,
 * T1.11) is responsible for confirming the destructive replace with the user
 * before calling this, then reloading the reactive caches.
 *
 * `parseAndValidate` is exported (pure-ish; takes a raw string) for unit testing
 * the parse+validate path without a `File`.
 */
import type { Store } from '../db/index';
import type { BackupFile, ImportSummary } from '../types';
import { validateBackup } from './validate';

/**
 * Parse a JSON string and validate it as a `BackupFile`. Throws an `Error` with
 * a friendly message on malformed JSON or a failed validation gate.
 */
export function parseAndValidate(text: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }
  const result = validateBackup(parsed);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

/**
 * Read + validate a selected file, then REPLACE all data via `store.importAll`.
 * Per §3.8. Throws on invalid input (caller surfaces the message).
 */
export async function importBackup(store: Store, file: File): Promise<ImportSummary> {
  const text = await file.text();
  const data = parseAndValidate(text);
  return store.importAll(data);
}
