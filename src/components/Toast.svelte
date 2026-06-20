<script module lang="ts">
  /**
   * Toast — the shared toast host (T0.6).
   *
   * This is the single host for BOTH:
   *   - undo messages (T1.1/T1.2 delete-with-undo), and
   *   - the "Update available — reload" SW prompt (delta-6, wired in main.ts/T0.2).
   *
   * The module-level `showToast(...)` API lets any code enqueue a toast without a
   * component reference. Mount `<Toast />` ONCE near the app root (T2.1).
   *
   * a11y: the host is aria-live. Undo/reload actions are real <button>s. A toast
   * with an action uses role="alert"/assertive so it is announced promptly;
   * plain info toasts are polite.
   *
   * Auto-dismiss window defaults to 5000ms; pass `durationMs: 0` (or null) to make
   * a toast sticky (used for the persistent "update available" prompt until acted on).
   */

  export interface ToastAction {
    label: string;
    onAction: () => void;
  }

  export interface ToastOptions {
    /** Auto-dismiss after this many ms. Default 5000. 0 / null = sticky. */
    durationMs?: number | null;
    /** Optional action button (e.g. "Undo", "Reload"). */
    action?: ToastAction;
    /** 'polite' (default) or 'assertive' for urgent prompts. */
    urgency?: 'polite' | 'assertive';
  }

  export interface ToastItem {
    id: number;
    message: string;
    durationMs: number | null;
    action?: ToastAction;
    urgency: 'polite' | 'assertive';
  }

  export const DEFAULT_TOAST_MS = 5000;

  let nextId = 1;
  // Reactive queue shared with the mounted host instance.
  const items = $state<ToastItem[]>([]);

  /** Enqueue a toast. Returns its id so callers can dismiss it programmatically. */
  export function showToast(message: string, opts: ToastOptions = {}): number {
    const id = nextId++;
    const durationMs =
      opts.durationMs === undefined ? DEFAULT_TOAST_MS : opts.durationMs;
    const item: ToastItem = {
      id,
      message,
      durationMs: durationMs && durationMs > 0 ? durationMs : null,
      ...(opts.action ? { action: opts.action } : {}),
      urgency: opts.urgency ?? 'polite'
    };
    items.push(item);
    return id;
  }

  /** Dismiss a toast by id (no-op if already gone). */
  export function dismissToast(id: number): void {
    const i = items.findIndex((t) => t.id === id);
    if (i !== -1) items.splice(i, 1);
  }

  /** Internal accessor for the host instance. */
  export function _toastItems(): ToastItem[] {
    return items;
  }
</script>

<script lang="ts">
  /**
   * Host instance. Renders the reactive `items` queue and manages auto-dismiss
   * timers. Each toast container is aria-live so the message is announced.
   */
  let timers = new Map<number, ReturnType<typeof setTimeout>>();

  function ensureTimer(item: ToastItem): void {
    if (item.durationMs == null) return;
    if (timers.has(item.id)) return;
    const t = setTimeout(() => {
      timers.delete(item.id);
      dismissToast(item.id);
    }, item.durationMs);
    timers.set(item.id, t);
  }

  function clearTimer(id: number): void {
    const t = timers.get(id);
    if (t !== undefined) {
      clearTimeout(t);
      timers.delete(id);
    }
  }

  function handleAction(item: ToastItem): void {
    clearTimer(item.id);
    item.action?.onAction();
    dismissToast(item.id);
  }

  // Arm timers for any toast that doesn't have one yet.
  $effect(() => {
    for (const item of items) ensureTimer(item);
  });

  $effect(() => {
    // Cleanup all timers on host unmount.
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  });
</script>

<div class="toast-host" aria-live="polite">
  {#each items as item (item.id)}
    <div
      class="toast"
      role={item.urgency === 'assertive' ? 'alert' : 'status'}
      aria-live={item.urgency}
    >
      <span class="toast-message">{item.message}</span>
      {#if item.action}
        <button
          type="button"
          class="toast-action"
          onclick={() => handleAction(item)}
        >
          {item.action.label}
        </button>
      {/if}
      <button
        type="button"
        class="toast-dismiss"
        aria-label="Dismiss notification"
        title="Dismiss"
        onclick={() => {
          clearTimer(item.id);
          dismissToast(item.id);
        }}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  {/each}
</div>

<style>
  .toast-host {
    position: fixed;
    left: 50%;
    bottom: var(--space-4);
    transform: translateX(-50%);
    z-index: var(--z-toast);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: min(100%, 28rem);
    padding: 0 var(--space-2);
    pointer-events: none;
  }

  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: var(--color-surface-raised);
    color: var(--color-text);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
  }

  .toast-message {
    flex: 1 1 auto;
  }

  .toast-action {
    flex: 0 0 auto;
    min-height: var(--tap-target-min);
    padding: var(--space-1) var(--space-3);
    background: transparent;
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-sm);
    color: var(--color-primary);
    font-weight: 600;
    cursor: pointer;
  }
  .toast-action:hover {
    background: var(--color-surface);
  }

  .toast-dismiss {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--tap-target-min);
    min-height: var(--tap-target-min);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    font-size: 1.25rem;
    line-height: 1;
    cursor: pointer;
  }
  .toast-dismiss:hover {
    color: var(--color-text);
    background: var(--color-surface);
  }
</style>
