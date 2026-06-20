/**
 * Focus management helpers for accessible dialogs (§3.5).
 *
 * `createFocusTrap(container)` returns a controller that:
 *  - remembers the element focused before activation,
 *  - moves focus to the first focusable element inside `container` (or the
 *    container itself if none),
 *  - keeps Tab / Shift+Tab cycling within the container,
 *  - restores focus to the previously-focused element on release.
 *
 * Used by `Dialog.svelte`. Esc handling lives in the dialog (it must also close),
 * not here, so the trap stays focus-only and reusable.
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function isVisible(el: HTMLElement): boolean {
  // offsetParent is null for display:none; also guard hidden attr / visibility.
  if (el.hidden) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  return el.offsetParent !== null || el.getClientRects().length > 0;
}

export function getFocusable(container: HTMLElement): HTMLElement[] {
  const nodes = Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  );
  return nodes.filter(isVisible);
}

export interface FocusTrap {
  /** Activate: store previous focus, move focus inside, start trapping Tab. */
  activate(): void;
  /** Release: stop trapping and restore focus to the previously-focused element. */
  release(): void;
}

export function createFocusTrap(container: HTMLElement): FocusTrap {
  let previouslyFocused: HTMLElement | null = null;
  let active = false;

  function onKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Tab') return;
    const focusable = getFocusable(container);
    if (focusable.length === 0) {
      // Nothing focusable inside; keep focus on the container.
      e.preventDefault();
      container.focus();
      return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const activeEl = document.activeElement as HTMLElement | null;

    if (e.shiftKey) {
      if (activeEl === first || !container.contains(activeEl)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (activeEl === last || !container.contains(activeEl)) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  return {
    activate(): void {
      if (active) return;
      active = true;
      previouslyFocused =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      container.addEventListener('keydown', onKeydown);
      const focusable = getFocusable(container);
      const target = focusable[0] ?? container;
      // Container needs a tabindex to be focusable as a fallback; Dialog sets it.
      target.focus();
    },
    release(): void {
      if (!active) return;
      active = false;
      container.removeEventListener('keydown', onKeydown);
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
      previouslyFocused = null;
    }
  };
}
