<script lang="ts">
  /**
   * TagChip — a single tag chip (T1.2).
   *
   * Two presentational modes, chosen by which handler is passed:
   *   - REMOVABLE (CardEditor): pass `onRemove`. Renders the tag label plus a real
   *     <button> "remove" affordance (×) with an accessible name ("Remove tag X").
   *     The chip body itself is static text.
   *   - TOGGLE (TagFilterBar, T1.6 §3.9): pass `onToggle`. The whole chip is a real
   *     <button> with `aria-pressed={selected}` so filters are keyboard-operable and
   *     announce their state. Pressed state is conveyed by text/border + aria-pressed,
   *     never color alone (§3.5).
   *
   * If neither handler is passed it renders as an inert label (static display).
   *
   * a11y (§3.5): interactive chips are real <button>s; ≥44×44 tap targets via the
   * shared min; visible focus ring inherited from global styles. The '#' prefix is
   * decorative (aria-hidden) so screen readers announce just the tag text.
   */

  interface Props {
    /** Normalized tag text (no leading '#', lowercase). */
    tag: string;
    /** Toggle mode: selected/pressed state. */
    selected?: boolean;
    /** Toggle mode handler — makes the whole chip a pressed-state button. */
    onToggle?: (tag: string) => void;
    /** Removable mode handler — adds a "remove" button to the chip. */
    onRemove?: (tag: string) => void;
  }

  let { tag, selected = false, onToggle, onRemove }: Props = $props();
</script>

{#if onToggle}
  <button
    type="button"
    class="chip chip-toggle"
    class:selected
    aria-pressed={selected}
    onclick={() => onToggle(tag)}
  >
    <span class="hash" aria-hidden="true">#</span><span class="label">{tag}</span>
  </button>
{:else}
  <span class="chip" class:has-remove={!!onRemove}>
    <span class="hash" aria-hidden="true">#</span><span class="label">{tag}</span>
    {#if onRemove}
      <button
        type="button"
        class="chip-remove"
        aria-label={`Remove tag ${tag}`}
        title={`Remove tag ${tag}`}
        onclick={() => onRemove(tag)}
      >
        <span aria-hidden="true">×</span>
      </button>
    {/if}
  </span>
{/if}

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-height: 32px;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: 999px;
    background: var(--color-surface);
    color: var(--color-text);
    font-size: var(--font-size-sm);
    line-height: 1.2;
    white-space: nowrap;
  }

  .chip.has-remove {
    padding-right: var(--space-1);
  }

  .hash {
    color: var(--color-text-muted);
  }

  /* Toggle (filter) chip is a real button. */
  .chip-toggle {
    cursor: pointer;
    min-height: var(--tap-target-min);
    font-weight: 600;
    transition:
      background-color var(--transition-fast),
      border-color var(--transition-fast),
      color var(--transition-fast);
  }
  .chip-toggle:hover {
    background: var(--color-surface-raised);
  }
  /* Pressed state: stronger border + filled background, paired with aria-pressed
     (not color alone). */
  .chip-toggle.selected {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: var(--color-primary-text);
  }
  .chip-toggle.selected .hash {
    color: var(--color-primary-text);
  }

  /* Remove (×) button inside a removable chip. */
  .chip-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    min-height: 28px;
    margin-left: var(--space-1);
    padding: 0;
    border: 1px solid transparent;
    border-radius: 999px;
    background: transparent;
    color: var(--color-text-muted);
    font-size: 1.1rem;
    line-height: 1;
    cursor: pointer;
  }
  .chip-remove:hover {
    background: var(--color-surface-raised);
    color: var(--color-text);
  }
</style>
