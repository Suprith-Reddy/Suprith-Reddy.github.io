<script lang="ts">
  /**
   * Button — base text button (T0.6).
   *
   * Variants: 'primary' | 'secondary' | 'danger' | 'ghost'.
   * Forwards arbitrary attributes (type, aria-*, disabled, etc.) via `...rest`.
   * Meets the ≥44×44 tap-target minimum (§3.5) and uses the global focus ring.
   *
   * Svelte 5 runes API: props via $props(), children via the `children` snippet.
   */
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
  type Size = 'md' | 'sm';

  interface Props extends HTMLButtonAttributes {
    variant?: Variant;
    size?: Size;
    children: Snippet;
  }

  let {
    variant = 'secondary',
    size = 'md',
    type = 'button',
    children,
    ...rest
  }: Props = $props();
</script>

<button class="btn {variant} {size}" {type} {...rest}>
  {@render children()}
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-height: var(--tap-target-min);
    padding: var(--space-2) var(--space-4);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    font-size: var(--font-size-md);
    font-weight: 600;
    line-height: 1.2;
    cursor: pointer;
    transition:
      background-color var(--transition-fast),
      border-color var(--transition-fast),
      color var(--transition-fast);
  }

  .btn.sm {
    min-height: 36px;
    padding: var(--space-1) var(--space-3);
    font-size: var(--font-size-sm);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .primary {
    background-color: var(--color-primary);
    color: var(--color-primary-text);
    border-color: var(--color-primary);
  }
  .primary:hover:not(:disabled) {
    background-color: var(--color-primary-hover);
    border-color: var(--color-primary-hover);
  }

  .secondary {
    background-color: var(--color-surface-raised);
    color: var(--color-text);
    border-color: var(--color-border);
  }
  .secondary:hover:not(:disabled) {
    background-color: var(--color-surface);
  }

  .danger {
    background-color: var(--color-danger);
    color: var(--color-danger-text);
    border-color: var(--color-danger);
  }
  .danger:hover:not(:disabled) {
    background-color: var(--color-danger-hover);
    border-color: var(--color-danger-hover);
  }

  .ghost {
    background-color: transparent;
    color: var(--color-text);
    border-color: transparent;
  }
  .ghost:hover:not(:disabled) {
    background-color: var(--color-surface);
  }
</style>
