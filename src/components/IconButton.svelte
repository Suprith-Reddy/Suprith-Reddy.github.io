<script lang="ts">
  /**
   * IconButton — square icon-only button (T0.6).
   *
   * MUST be given an accessible name: pass `label` (becomes aria-label). The icon
   * itself is the `children` snippet (e.g. an inline SVG or glyph) and is marked
   * aria-hidden so the label is the sole accessible name (§3.5: not color-alone,
   * always a text name for SR). Meets the ≥44×44 tap target.
   */
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  type Variant = 'plain' | 'danger';

  interface Props extends HTMLButtonAttributes {
    /** Accessible name (required) — rendered as aria-label. */
    label: string;
    variant?: Variant;
    children: Snippet;
  }

  let {
    label,
    variant = 'plain',
    type = 'button',
    children,
    ...rest
  }: Props = $props();
</script>

<button
  class="icon-btn {variant}"
  {type}
  aria-label={label}
  title={label}
  {...rest}
>
  <span class="icon" aria-hidden="true">{@render children()}</span>
</button>

<style>
  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--tap-target-min);
    min-height: var(--tap-target-min);
    padding: var(--space-2);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    background-color: transparent;
    color: var(--color-text);
    cursor: pointer;
    transition:
      background-color var(--transition-fast),
      color var(--transition-fast);
  }

  .icon-btn:hover:not(:disabled) {
    background-color: var(--color-surface);
  }

  .icon-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .danger {
    color: var(--color-danger);
  }
  .danger:hover:not(:disabled) {
    background-color: var(--color-surface);
    color: var(--color-danger-hover);
  }

  .icon {
    display: inline-flex;
    width: 1.25rem;
    height: 1.25rem;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }
</style>
