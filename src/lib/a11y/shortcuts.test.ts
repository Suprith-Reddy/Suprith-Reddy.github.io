import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerShortcuts,
  resolveAction,
  isEditableTarget,
  type ShortcutActions
} from './shortcuts';

function key(init: Partial<KeyboardEventInit> & { key: string }): KeyboardEvent {
  return new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
}

describe('resolveAction (key map)', () => {
  it('maps Space to flip (Enter is intentionally NOT a global flip key)', () => {
    expect(resolveAction(key({ key: ' ' }))).toBe('flip');
    expect(resolveAction(key({ key: 'Spacebar' }))).toBe('flip');
    // Enter is left to native button/link/form activation (would fight a focused
    // control + preventDefault would break it). DESIGN §8 specifies Space=flip.
    expect(resolveAction(key({ key: 'Enter' }))).toBeNull();
  });

  it('maps arrows to prev/next', () => {
    expect(resolveAction(key({ key: 'ArrowLeft' }))).toBe('prev');
    expect(resolveAction(key({ key: 'ArrowRight' }))).toBe('next');
  });

  it('maps 1 → again and 2 → good (delta-4 binary grades)', () => {
    expect(resolveAction(key({ key: '1' }))).toBe('again');
    expect(resolveAction(key({ key: '2' }))).toBe('good');
  });

  it('does not bind reserved 3 / 4 (future SM-2)', () => {
    expect(resolveAction(key({ key: '3' }))).toBeNull();
    expect(resolveAction(key({ key: '4' }))).toBeNull();
  });

  it('maps ? to help', () => {
    expect(resolveAction(key({ key: '?' }))).toBe('help');
  });

  it('returns null for unknown keys', () => {
    expect(resolveAction(key({ key: 'a' }))).toBeNull();
    expect(resolveAction(key({ key: 'Escape' }))).toBeNull();
  });

  it('never hijacks Ctrl/Meta/Alt chords', () => {
    expect(resolveAction(key({ key: '1', ctrlKey: true }))).toBeNull();
    expect(resolveAction(key({ key: 'ArrowLeft', metaKey: true }))).toBeNull();
    expect(resolveAction(key({ key: ' ', altKey: true }))).toBeNull();
  });
});

describe('isEditableTarget (suppression)', () => {
  it('detects input, textarea, select', () => {
    expect(isEditableTarget(document.createElement('input'))).toBe(true);
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true);
    expect(isEditableTarget(document.createElement('select'))).toBe(true);
  });

  it('detects contenteditable hosts', () => {
    const el = document.createElement('div');
    el.setAttribute('contenteditable', 'true');
    // happy-dom may not derive isContentEditable from the attribute; force it.
    Object.defineProperty(el, 'isContentEditable', { value: true });
    expect(isEditableTarget(el)).toBe(true);
  });

  it('returns false for buttons / divs / null', () => {
    expect(isEditableTarget(document.createElement('button'))).toBe(false);
    expect(isEditableTarget(document.createElement('div'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe('registerShortcuts (dispatch)', () => {
  let target: HTMLElement;
  let actions: Required<{ [K in keyof ShortcutActions]: ReturnType<typeof vi.fn<() => void>> }>;
  let dispose: () => void;

  beforeEach(() => {
    document.body.replaceChildren();
    target = document.createElement('div');
    document.body.appendChild(target);
    actions = {
      flip: vi.fn<() => void>(),
      prev: vi.fn<() => void>(),
      next: vi.fn<() => void>(),
      again: vi.fn<() => void>(),
      good: vi.fn<() => void>(),
      help: vi.fn<() => void>()
    };
    dispose = registerShortcuts(actions, { target });
  });

  function press(k: string, init: Partial<KeyboardEventInit> = {}): KeyboardEvent {
    const e = key({ key: k, ...init });
    target.dispatchEvent(e);
    return e;
  }

  it('invokes the wired handler for each key', () => {
    press(' ');
    expect(actions.flip).toHaveBeenCalledTimes(1);
    press('ArrowLeft');
    expect(actions.prev).toHaveBeenCalledTimes(1);
    press('ArrowRight');
    expect(actions.next).toHaveBeenCalledTimes(1);
    press('1');
    expect(actions.again).toHaveBeenCalledTimes(1);
    press('2');
    expect(actions.good).toHaveBeenCalledTimes(1);
    press('?');
    expect(actions.help).toHaveBeenCalledTimes(1);
  });

  it('prevents default for handled keys (no page scroll on Space)', () => {
    const e = press(' ');
    expect(e.defaultPrevented).toBe(true);
  });

  it('does not preventDefault for unhandled keys', () => {
    const e = press('z');
    expect(e.defaultPrevented).toBe(false);
  });

  it('is suppressed when focus is in a text field', () => {
    const input = document.createElement('input');
    target.appendChild(input);
    const e = key({ key: '1' });
    input.dispatchEvent(e);
    expect(actions.again).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  it('only fires bound actions; unbound names are no-ops', () => {
    dispose();
    dispose = registerShortcuts({ flip: actions.flip }, { target });
    press('1'); // again is unbound now
    expect(actions.again).not.toHaveBeenCalled();
    press(' ');
    expect(actions.flip).toHaveBeenCalledTimes(1);
  });

  it('disposer removes the listener', () => {
    dispose();
    press(' ');
    expect(actions.flip).not.toHaveBeenCalled();
  });

  it('returns a no-op disposer when no target is available', () => {
    const off = registerShortcuts(actions, { target: undefined });
    expect(() => off()).not.toThrow();
  });
});
