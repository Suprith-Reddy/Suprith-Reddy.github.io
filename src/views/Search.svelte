<script module lang="ts">
  /**
   * Search.svelte — search / filter view (T1.5).
   *
   * Acceptance (§5 T1.5):
   *   - Query box → `store.searchCards` (debounced).
   *   - Results link to `#/edit/:id` (plain hash <a>, §3.5 — never import router.ts).
   *   - Keyboard-navigable result list (↑/↓ move focus, Enter follows the link).
   *   - May render `TagFilterBar` (§3.9 frozen props) to filter by tag (`cardsByTag`).
   *
   * Store access: this VIEW reads the FROZEN §3.2 `Store` directly via the public
   * `openStore()` (search/tags are NOT part of the §3.6 reactive store surface, and
   * the internal `stores/_store.svelte.ts` accessor is not a view-facing API). The
   * §7 prohibitions are only on `types.ts`, `router.ts`, and `App.svelte` — using
   * the frozen Store interface is allowed (mirrors how §3.8 backup helpers take a
   * `Store`). Result combination logic is kept pure + unit-tested below.
   *
   * The pure helper is exported from this `<script module>` block so it can be
   * unit-tested without mounting the component (no @testing-library available).
   */
  import type { Card, ID } from '../lib/types';

  /**
   * Intersect the substring-search results with the active tag filter.
   *
   * `selectedTags` semantics: a card must carry ALL selected tags (AND filter).
   * When no tags are selected, the search results pass through unchanged. The
   * result preserves the order of `searchResults` and de-dupes by card id (the
   * store returns unordered, unique cards already, but we stay defensive).
   */
  export function combineResults(
    searchResults: readonly Card[],
    selectedTags: readonly string[]
  ): Card[] {
    const seen = new Set<ID>();
    const out: Card[] = [];
    for (const card of searchResults) {
      if (seen.has(card.id)) continue;
      if (!selectedTags.every((t) => card.tags.includes(t))) continue;
      seen.add(card.id);
      out.push(card);
    }
    return out;
  }

  /** Short, single-line preview of a card's front for the result row. */
  export function previewOf(card: Card, max = 80): string {
    const text = card.front.replace(/\s+/g, ' ').trim();
    if (text.length <= max) return text || '(empty card)';
    return `${text.slice(0, max - 1).trimEnd()}…`;
  }
</script>

<script lang="ts">
  import { openStore, StoreUnavailableError } from '../lib/db/index';
  import { announce } from '../lib/a11y/liveRegion';
  import TagFilterBar from '../components/TagFilterBar.svelte';

  const DEBOUNCE_MS = 250;

  let query = $state('');
  let allTags = $state<string[]>([]);
  let selectedTags = $state<string[]>([]);
  let results = $state<Card[]>([]);
  let loading = $state(false);
  let unavailable = $state(false);

  // Index of the currently roving-focus result row (for ↑/↓ keyboard nav).
  let activeIndex = $state(0);
  let resultLinks: HTMLAnchorElement[] = [];

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  // Load the tag universe once on mount so TagFilterBar has chips to show.
  $effect(() => {
    let cancelled = false;
    (async () => {
      try {
        const store = await openStore();
        const tags = await store.allTags();
        if (!cancelled) allTags = tags;
      } catch (err) {
        if (err instanceof StoreUnavailableError) {
          if (!cancelled) unavailable = true;
        } else {
          throw err;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  /** Run the search + tag filter against the Store and update `results`. */
  async function runSearch(): Promise<void> {
    if (unavailable) return;
    loading = true;
    try {
      const store = await openStore();
      const found = await store.searchCards(query);
      results = combineResults(found, selectedTags);
      activeIndex = 0;
      announce(
        results.length === 1
          ? '1 result'
          : `${results.length} results`
      );
    } catch (err) {
      if (err instanceof StoreUnavailableError) {
        unavailable = true;
      } else {
        throw err;
      }
    } finally {
      loading = false;
    }
  }

  /** Debounced entry point invoked from the query input + tag toggles. */
  function scheduleSearch(): void {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void runSearch();
    }, DEBOUNCE_MS);
  }

  function onQueryInput(e: Event): void {
    query = (e.currentTarget as HTMLInputElement).value;
    scheduleSearch();
  }

  function onToggleTag(tag: string): void {
    selectedTags = selectedTags.includes(tag)
      ? selectedTags.filter((t) => t !== tag)
      : [...selectedTags, tag];
    // Tag changes re-filter immediately (no need to wait the debounce window).
    void runSearch();
  }

  /** Roving keyboard navigation across the result links. */
  function onResultKeydown(e: KeyboardEvent, index: number): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusResult(Math.min(index + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusResult(Math.max(index - 1, 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusResult(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusResult(results.length - 1);
    }
  }

  function focusResult(index: number): void {
    activeIndex = index;
    resultLinks[index]?.focus();
  }

  const hasActiveFilter = $derived(query.trim() !== '' || selectedTags.length > 0);
</script>

<section class="search" aria-labelledby="search-heading">
  <h1 id="search-heading">Search</h1>

  {#if unavailable}
    <p class="unavailable" role="alert">
      Storage is unavailable on this device (for example, private browsing).
      Search needs access to your saved cards.
    </p>
  {:else}
    <div class="search-controls">
      <label class="query-label" for="search-query">Search cards</label>
      <input
        id="search-query"
        class="query"
        type="search"
        autocomplete="off"
        placeholder="Search front, back, or tags…"
        value={query}
        oninput={onQueryInput}
        aria-describedby="search-status"
      />
    </div>

    {#if allTags.length > 0}
      <TagFilterBar tags={allTags} selected={selectedTags} onToggle={onToggleTag} />
    {/if}

    <p id="search-status" class="status" aria-live="polite">
      {#if loading}
        Searching…
      {:else if hasActiveFilter}
        {results.length}
        {results.length === 1 ? 'result' : 'results'}
      {:else}
        Type to search your cards.
      {/if}
    </p>

    {#if results.length > 0}
      <ul class="results" aria-label="Search results">
        {#each results as card, i (card.id)}
          <li>
            <a
              bind:this={resultLinks[i]}
              class="result-link"
              href="#/edit/{card.id}"
              tabindex={i === activeIndex ? 0 : -1}
              onkeydown={(e) => onResultKeydown(e, i)}
              onfocus={() => (activeIndex = i)}
            >
              <span class="result-front">{previewOf(card)}</span>
              {#if card.tags.length > 0}
                <span class="result-tags">
                  {#each card.tags as tag (tag)}
                    <span class="result-tag">#{tag}</span>
                  {/each}
                </span>
              {/if}
            </a>
          </li>
        {/each}
      </ul>
    {:else if hasActiveFilter && !loading}
      <p class="empty">No cards match your search.</p>
    {/if}
  {/if}
</section>

<style>
  .search {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .search-controls {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .query-label {
    font-weight: 600;
  }
  .query {
    width: 100%;
    min-height: 44px;
    padding: 0.5rem 0.75rem;
    font-size: 1rem;
    border: 1px solid var(--color-border, #888);
    border-radius: var(--radius-md, 6px);
    background: var(--color-surface, #fff);
    color: var(--color-text, #111);
  }
  .status {
    margin: 0;
    color: var(--color-text-muted, #666);
  }
  .unavailable {
    color: var(--color-danger, #b00020);
  }
  .results {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .result-link {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-height: 44px;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-border, #888);
    border-radius: var(--radius-md, 6px);
    text-decoration: none;
    color: var(--color-text, #111);
    background: var(--color-surface, #fff);
  }
  .result-link:hover {
    background: var(--color-surface-hover, #f2f2f2);
  }
  .result-front {
    font-weight: 500;
  }
  .result-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .result-tag {
    font-size: 0.8rem;
    color: var(--color-text-muted, #666);
  }
  .empty {
    color: var(--color-text-muted, #666);
  }
</style>
