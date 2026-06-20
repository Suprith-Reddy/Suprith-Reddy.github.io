<script lang="ts">
  /**
   * CardEditor — create / edit a card (T1.2).
   *
   * Routes (§3.7): `#/new` (create) and `#/edit/:id` (edit). Mode is derived from
   * the reactive `route` store: an `id` param ⇒ edit, otherwise create.
   *
   * Responsibilities (T1.2 acceptance):
   *   - front/back Markdown textareas with a LIVE PREVIEW via <CardContent> (§3.4).
   *   - section picker: in edit mode, changing the section is a MOVE (F-4) and bumps
   *     modifiedAt via `moveCard`; content edits go through `editCard` (also bumps
   *     modifiedAt). Create uses `addCard`.
   *   - tags: add (Enter / comma / blur) + remove via <TagChip> (removable mode).
   *     Tags are previewed raw; the Store normalizes them on save (§3.2 chokepoint).
   *   - delete with confirm (<ConfirmDelete>) + Toast undo (`removeCard`/`restoreCard`).
   *
   * Navigation (§3.5): we only READ the `route` store; we never register/mutate the
   * route table. Programmatic navigation sets `location.hash` directly (no router.ts
   * mutation helper), and links are plain <a href="#/...">.
   */
  import { route, type RouteState } from '../router';
  import type { Card, ID, Section } from '../lib/types';
  import { sections, loadSections } from '../lib/stores/sections.svelte';
  import { addCard, editCard, moveCard, removeCard, restoreCard } from '../lib/stores/cards.svelte';
  import { getStore } from '../lib/stores/_store.svelte';
  import { normalizeTag } from '../lib/util/tags';
  import CardContent from '../components/CardContent.svelte';
  import ConfirmDelete from '../components/ConfirmDelete.svelte';
  import TagChip from '../components/TagChip.svelte';
  import Button from '../components/Button.svelte';
  import { showToast } from '../components/Toast.svelte';

  // ── route → mode ────────────────────────────────────────────────────────────
  let current = $state<RouteState>(route.value);
  $effect(() => {
    const unsub = route.subscribe((r) => {
      current = r;
    });
    return unsub;
  });

  // Edit when the route carries an `id` param (#/edit/:id); else create (#/new).
  const editId = $derived(current.params.id ?? null);
  const isEdit = $derived(editId !== null);

  // ── form state ───────────────────────────────────────────────────────────────
  let sectionId = $state<ID | ''>('');
  let front = $state('');
  let back = $state('');
  let tags = $state<string[]>([]);
  let tagDraft = $state('');

  let loadedCardId = $state<ID | null>(null); // which card the form currently reflects
  // The section the loaded card lived in BEFORE this edit. Captured once on hydrate so
  // we can tell whether the picker changed it (⇒ a move, F-4). Plain (non-reactive).
  let originalSectionId: ID | '' = '';
  let loadError = $state<string | null>(null);
  let saving = $state(false);
  let confirming = $state(false);

  const sectionList = $derived<Section[]>(sections.value);

  // Load sections once on mount (so the picker has options even on a deep-link).
  $effect(() => {
    void loadSections();
  });

  // (Re)load the form whenever the target card id changes (deep-link / navigation).
  $effect(() => {
    const id = editId;
    if (id === null) {
      // Create mode: reset once when transitioning into it.
      if (loadedCardId !== null || loadError !== null) resetForm();
      loadedCardId = null;
      return;
    }
    if (id === loadedCardId) return; // already reflecting this card
    void hydrate(id);
  });

  function resetForm(): void {
    sectionId = '';
    front = '';
    back = '';
    tags = [];
    tagDraft = '';
    loadError = null;
    originalSectionId = '';
  }

  async function hydrate(id: ID): Promise<void> {
    loadError = null;
    try {
      const store = await getStore();
      const card: Card | undefined = await store.getCard(id);
      if (!card) {
        loadError = 'Card not found.';
        loadedCardId = id;
        return;
      }
      sectionId = card.sectionId;
      originalSectionId = card.sectionId;
      front = card.front;
      back = card.back;
      tags = [...card.tags];
      tagDraft = '';
      loadedCardId = id;
    } catch {
      loadError = 'Could not open this card (storage unavailable).';
      loadedCardId = id;
    }
  }

  // ── tags ───────────────────────────────────────────────────────────────────
  /** Commit the current draft as a tag (normalized, de-duped). */
  function commitTag(): void {
    const t = normalizeTag(tagDraft);
    tagDraft = '';
    if (t === '' || tags.includes(t)) return;
    tags = [...tags, t];
  }

  function onTagKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitTag();
    } else if (e.key === 'Backspace' && tagDraft === '' && tags.length > 0) {
      // Quick-remove the last tag when the input is empty.
      tags = tags.slice(0, -1);
    }
  }

  function removeTag(tag: string): void {
    tags = tags.filter((t) => t !== tag);
  }

  // ── validity ─────────────────────────────────────────────────────────────────
  const canSave = $derived(
    !saving &&
      sectionId !== '' &&
      front.trim() !== '' &&
      back.trim() !== '' &&
      loadError === null
  );

  // ── persistence ───────────────────────────────────────────────────────────────
  function goTo(hash: string): void {
    // §3.5: navigate by setting the hash; never mutate the router table.
    window.location.hash = hash.startsWith('#') ? hash : `#${hash}`;
  }

  async function save(): Promise<void> {
    if (!canSave || sectionId === '') return;
    // Fold any uncommitted draft into the tag list first.
    if (tagDraft.trim() !== '') commitTag();
    saving = true;
    try {
      if (isEdit && editId !== null) {
        // Content edit (front/back/tags) — bumps modifiedAt via editCard (§3.6).
        await editCard(editId, { front, back, tags });
        // Section change = MOVE (F-4); also bumps modifiedAt via moveCard (§3.6).
        if (sectionId !== originalSectionId) {
          await moveCard(editId, sectionId);
          originalSectionId = sectionId;
        }
        showToast('Card saved.');
        goTo(`#/section/${sectionId}`);
      } else {
        const created = await addCard({ sectionId, front, back, tags });
        showToast('Card added.');
        goTo(`#/section/${created.sectionId}`);
      }
    } catch {
      saving = false;
      showToast('Could not save the card.', { urgency: 'assertive' });
      return;
    }
    saving = false;
  }

  function requestDelete(): void {
    confirming = true;
  }

  async function confirmDelete(): Promise<void> {
    confirming = false;
    if (editId === null) return;
    const destSection = sectionId;
    try {
      const deleted = await removeCard(editId);
      showToast('Card deleted.', {
        action: {
          label: 'Undo',
          onAction: () => {
            void restoreCard(deleted);
          }
        }
      });
      goTo(destSection !== '' ? `#/section/${destSection}` : '#/');
    } catch {
      showToast('Could not delete the card.', { urgency: 'assertive' });
    }
  }
</script>

<section class="editor" aria-labelledby="editor-heading">
  <header class="editor-head">
    <h1 id="editor-heading">{isEdit ? 'Edit card' : 'New card'}</h1>
    <a class="back-link" href="#/">Back to decks</a>
  </header>

  {#if loadError}
    <p class="error" role="alert">{loadError}</p>
    <p><a href="#/">Return to decks</a></p>
  {:else}
    <div class="grid">
      <!-- ── Form column ───────────────────────────────────────────── -->
      <form class="form" onsubmit={(e) => { e.preventDefault(); void save(); }}>
        <div class="field">
          <label for="section-select">Section</label>
          {#if sectionList.length === 0}
            <p class="hint">
              No sections yet. <a href="#/">Create one first</a>.
            </p>
          {:else}
            <select id="section-select" bind:value={sectionId}>
              <option value="" disabled>Choose a section…</option>
              {#each sectionList as s (s.id)}
                <option value={s.id}>{s.name}</option>
              {/each}
            </select>
            {#if isEdit}
              <p class="hint">Changing the section moves this card.</p>
            {/if}
          {/if}
        </div>

        <div class="field">
          <label for="front-input">Front (question)</label>
          <textarea
            id="front-input"
            bind:value={front}
            rows="5"
            placeholder="Markdown supported…"
          ></textarea>
        </div>

        <div class="field">
          <label for="back-input">Back (answer)</label>
          <textarea
            id="back-input"
            bind:value={back}
            rows="5"
            placeholder="Markdown supported…"
          ></textarea>
        </div>

        <div class="field">
          <label for="tag-input">Tags</label>
          {#if tags.length > 0}
            <ul class="tag-list" aria-label="Tags on this card">
              {#each tags as t (t)}
                <li>
                  <TagChip tag={t} onRemove={removeTag} />
                </li>
              {/each}
            </ul>
          {/if}
          <input
            id="tag-input"
            type="text"
            bind:value={tagDraft}
            onkeydown={onTagKeydown}
            onblur={commitTag}
            placeholder="Add a tag, press Enter"
            autocomplete="off"
          />
          <p class="hint">Press Enter or comma to add. Tags are lowercased.</p>
        </div>

        <div class="actions">
          <Button variant="primary" type="submit" disabled={!canSave}>
            {isEdit ? 'Save changes' : 'Add card'}
          </Button>
          {#if isEdit}
            <Button variant="danger" onclick={requestDelete}>Delete</Button>
          {/if}
        </div>
      </form>

      <!-- ── Live preview column ───────────────────────────────────── -->
      <div class="preview" aria-label="Live preview">
        <h2 class="preview-heading">Preview</h2>
        <div class="preview-card">
          <p class="preview-label">Front</p>
          <div class="preview-body">
            {#if front.trim() === ''}
              <span class="placeholder">Nothing yet.</span>
            {:else}
              <CardContent markdown={front} />
            {/if}
          </div>
          <hr />
          <p class="preview-label">Back</p>
          <div class="preview-body">
            {#if back.trim() === ''}
              <span class="placeholder">Nothing yet.</span>
            {:else}
              <CardContent markdown={back} />
            {/if}
          </div>
        </div>
      </div>
    </div>
  {/if}
</section>

<ConfirmDelete
  open={confirming}
  title="Delete card?"
  message="This card will be deleted. You can undo right after."
  confirmLabel="Delete"
  onConfirm={() => void confirmDelete()}
  onCancel={() => (confirming = false)}
/>

<style>
  .editor {
    max-width: 64rem;
    margin: 0 auto;
  }
  .editor-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-4);
    margin-bottom: var(--space-4);
  }
  .editor-head h1 {
    margin: 0;
    font-size: var(--font-size-lg);
  }
  .back-link {
    font-size: var(--font-size-sm);
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-5);
  }
  @media (min-width: 48rem) {
    .grid {
      grid-template-columns: 1fr 1fr;
    }
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  label {
    font-weight: 600;
  }
  select,
  textarea,
  input[type='text'] {
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface-raised);
    color: var(--color-text);
    font-size: var(--font-size-md);
    font-family: inherit;
  }
  textarea {
    font-family: var(--font-mono);
    resize: vertical;
  }
  select {
    min-height: var(--tap-target-min);
  }
  input[type='text'] {
    min-height: var(--tap-target-min);
  }

  .hint {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
  }

  .tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .actions {
    display: flex;
    gap: var(--space-3);
    margin-top: var(--space-2);
  }

  .error {
    margin: 0 0 var(--space-3);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-danger);
    border-radius: var(--radius-md);
    color: var(--color-danger);
    background: var(--color-surface);
  }

  .preview {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .preview-heading {
    margin: 0;
    font-size: var(--font-size-md);
    color: var(--color-text-muted);
  }
  .preview-card {
    padding: var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
  }
  .preview-label {
    margin: 0 0 var(--space-1);
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--color-text-muted);
  }
  .preview-body {
    margin-bottom: var(--space-3);
  }
  .preview-card hr {
    border: none;
    border-top: 1px solid var(--color-border);
    margin: var(--space-3) 0;
  }
  .placeholder {
    color: var(--color-text-muted);
    font-style: italic;
  }
</style>
