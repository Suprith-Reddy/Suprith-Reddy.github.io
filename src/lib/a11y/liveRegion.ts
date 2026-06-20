/**
 * Global ARIA live-region singleton (§3.5).
 *
 * The visible `LiveRegion.svelte` host mounts once near the app root and calls
 * `registerLiveRegion(node)` with its `aria-live="polite"` element. Any module
 * (flip/reveal, toasts, status messages) can then call `announce(message)` to
 * push text into that region so assistive tech reads it.
 *
 * Design notes:
 *  - One polite region for the whole app keeps SR output predictable.
 *  - We clear-then-set on a microtask so repeated identical strings still fire a
 *    change event (some SRs ignore "same text" updates).
 *  - Before the host registers (or in non-DOM/test contexts), announcements are
 *    queued and flushed on registration, so nothing is silently dropped.
 */

let regionEl: HTMLElement | null = null;
let pending: string[] = [];

/** Called by `LiveRegion.svelte` on mount. Pass `null` on unmount to detach. */
export function registerLiveRegion(el: HTMLElement | null): void {
  regionEl = el;
  if (el && pending.length > 0) {
    const queued = pending;
    pending = [];
    for (const msg of queued) writeToRegion(msg);
  }
}

/** Announce `message` politely. Safe to call before the region mounts (queued). */
export function announce(message: string): void {
  const text = message?.trim() ?? '';
  if (text === '') return;
  if (!regionEl) {
    pending.push(text);
    return;
  }
  writeToRegion(text);
}

function writeToRegion(text: string): void {
  const el = regionEl;
  if (!el) return;
  // Clear first so an identical consecutive message still produces a DOM change.
  el.textContent = '';
  // Defer the set so the clear is observed as a distinct mutation.
  queueMicrotask(() => {
    if (regionEl === el) el.textContent = text;
  });
}

/** Test-only: reset module state between unit tests. */
export function _resetLiveRegion(): void {
  regionEl = null;
  pending = [];
}
