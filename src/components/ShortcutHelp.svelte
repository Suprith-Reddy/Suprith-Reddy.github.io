<script lang="ts">
  /**
   * ShortcutHelp — accessible keyboard-shortcut reference dialog (T1.9, §3.5).
   *
   * Presentational: lists the global shortcuts wired by `lib/a11y/shortcuts.ts`.
   * Built on the shared accessible `Dialog` (focus trap, Esc-to-close, focus
   * restore). The host controls visibility via `open` + `onClose` — typically the
   * "?" shortcut sets `open = true`. Keeping the open/close state in the host (not
   * here) lets a single global "?" handler live wherever the app shell mounts it.
   */
  import Dialog from './Dialog.svelte';
  import Button from './Button.svelte';

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  // Single source of truth for the displayed map; mirrors resolveAction() in
  // lib/a11y/shortcuts.ts. Kept as data so it renders as a real definition list.
  const shortcuts: { keys: string[]; label: string }[] = [
    { keys: ['Space'], label: 'Flip the card (reveal the answer)' },
    { keys: ['1'], label: 'Grade: Again' },
    { keys: ['2'], label: 'Grade: Good' },
    { keys: ['←'], label: 'Previous card' },
    { keys: ['→'], label: 'Next card' },
    { keys: ['?'], label: 'Show this help' }
  ];
</script>

<Dialog {open} {onClose} title="Keyboard shortcuts">
  <dl class="shortcut-list">
    {#each shortcuts as { keys, label } (label)}
      <div class="row">
        <dt class="keys">
          {#each keys as key, i (key)}
            {#if i > 0}<span class="sep">or</span>{/if}
            <kbd>{key}</kbd>
          {/each}
        </dt>
        <dd class="label">{label}</dd>
      </div>
    {/each}
  </dl>
  <p class="hint">
    Shortcuts are paused while you are typing in a text field.
  </p>

  {#snippet footer()}
    <Button variant="primary" onclick={onClose}>Close</Button>
  {/snippet}
</Dialog>

<style>
  .shortcut-list {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .row {
    display: flex;
    align-items: baseline;
    gap: var(--space-4);
  }

  .keys {
    flex: 0 0 8rem;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
    margin: 0;
  }

  .label {
    margin: 0;
    color: var(--color-text);
  }

  .sep {
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
  }

  kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.75rem;
    padding: 2px var(--space-2);
    border: 1px solid var(--color-border);
    border-bottom-width: 2px;
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: var(--font-size-sm);
    line-height: 1.4;
  }

  .hint {
    margin: var(--space-4) 0 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
  }
</style>
