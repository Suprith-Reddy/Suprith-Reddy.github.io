<script lang="ts">
  /**
   * DeckList.svelte — the home view (`#/`). Sections + DeckList (T1.1).
   *
   * Responsibilities (T1.1):
   *   - List all sections (ordered), with a per-section card count.
   *   - Create a section (inline name input).
   *   - Rename a section in place (inline edit).
   *   - Delete a section with a ConfirmDelete dialog + a Toast UNDO
   *     (`removeSection` → `restoreSection` via the §3.6 stores).
   *   - Empty state when there are no sections yet.
   *   - HOSTS the backup-staleness banner (§8 / T1.1): when
   *     `backupIsStale(now())` it shows a "Back up your cards" CTA that triggers
   *     a JSON export (§3.8 `exportBackup`).
   *   - Fully keyboard-operable (real <button>s + native <input>s + <a> links).
   *
   * Navigation is via plain `<a href="#/...">` hash links (§3.5) — this view never
   * imports `router.ts`. Section rows link to `#/section/:id` (SectionView).
   *
   * State comes from the FROZEN §3.6 stores; this view never touches IndexedDB or
   * `types.ts`/router directly.
   */
  import type { Card, ID, Section } from '../lib/types';
  import {
    sections,
    loadSections,
    addSection,
    renameSection,
    removeSection,
    restoreSection
  } from '../lib/stores/sections.svelte';
  import { cardsOf, loadCards } from '../lib/stores/cards.svelte';
  import { backupIsStale } from '../lib/stores/settings.svelte';
  import { now } from '../lib/util/time';
  import { getStore } from '../lib/stores/_store.svelte';
  import { exportBackup } from '../lib/backup/export';
  import { showToast } from '../components/Toast.svelte';
  import Button from '../components/Button.svelte';
  import IconButton from '../components/IconButton.svelte';
  import ConfirmDelete from '../components/ConfirmDelete.svelte';

  // ── load on mount ────────────────────────────────────────────────────────
  // We load sections + ALL cards (so per-section counts are available without a
  // round-trip per row). loadCards() with no arg rebuilds every bucket.
  let loadError = $state<string | null>(null);
  let loaded = $state(false);

  $effect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await Promise.all([loadSections(), loadCards()]);
      } catch (err) {
        if (!cancelled) {
          loadError =
            err instanceof Error ? err.message : 'Storage is unavailable.';
        }
      } finally {
        if (!cancelled) loaded = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  // ── create ───────────────────────────────────────────────────────────────
  let newName = $state('');
  let creating = $state(false);

  async function handleCreate(e?: Event): Promise<void> {
    e?.preventDefault();
    const name = newName.trim();
    if (!name || creating) return;
    creating = true;
    try {
      await addSection(name);
      newName = '';
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Could not create the section.'
      );
    } finally {
      creating = false;
    }
  }

  // ── rename ───────────────────────────────────────────────────────────────
  let editingId = $state<ID | null>(null);
  let editingName = $state('');

  function startRename(s: Section): void {
    editingId = s.id;
    editingName = s.name;
  }

  function cancelRename(): void {
    editingId = null;
    editingName = '';
  }

  async function commitRename(id: ID): Promise<void> {
    const name = editingName.trim();
    if (!name) {
      cancelRename();
      return;
    }
    try {
      await renameSection(id, name);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Could not rename the section.'
      );
    } finally {
      cancelRename();
    }
  }

  function onRenameKey(e: KeyboardEvent, id: ID): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commitRename(id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelRename();
    }
  }

  // ── delete (+ undo) ──────────────────────────────────────────────────────
  let pendingDelete = $state<Section | null>(null);

  function askDelete(s: Section): void {
    pendingDelete = s;
  }

  async function confirmDelete(): Promise<void> {
    const target = pendingDelete;
    pendingDelete = null;
    if (!target) return;
    let payload: { section: Section; cards: Card[] };
    try {
      payload = await removeSection(target.id);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Could not delete the section.'
      );
      return;
    }
    const count = payload.cards.length;
    const noun = count === 1 ? 'card' : 'cards';
    showToast(`Deleted "${target.name}" (${count} ${noun}).`, {
      action: {
        label: 'Undo',
        onAction: () => {
          void restoreSection(payload).catch((err: unknown) => {
            showToast(
              err instanceof Error ? err.message : 'Could not undo the delete.'
            );
          });
        }
      }
    });
  }

  // ── backup-staleness banner (§8 / T1.1) ──────────────────────────────────
  // Recomputed reactively; `now()` is read once when this view renders. The
  // banner appears when no backup has ever been made or the last one is >14d old.
  let stale = $derived(loaded && backupIsStale(now()));
  let exporting = $state(false);

  async function handleBackup(): Promise<void> {
    if (exporting) return;
    exporting = true;
    try {
      const store = await getStore();
      // §3.8 frozen signature: exportBackup(store) builds the BackupFile, triggers
      // the download, and calls markBackup(now()) (clearing the staleness banner).
      await exportBackup(store);
    } catch (err) {
      showToast(
        err instanceof Error
          ? `Backup failed: ${err.message}`
          : 'Backup failed.'
      );
    } finally {
      exporting = false;
    }
  }

  // ── derived view data ────────────────────────────────────────────────────
  function countOf(sectionId: ID): number {
    return cardsOf(sectionId).length;
  }
</script>

<section class="deck-list" aria-labelledby="deck-list-heading">
  <header class="deck-list__header">
    <h1 id="deck-list-heading">Your decks</h1>
  </header>

  {#if stale}
    <div class="backup-banner" role="region" aria-label="Backup reminder">
      <div class="backup-banner__text">
        <strong>Back up your cards</strong>
        <span
          >Your data lives only on this device. Download a backup so you don't
          lose it.</span
        >
      </div>
      <Button variant="primary" onclick={handleBackup} disabled={exporting}>
        {exporting ? 'Exporting…' : 'Back up your cards'}
      </Button>
    </div>
  {/if}

  <form class="create-form" onsubmit={handleCreate}>
    <label class="create-form__label" for="new-section-name">New section</label>
    <div class="create-form__row">
      <input
        id="new-section-name"
        class="create-form__input"
        type="text"
        placeholder="Section name"
        bind:value={newName}
        autocomplete="off"
      />
      <Button type="submit" variant="primary" disabled={!newName.trim() || creating}>
        Add section
      </Button>
    </div>
  </form>

  {#if loadError}
    <p class="status status--error" role="alert">
      Storage is unavailable: {loadError}
    </p>
  {:else if !loaded}
    <p class="status" aria-live="polite">Loading…</p>
  {:else if sections.value.length === 0}
    <div class="empty" role="note">
      <p class="empty__title">No sections yet.</p>
      <p class="empty__hint">
        Create your first section above to start adding cards.
      </p>
    </div>
  {:else}
    <ul class="sections" aria-label="Sections">
      {#each sections.value as section (section.id)}
        <li class="section-row">
          {#if editingId === section.id}
            <div class="section-row__edit">
              <!-- svelte-ignore a11y_autofocus -->
              <input
                class="section-row__rename-input"
                type="text"
                aria-label="Section name"
                bind:value={editingName}
                autofocus
                onkeydown={(e) => onRenameKey(e, section.id)}
              />
              <Button
                size="sm"
                variant="primary"
                onclick={() => commitRename(section.id)}
              >
                Save
              </Button>
              <Button size="sm" variant="ghost" onclick={cancelRename}>
                Cancel
              </Button>
            </div>
          {:else}
            <a class="section-row__link" href={`#/section/${section.id}`}>
              <span class="section-row__name">{section.name}</span>
              <span class="section-row__count">
                {countOf(section.id)}
                {countOf(section.id) === 1 ? 'card' : 'cards'}
              </span>
            </a>
            <div class="section-row__actions">
              <IconButton
                label={`Rename ${section.name}`}
                onclick={() => startRename(section)}
              >
                ✎
              </IconButton>
              <IconButton
                label={`Delete ${section.name}`}
                variant="danger"
                onclick={() => askDelete(section)}
              >
                🗑
              </IconButton>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<ConfirmDelete
  open={pendingDelete !== null}
  title="Delete section?"
  message={pendingDelete
    ? `"${pendingDelete.name}" and its ${countOf(pendingDelete.id)} card(s) will be deleted. You can undo this.`
    : ''}
  confirmLabel="Delete"
  onConfirm={confirmDelete}
  onCancel={() => (pendingDelete = null)}
/>

<style>
  .deck-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-width: 42rem;
    margin: 0 auto;
    padding: var(--space-4);
  }

  .deck-list__header h1 {
    margin: 0;
    font-size: var(--font-size-xl);
  }

  /* backup-staleness banner */
  .backup-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    flex-wrap: wrap;
    padding: var(--space-3) var(--space-4);
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-left: 4px solid var(--color-primary);
    border-radius: var(--radius-md);
  }
  .backup-banner__text {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .backup-banner__text span {
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
  }

  /* create form */
  .create-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .create-form__label {
    font-weight: 600;
    font-size: var(--font-size-sm);
  }
  .create-form__row {
    display: flex;
    gap: var(--space-2);
  }
  .create-form__input {
    flex: 1 1 auto;
    min-height: var(--tap-target-min);
    padding: var(--space-2) var(--space-3);
    background: var(--color-surface-raised);
    color: var(--color-text);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: var(--font-size-md);
  }

  .status {
    margin: 0;
    color: var(--color-text-muted);
  }
  .status--error {
    color: var(--color-danger);
  }

  .empty {
    padding: var(--space-5) var(--space-4);
    text-align: center;
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-md);
  }
  .empty__title {
    margin: 0 0 var(--space-1);
    font-weight: 600;
  }
  .empty__hint {
    margin: 0;
    color: var(--color-text-muted);
  }

  .sections {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .section-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface-raised);
  }

  .section-row__link {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-height: var(--tap-target-min);
    padding: var(--space-2) var(--space-3);
    color: var(--color-text);
    text-decoration: none;
    border-radius: var(--radius-sm);
  }
  .section-row__link:hover {
    background: var(--color-surface);
  }
  .section-row__name {
    font-weight: 600;
  }
  .section-row__count {
    flex: 0 0 auto;
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
  }

  .section-row__actions {
    flex: 0 0 auto;
    display: flex;
    gap: var(--space-1);
  }

  .section-row__edit {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .section-row__rename-input {
    flex: 1 1 auto;
    min-height: var(--tap-target-min);
    padding: var(--space-2) var(--space-3);
    background: var(--color-surface);
    color: var(--color-text);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: var(--font-size-md);
  }
</style>
