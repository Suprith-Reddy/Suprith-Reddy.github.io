<script lang="ts">
  /**
   * SectionView.svelte — a single section (`#/section/:id`). (T1.1)
   *
   * Responsibilities (T1.1):
   *   - Read the `:id` param from the route store (READ-only, §3.5 — never imports
   *     a mutating router API; only the reactive `route` value).
   *   - List the cards within that section (front preview + tag chips).
   *   - Render `TagFilterBar` (§3.9) to filter the listed cards by tag.
   *   - Empty state when the section has no cards.
   *   - Keyboard-operable; navigation via `<a href="#/...">` hash links (§3.5):
   *       · "Add card"   → `#/new`        (CardEditor create — owned by T1.2)
   *       · per-card edit → `#/edit/:id`   (CardEditor edit — owned by T1.2)
   *       · "Review"     → `#/review/s:<id>` (Review — owned by T1.3)
   *
   * Card CRUD itself is owned by T1.2 (CardEditor); this view only LISTS cards and
   * links out. Section delete/rename live on DeckList (T1.1).
   *
   * State comes from the FROZEN §3.6 stores. The `route` store is read per §3.7;
   * we subscribe (the store's Svelte-store contract) and mirror `:id` into local
   * reactive state so the view re-derives when the hash changes.
   */
  import type { Card, ID } from '../lib/types';
  import { route } from '../router';
  import { sections, loadSections } from '../lib/stores/sections.svelte';
  import { cardsOf, loadCards } from '../lib/stores/cards.svelte';
  import TagFilterBar from '../components/TagFilterBar.svelte';

  // ── route param (read-only, §3.5) ────────────────────────────────────────
  // We subscribe to the frozen `route` store and pull the `:id` param. T2.1 wires
  // the route table that populates params; until then params may be empty, in
  // which case we show a "section not found" state rather than crashing.
  let sectionId = $state<ID | null>(idFromRoute());

  function idFromRoute(): ID | null {
    const fromParams = route.value.params['id'];
    if (fromParams) return fromParams;
    // Defensive fallback: parse `/section/:id` straight from the path so deep-link
    // refresh works even before T2.1's table populates `params`.
    const m = /^\/section\/(.+)$/.exec(route.value.path);
    return m && m[1] ? decodeURIComponent(m[1]) : null;
  }

  $effect(() => {
    const unsub = route.subscribe(() => {
      sectionId = idFromRoute();
    });
    return unsub;
  });

  // ── load on mount / when the section changes ─────────────────────────────
  let loadError = $state<string | null>(null);
  let loaded = $state(false);

  $effect(() => {
    const id = sectionId;
    if (!id) {
      loaded = true;
      return;
    }
    let cancelled = false;
    loaded = false;
    loadError = null;
    void (async () => {
      try {
        await Promise.all([loadSections(), loadCards(id)]);
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

  // ── derived view data ────────────────────────────────────────────────────
  let section = $derived(
    sectionId ? sections.value.find((s) => s.id === sectionId) ?? null : null
  );

  let cards = $derived<Card[]>(sectionId ? cardsOf(sectionId) : []);

  // All distinct tags present in this section, sorted, for the filter bar.
  let sectionTags = $derived(
    Array.from(new Set(cards.flatMap((c) => c.tags))).sort()
  );

  // Selected filter tags (AND semantics: a card must carry every selected tag).
  let selectedTags = $state<string[]>([]);

  function toggleTag(tag: string): void {
    selectedTags = selectedTags.includes(tag)
      ? selectedTags.filter((t) => t !== tag)
      : [...selectedTags, tag];
  }

  // Drop any selected tag that no longer exists in this section (e.g. after a
  // card edit removed it) so the filter can't get stuck on a phantom tag.
  $effect(() => {
    const present = new Set(sectionTags);
    const pruned = selectedTags.filter((t) => present.has(t));
    if (pruned.length !== selectedTags.length) selectedTags = pruned;
  });

  let visibleCards = $derived(
    selectedTags.length === 0
      ? cards
      : cards.filter((c) => selectedTags.every((t) => c.tags.includes(t)))
  );

  /** First non-empty line of the front Markdown, for a compact list preview. */
  function preview(markdown: string): string {
    const line = markdown
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    if (!line) return '(empty card)';
    return line.length > 120 ? `${line.slice(0, 117)}…` : line;
  }
</script>

<section class="section-view" aria-labelledby="section-view-heading">
  {#if loadError}
    <p class="status status--error" role="alert">
      Storage is unavailable: {loadError}
    </p>
  {:else if !sectionId}
    <p class="status" role="alert">No section selected.</p>
    <p><a class="back-link" href="#/">← Back to decks</a></p>
  {:else if !loaded}
    <p class="status" aria-live="polite">Loading…</p>
  {:else if !section}
    <p class="status" role="alert">Section not found.</p>
    <p><a class="back-link" href="#/">← Back to decks</a></p>
  {:else}
    <header class="section-view__header">
      <a class="back-link" href="#/">← Decks</a>
      <h1 id="section-view-heading">{section.name}</h1>
      <div class="section-view__actions">
        <a class="action action--primary" href="#/new">+ Add card</a>
        {#if cards.length > 0}
          <a class="action" href={`#/review/s:${section.id}`}>Review</a>
        {/if}
      </div>
    </header>

    {#if sectionTags.length > 0}
      <TagFilterBar
        tags={sectionTags}
        selected={selectedTags}
        onToggle={toggleTag}
        label={`Filter ${section.name} by tag`}
      />
    {/if}

    {#if cards.length === 0}
      <div class="empty" role="note">
        <p class="empty__title">No cards in this section yet.</p>
        <p class="empty__hint">Add your first card to start studying.</p>
      </div>
    {:else if visibleCards.length === 0}
      <p class="status" aria-live="polite">
        No cards match the selected tag{selectedTags.length === 1 ? '' : 's'}.
      </p>
    {:else}
      <ul class="cards" aria-label={`Cards in ${section.name}`}>
        {#each visibleCards as card (card.id)}
          <li class="card-row">
            <a class="card-row__link" href={`#/edit/${card.id}`}>
              <span class="card-row__front">{preview(card.front)}</span>
              {#if card.tags.length > 0}
                <span class="card-row__tags">
                  {#each card.tags as tag (tag)}
                    <span class="card-row__tag">#{tag}</span>
                  {/each}
                </span>
              {/if}
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</section>

<style>
  .section-view {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-width: 42rem;
    margin: 0 auto;
    padding: var(--space-4);
  }

  .section-view__header {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .section-view__header h1 {
    margin: 0;
    font-size: var(--font-size-xl);
  }
  .section-view__actions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .back-link {
    align-self: flex-start;
    color: var(--color-text-muted);
    text-decoration: none;
    font-size: var(--font-size-sm);
  }
  .back-link:hover {
    color: var(--color-text);
    text-decoration: underline;
  }

  .action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--tap-target-min);
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface-raised);
    color: var(--color-text);
    text-decoration: none;
    font-weight: 600;
  }
  .action:hover {
    background: var(--color-surface);
  }
  .action--primary {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: var(--color-primary-text);
  }
  .action--primary:hover {
    background: var(--color-primary-hover);
    border-color: var(--color-primary-hover);
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

  .cards {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .card-row {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface-raised);
  }
  .card-row__link {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-height: var(--tap-target-min);
    padding: var(--space-3) var(--space-4);
    color: var(--color-text);
    text-decoration: none;
    border-radius: var(--radius-md);
  }
  .card-row__link:hover {
    background: var(--color-surface);
  }
  .card-row__front {
    font-weight: 500;
  }
  .card-row__tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
  .card-row__tag {
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
  }
</style>
