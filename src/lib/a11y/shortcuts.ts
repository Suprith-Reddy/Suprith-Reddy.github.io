/**
 * shortcuts.ts — global keyboard-shortcut handler (T1.9, §3.5).
 *
 * A small, framework-agnostic dispatcher that listens for keydown on a target
 * (default: `window`) and invokes caller-supplied action handlers. It is
 * deliberately decoupled from the review store (§3.6): the caller passes in the
 * actions it wants wired (e.g. `Review.svelte` passes `flip`, `again`, `good`,
 * `prev`, `next`; `App.svelte`-adjacent UI passes `help`). This keeps the module
 * pure and unit-testable under happy-dom, and lets each view bind only the
 * shortcuts that make sense in its context.
 *
 * Key map (frozen by the T1.9 task row, reconciled with delta-4):
 *   - Space         → flip (reveal the answer). NOTE: Enter is deliberately NOT a
 *                     global flip key — this handler listens on `window` and would
 *                     both fire flip AND fight the native Enter activation of a
 *                     focused <button>/<a>/submit control (and preventDefault would
 *                     break it). DESIGN §8 specifies Space=flip; Enter is left to
 *                     its native semantics.
 *   - ArrowLeft     → prev
 *   - ArrowRight    → next
 *   - "1"           → again   (Grade 'again')
 *   - "2"           → good    (Grade 'good')   (3/4 reserved for future SM-2)
 *   - "?"           → help    (open the shortcut-help dialog)
 *
 * Suppression: shortcuts are IGNORED when focus is inside a text-entry control
 * (input, textarea, select, or any contenteditable host) so typing a card's
 * Markdown never triggers a flip/grade. The "?" help shortcut is suppressed the
 * same way (you may legitimately type "?" into a textarea).
 *
 * Modifier keys (Ctrl/Meta/Alt) are never hijacked — browser/OS shortcuts win.
 */

/** The set of actions a host can wire. All optional; only bound keys fire. */
export interface ShortcutActions {
  /** Space / Enter — reveal the current answer. */
  flip?: () => void;
  /** ArrowLeft — go to the previous card. */
  prev?: () => void;
  /** ArrowRight — go to the next card. */
  next?: () => void;
  /** "1" — grade the current card 'again'. */
  again?: () => void;
  /** "2" — grade the current card 'good'. */
  good?: () => void;
  /** "?" — open the shortcut-help dialog. */
  help?: () => void;
}

export interface ShortcutOptions {
  /** Event target to listen on. Defaults to `window`. */
  target?: Window | HTMLElement;
}

/** Returns true if the event originated from a text-entry / editable control. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;

  // contenteditable host (true / "" / "plaintext-only"), but not "false".
  if (target.isContentEditable) return true;

  return false;
}

/**
 * Map a keydown event to the action name it should trigger, or `null` for none.
 * Pure — exported for direct unit testing of the key map without DOM listeners.
 */
export function resolveAction(e: KeyboardEvent): keyof ShortcutActions | null {
  // Never override browser/OS chords.
  if (e.ctrlKey || e.metaKey || e.altKey) return null;

  switch (e.key) {
    case ' ': // Space
    case 'Spacebar': // legacy key name
      return 'flip';
    case 'ArrowLeft':
      return 'prev';
    case 'ArrowRight':
      return 'next';
    case '1':
      return 'again';
    case '2':
      return 'good';
    case '?':
      return 'help';
    default:
      return null;
  }
}

/**
 * Attach the global shortcut handler. Returns a disposer that removes the
 * listener. Safe to call when no DOM is present (returns a no-op disposer).
 */
export function registerShortcuts(
  actions: ShortcutActions,
  options: ShortcutOptions = {}
): () => void {
  const target =
    options.target ?? (typeof window !== 'undefined' ? window : undefined);
  if (!target) return () => {};

  function onKeydown(e: KeyboardEvent): void {
    // Don't steal keystrokes from text entry / editable controls.
    if (isEditableTarget(e.target)) return;

    const name = resolveAction(e);
    if (!name) return;

    const handler = actions[name];
    if (!handler) return;

    // We're handling it: stop the page from scrolling on Space, etc.
    e.preventDefault();
    handler();
  }

  target.addEventListener('keydown', onKeydown as EventListener);
  return () => target.removeEventListener('keydown', onKeydown as EventListener);
}
