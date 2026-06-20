<script lang="ts">
  /**
   * TagFilterBar — presentational tag filter (T1.6).
   *
   * Frozen prop contract (§3.9):
   *   { tags: string[]; selected: string[]; onToggle: (tag: string) => void }
   *
   * - Renders one chip per tag (a real <button>) with a pressed state for tags
   *   in `selected`, communicated via `aria-pressed` (toggle-button semantics).
   * - Pure + presentational: NO store access, NO router import, no internal
   *   selection state — the parent owns `selected` and reacts to `onToggle`.
   * - Self-contained: it does NOT import TagChip (owned by T1.2) so it compiles
   *   and renders independently. The chip styling here is the "TagChip-style"
   *   the contract calls for.
   * - Keyboard-operable: each chip is a native <button>, so Enter/Space activate
   *   it and it participates in the tab order and the global :focus-visible ring.
   * - State is never conveyed by color alone (§3.5): pressed chips also carry a
   *   leading check glyph and an "(active)" suffix in their accessible name.
   *
   * Svelte 5 runes API: props via $props().
   */

  interface Props {
    /** All selectable tags (already normalized + sorted by the caller). */
    tags: string[];
    /** Currently-selected tags (subset of `tags`). */
    selected: string[];
    /** Called with the toggled tag when a chip is activated. */
    onToggle: (tag: string) => void;
    /**
     * Optional accessible label for the group wrapper. Defaults to a generic
     * "Filter by tag". Lets a host distinguish multiple bars if ever needed.
     */
    label?: string;
  }

  let { tags, selected, onToggle, label = 'Filter by tag' }: Props = $props();

  // Derive a fast membership set so isSelected is O(1) per chip.
  const selectedSet = $derived(new Set(selected));

  function isSelected(tag: string): boolean {
    return selectedSet.has(tag);
  }
</script>

{#if tags.length > 0}
  <div class="tag-filter-bar" role="group" aria-label={label}>
    {#each tags as tag (tag)}
      {@const pressed = isSelected(tag)}
      <button
        type="button"
        class="chip"
        class:pressed
        aria-pressed={pressed}
        aria-label={pressed ? `${tag} (active)` : tag}
        onclick={() => onToggle(tag)}
      >
        <span class="check" aria-hidden="true">{pressed ? '✓' : ''}</span>
        <span class="chip-label">{tag}</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  .tag-filter-bar {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    /* ≥ 44px tap target height (§3.5); allow chips to be compact horizontally. */
    min-height: var(--tap-target-min);
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background-color: var(--color-surface-raised);
    color: var(--color-text);
    font-size: var(--font-size-sm);
    font-weight: 500;
    line-height: 1.2;
    cursor: pointer;
    transition:
      background-color var(--transition-fast),
      border-color var(--transition-fast),
      color var(--transition-fast);
  }

  .chip:hover {
    background-color: var(--color-surface);
  }

  /* Pressed/selected: distinct fill + border (not color-alone — also a check
     glyph and "(active)" in the accessible name above). */
  .chip.pressed {
    background-color: var(--color-primary);
    border-color: var(--color-primary);
    color: var(--color-primary-text);
    font-weight: 600;
  }

  .chip.pressed:hover {
    background-color: var(--color-primary-hover);
    border-color: var(--color-primary-hover);
  }

  .check {
    display: inline-flex;
    width: 1em;
    justify-content: center;
    line-height: 1;
  }

  .chip-label {
    /* The '#' is a tag affordance; tags arrive normalized (no leading '#'). */
    white-space: nowrap;
  }
  .chip-label::before {
    content: '#';
    opacity: 0.6;
  }
</style>
