/**
 * backup/export.ts — JSON backup export (§3.8, T1.8).
 *
 * `exportBackup(store)`:
 *   1. builds the `BackupFile` via `store.exportAll()` (ids + seq preserved),
 *   2. serializes it to pretty JSON and triggers a browser download named
 *      `flash-backup-YYYY-MM-DD.json` (an anchor + object URL — the only
 *      approach that reliably works on iOS Safari, where the file is offered
 *      to the Files app / share sheet),
 *   3. records the backup time via the reactive settings store's `markBackup`
 *      so the staleness banner (DeckList) and Settings note update.
 *
 * Pure-logic helpers (`backupFilename`, `serializeBackup`) are exported for unit
 * testing without a DOM.
 */
import type { Store } from '../db/index';
import type { BackupFile } from '../types';
import { markBackup } from '../stores/settings.svelte';

/** `flash-backup-YYYY-MM-DD.json` using the LOCAL calendar date of `ts`. */
export function backupFilename(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `flash-backup-${yyyy}-${mm}-${dd}.json`;
}

/** Stable, human-readable JSON serialization of a backup. */
export function serializeBackup(data: BackupFile): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Trigger a client-side download of `text` as `filename`. Uses an anchor +
 * object URL (works on iOS Safari, unlike `showSaveFilePicker`). No-op without
 * a DOM (e.g. SSR / unit tests calling the higher-level export directly).
 */
function downloadJson(filename: string, text: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  // Must be in the DOM for the click to dispatch in some browsers.
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the click is processed; small delay keeps Safari happy.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Build the backup, download it, and record the backup time.
 * Per §3.8.
 */
export async function exportBackup(store: Store): Promise<void> {
  const data: BackupFile = await store.exportAll();
  const text = serializeBackup(data);
  const now = Date.now();
  downloadJson(backupFilename(now), text);
  await markBackup(now);
}
