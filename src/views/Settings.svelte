<script lang="ts">
  /**
   * Settings.svelte — the Settings view (T1.11).
   *
   * Responsibilities (§5 T1.11 row):
   *   - Theme toggle: system / light / dark  → settings store `setTheme`.
   *   - Review-mode toggle: shuffle / leitner → settings store `setReviewMode`.
   *   - Storage estimate via `navigator.storage.estimate()` (tolerates undefined
   *     quota/usage — typical on iOS).
   *   - Persist status with iOS feature-detection: when `navigator.storage.persist`
   *     is unavailable (typical iOS Safari) we show "Install to Home Screen + back
   *     up" guidance, NOT a false "not persisted" warning.
   *   - Export / Import buttons calling the FROZEN §3.8 `exportBackup` /
   *     `importBackup` signatures (codes against signatures — no hard wait on T1.8
   *     internals).
   *   - Backup-staleness note (the staleness *banner* itself lives on DeckList per
   *     §8 / T1.1; here we surface the same info plus last-backup time).
   *
   * Navigation: plain `<a href="#/">` hash link only (§3.5). This view never
   * imports/mutates `router.ts`.
   *
   * a11y (§3.5): the theme + mode toggles are radiogroups (radio buttons), each
   * control ≥44×44 via shared components / token sizing; state is conveyed by text
   * (checked radios + "Current" wording), never color alone; a polite live region
   * announces async outcomes (export done, import result, errors).
   */
  import type { ReviewMode, ThemePref } from '../lib/types';
  import {
    settings,
    setTheme,
    setReviewMode,
    backupIsStale,
    loadSettings
  } from '../lib/stores/settings.svelte';
  import { loadSections } from '../lib/stores/sections.svelte';
  import { loadCards } from '../lib/stores/cards.svelte';
  import { openStore, StoreUnavailableError } from '../lib/db/index';
  import { exportBackup } from '../lib/backup/export';
  import { importBackup } from '../lib/backup/import';
  import { now } from '../lib/util/time';
  import Button from '../components/Button.svelte';
  import ConfirmDelete from '../components/ConfirmDelete.svelte';

  // ── theme / review-mode options ──────────────────────────────────────────────
  const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' }
  ];

  const MODE_OPTIONS: { value: ReviewMode; label: string; hint: string }[] = [
    { value: 'shuffle', label: 'Shuffle', hint: 'Study all cards in random order.' },
    {
      value: 'leitner',
      label: 'Leitner (spaced)',
      hint: 'Show only due cards; correct answers wait longer.'
    }
  ];

  // ── async status surfaced to the user + a polite live region ─────────────────
  let statusMessage = $state('');
  let busy = $state(false);
  let importing = $state(false);
  let confirmImportOpen = $state(false);
  let pendingFile: File | null = $state(null);
  let fileInput: HTMLInputElement | null = $state(null);

  // ── storage estimate / persistence ───────────────────────────────────────────
  type PersistState = 'loading' | 'persisted' | 'transient' | 'unsupported';
  let persistState = $state<PersistState>('loading');
  let usageBytes = $state<number | null>(null);
  let quotaBytes = $state<number | null>(null);

  // Staleness is reactive on the settings cache; recompute against a fresh `now`.
  const stale = $derived(backupIsStale(now()));
  const lastBackupLabel = $derived(formatTimestamp(settings.value.lastBackupAt));

  // Resolve a Store once for backup operations. §3.8 functions take a Store; the
  // view obtains it via `openStore()` (the frozen singleton accessor).
  function withStore<T>(fn: (store: import('../lib/db/index').Store) => Promise<T>): Promise<T> {
    return openStore().then(fn);
  }

  function formatTimestamp(ts: number | null): string {
    if (ts === null) return 'Never';
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return new Date(ts).toISOString();
    }
  }

  function formatBytes(n: number | null): string {
    if (n === null || !Number.isFinite(n)) return 'unknown';
    if (n < 1024) return `${n} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let v = n / 1024;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    return `${v.toFixed(1)} ${units[i]}`;
  }

  async function refreshStorageInfo(): Promise<void> {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    const storage = nav?.storage;

    // Storage estimate (best-effort; tolerate undefined quota/usage).
    if (storage && typeof storage.estimate === 'function') {
      try {
        const est = await storage.estimate();
        usageBytes = typeof est.usage === 'number' ? est.usage : null;
        quotaBytes = typeof est.quota === 'number' ? est.quota : null;
      } catch {
        usageBytes = null;
        quotaBytes = null;
      }
    } else {
      usageBytes = null;
      quotaBytes = null;
    }

    // Persistence: feature-detect `persist`/`persisted`. iOS Safari lacks these.
    if (storage && typeof storage.persisted === 'function') {
      try {
        persistState = (await storage.persisted()) ? 'persisted' : 'transient';
      } catch {
        persistState = 'unsupported';
      }
    } else {
      // No Storage API persistence support → guidance, NOT a false warning.
      persistState = 'unsupported';
    }
  }

  async function requestPersist(): Promise<void> {
    const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (!storage || typeof storage.persist !== 'function') return;
    busy = true;
    try {
      const granted = await storage.persist();
      persistState = granted ? 'persisted' : 'transient';
      statusMessage = granted
        ? 'Storage is now persistent.'
        : 'The browser declined persistent storage; your data is still saved but may be evicted under storage pressure.';
    } catch {
      statusMessage = 'Could not request persistent storage.';
    } finally {
      busy = false;
    }
  }

  // ── theme / mode handlers ─────────────────────────────────────────────────────
  async function onThemeChange(value: ThemePref): Promise<void> {
    if (value === settings.value.theme) return;
    try {
      await setTheme(value);
    } catch {
      statusMessage = 'Could not save theme preference.';
    }
  }

  async function onModeChange(value: ReviewMode): Promise<void> {
    if (value === settings.value.reviewMode) return;
    try {
      await setReviewMode(value);
    } catch {
      statusMessage = 'Could not save review mode.';
    }
  }

  // ── export ────────────────────────────────────────────────────────────────────
  async function onExport(): Promise<void> {
    busy = true;
    statusMessage = '';
    try {
      await withStore((store) => exportBackup(store));
      statusMessage = 'Backup downloaded. Keep it somewhere safe.';
    } catch (err) {
      statusMessage =
        err instanceof StoreUnavailableError
          ? 'Storage is unavailable, so there is nothing to export.'
          : 'Export failed. Please try again.';
    } finally {
      busy = false;
    }
  }

  // ── import (REPLACE-only, delta-5 — confirm before destructive replace) ─────────
  function onFileSelected(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files && input.files.length > 0 ? input.files[0] : null;
    if (!file) return;
    pendingFile = file;
    confirmImportOpen = true;
  }

  function cancelImport(): void {
    confirmImportOpen = false;
    pendingFile = null;
    if (fileInput) fileInput.value = '';
  }

  async function confirmImport(): Promise<void> {
    const file = pendingFile;
    confirmImportOpen = false;
    if (!file) return;
    importing = true;
    busy = true;
    statusMessage = '';
    try {
      const summary = await withStore((store) => importBackup(store, file));
      // REPLACE wiped + reloaded the DB; refresh every reactive cache.
      await Promise.all([loadSettings(), loadSections(), loadCards()]);
      statusMessage = `Imported ${summary.sections} section(s), ${summary.cards} card(s), and ${summary.reviews} review(s).`;
    } catch (err) {
      statusMessage =
        err instanceof Error ? `Import failed: ${err.message}` : 'Import failed.';
    } finally {
      importing = false;
      busy = false;
      pendingFile = null;
      if (fileInput) fileInput.value = '';
    }
  }

  // Initial storage info on mount (best-effort; never throws into render).
  $effect(() => {
    void refreshStorageInfo();
  });
</script>

<section class="settings" aria-labelledby="settings-heading">
  <header class="settings-header">
    <a class="back-link" href="#/">&larr; Back to decks</a>
    <h1 id="settings-heading">Settings</h1>
  </header>

  <!-- Polite live region for async outcomes (§3.5). -->
  <p class="sr-status" aria-live="polite">{statusMessage}</p>

  <!-- Appearance / theme -->
  <fieldset class="card" role="radiogroup" aria-labelledby="theme-legend">
    <legend id="theme-legend">Theme</legend>
    <div class="options">
      {#each THEME_OPTIONS as opt (opt.value)}
        <label class="option">
          <input
            type="radio"
            name="theme"
            value={opt.value}
            checked={settings.value.theme === opt.value}
            onchange={() => onThemeChange(opt.value)}
          />
          <span>{opt.label}</span>
        </label>
      {/each}
    </div>
  </fieldset>

  <!-- Review mode -->
  <fieldset class="card" role="radiogroup" aria-labelledby="mode-legend">
    <legend id="mode-legend">Review mode</legend>
    <div class="options options-stacked">
      {#each MODE_OPTIONS as opt (opt.value)}
        <label class="option">
          <input
            type="radio"
            name="review-mode"
            value={opt.value}
            checked={settings.value.reviewMode === opt.value}
            onchange={() => onModeChange(opt.value)}
          />
          <span class="option-body">
            <span class="option-label">{opt.label}</span>
            <span class="option-hint">{opt.hint}</span>
          </span>
        </label>
      {/each}
    </div>
  </fieldset>

  <!-- Backup -->
  <div class="card">
    <h2>Backup &amp; restore</h2>
    <p class="muted">
      Last backup: <strong>{lastBackupLabel}</strong>
    </p>
    {#if stale}
      <p class="note note-warn" role="note">
        Your backup is out of date. Export your cards to avoid losing them.
      </p>
    {/if}
    <div class="actions">
      <Button variant="primary" onclick={onExport} disabled={busy}>Export backup</Button>
      <Button
        variant="secondary"
        onclick={() => fileInput?.click()}
        disabled={busy || importing}
      >
        {importing ? 'Importing…' : 'Import backup'}
      </Button>
    </div>
    <p class="muted small">
      Import <strong>replaces</strong> all current data with the contents of the file
      (no merge). Export first if you want to keep your current cards.
    </p>
    <!-- Hidden file input driven by the Import button. -->
    <input
      bind:this={fileInput}
      class="visually-hidden"
      type="file"
      accept="application/json,.json"
      aria-label="Choose a backup file to import"
      onchange={onFileSelected}
    />
  </div>

  <!-- Storage / persistence -->
  <div class="card">
    <h2>Device storage</h2>
    <p class="muted">
      Used: <strong>{formatBytes(usageBytes)}</strong>
      {#if quotaBytes !== null}
        of <strong>{formatBytes(quotaBytes)}</strong> available
      {/if}
    </p>

    {#if persistState === 'loading'}
      <p class="muted">Checking storage persistence…</p>
    {:else if persistState === 'persisted'}
      <p class="note note-ok" role="note">
        Storage is persistent — your data will not be evicted automatically.
      </p>
    {:else if persistState === 'transient'}
      <p class="note note-warn" role="note">
        Storage is not yet persistent and could be evicted under storage pressure.
      </p>
      <div class="actions">
        <Button variant="secondary" onclick={requestPersist} disabled={busy}>
          Request persistent storage
        </Button>
      </div>
    {:else}
      <!-- unsupported: typical iOS Safari — guidance, NOT a false warning. -->
      <p class="note" role="note">
        This browser doesn’t expose a persistence control. To keep your cards safe,
        add Flash to your Home Screen and export a backup regularly.
      </p>
    {/if}
  </div>
</section>

<ConfirmDelete
  open={confirmImportOpen}
  title="Replace all data?"
  message="Importing will permanently replace every section, card, and review in this app with the contents of the selected file. This cannot be undone."
  confirmLabel="Replace"
  cancelLabel="Cancel"
  onConfirm={confirmImport}
  onCancel={cancelImport}
/>

<style>
  .settings {
    max-width: 42rem;
    margin: 0 auto;
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .settings-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .back-link {
    color: var(--color-text-muted);
    text-decoration: none;
    align-self: flex-start;
    min-height: var(--tap-target-min);
    display: inline-flex;
    align-items: center;
  }
  .back-link:hover {
    color: var(--color-text);
    text-decoration: underline;
  }

  h1 {
    margin: 0;
    font-size: var(--font-size-lg);
  }

  h2 {
    margin: 0 0 var(--space-2);
    font-size: var(--font-size-md);
  }

  .card {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface-raised);
    padding: var(--space-4);
    margin: 0;
  }

  legend {
    font-weight: 600;
    padding: 0 var(--space-1);
  }

  .options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin-top: var(--space-2);
  }
  .options-stacked {
    flex-direction: column;
  }

  .option {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    min-height: var(--tap-target-min);
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .option:hover {
    background: var(--color-surface);
  }
  .option input {
    margin-top: 0.15rem;
    width: 1.1rem;
    height: 1.1rem;
  }

  .option-body {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .option-label {
    font-weight: 600;
  }
  .option-hint {
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin-top: var(--space-3);
  }

  .muted {
    color: var(--color-text-muted);
    margin: var(--space-1) 0;
  }
  .small {
    font-size: var(--font-size-sm);
  }

  .note {
    margin: var(--space-2) 0 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
  }
  .note-warn {
    border-color: var(--color-warning);
  }
  .note-ok {
    border-color: var(--color-success);
  }

  .sr-status,
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
</style>
