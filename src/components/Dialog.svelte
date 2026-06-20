<script lang="ts">
  /**
   * Dialog — accessible modal dialog (T0.6, §3.5).
   *
   * Behavior:
   *  - role="dialog" aria-modal="true", labelled by its title.
   *  - Focus trap (Tab/Shift+Tab cycle within) via lib/a11y/focus.ts.
   *  - Esc closes (calls onClose).
   *  - Clicking the backdrop closes (calls onClose).
   *  - Restores focus to the previously-focused element on close.
   *  - Renders nothing when `open` is false (focus restore handled on close edge).
   *
   * Two-way `open` is controlled by the parent via `bind:open` OR by `onClose`.
   */
  import type { Snippet } from 'svelte';
  import { createFocusTrap, type FocusTrap } from '../lib/a11y/focus';

  interface Props {
    open: boolean;
    /** Accessible dialog title (rendered as the heading + aria-labelledby target). */
    title: string;
    /** Called when the user requests close (Esc, backdrop, or close control). */
    onClose: () => void;
    children: Snippet;
    /** Optional footer snippet (e.g. action buttons). */
    footer?: Snippet;
  }

  let { open, title, onClose, children, footer }: Props = $props();

  let panel = $state<HTMLElement | null>(null);
  let trap: FocusTrap | null = null;
  let titleId = `dialog-title-${Math.random().toString(36).slice(2)}`;

  $effect(() => {
    if (open && panel) {
      trap = createFocusTrap(panel);
      trap.activate();
      return () => {
        trap?.release();
        trap = null;
      };
    }
  });

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  }

  function onBackdropClick(e: MouseEvent): void {
    // Only close when the click is on the backdrop itself, not the panel.
    if (e.target === e.currentTarget) onClose();
  }
</script>

{#if open}
  <!-- Backdrop. Click-to-close is a convenience; Esc + close button are the
       keyboard-accessible paths, so no a11y warning suppression is needed. -->
  <div
    class="backdrop"
    onclick={onBackdropClick}
    onkeydown={onKeydown}
    role="presentation"
  >
    <div
      class="panel"
      bind:this={panel}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabindex="-1"
    >
      <header class="dialog-header">
        <h2 id={titleId} class="dialog-title">{title}</h2>
      </header>
      <div class="dialog-body">
        {@render children()}
      </div>
      {#if footer}
        <footer class="dialog-footer">
          {@render footer()}
        </footer>
      {/if}
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-dialog);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
    background: var(--color-overlay);
  }

  .panel {
    width: 100%;
    max-width: 32rem;
    max-height: 90vh;
    overflow: auto;
    background: var(--color-surface-raised);
    color: var(--color-text);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
  }

  .dialog-header {
    padding: var(--space-4) var(--space-4) 0;
  }

  .dialog-title {
    font-size: var(--font-size-lg);
    font-weight: 700;
    margin: 0;
  }

  .dialog-body {
    padding: var(--space-4);
  }

  .dialog-footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    padding: 0 var(--space-4) var(--space-4);
  }
</style>
