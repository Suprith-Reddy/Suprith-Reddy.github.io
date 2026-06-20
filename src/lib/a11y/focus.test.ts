import { describe, it, expect, beforeEach } from 'vitest';
import { createFocusTrap, getFocusable } from './focus';

describe('focus trap', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.replaceChildren();
    container = document.createElement('div');
    container.tabIndex = -1;
    document.body.appendChild(container);
  });

  function addButton(label: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = label;
    container.appendChild(b);
    return b;
  }

  it('getFocusable skips disabled and hidden controls', () => {
    const a = addButton('a');
    const disabled = addButton('b');
    disabled.disabled = true;
    const hidden = addButton('c');
    hidden.hidden = true;

    const focusable = getFocusable(container);
    expect(focusable).toContain(a);
    expect(focusable).not.toContain(disabled);
    expect(focusable).not.toContain(hidden);
  });

  it('activate moves focus to the first focusable element', () => {
    const first = addButton('first');
    addButton('second');

    const trap = createFocusTrap(container);
    trap.activate();
    expect(document.activeElement).toBe(first);
    trap.release();
  });

  it('release restores focus to the previously-focused element', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    expect(document.activeElement).toBe(outside);

    addButton('inside');
    const trap = createFocusTrap(container);
    trap.activate();
    expect(document.activeElement).not.toBe(outside);

    trap.release();
    expect(document.activeElement).toBe(outside);
  });

  it('Shift+Tab from the first element wraps to the last', () => {
    const first = addButton('first');
    const last = addButton('last');

    const trap = createFocusTrap(container);
    trap.activate();
    expect(document.activeElement).toBe(first);

    const evt = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true
    });
    container.dispatchEvent(evt);
    expect(document.activeElement).toBe(last);
    trap.release();
  });

  it('Tab from the last element wraps to the first', () => {
    const first = addButton('first');
    const last = addButton('last');

    const trap = createFocusTrap(container);
    trap.activate();
    last.focus();

    const evt = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true
    });
    container.dispatchEvent(evt);
    expect(document.activeElement).toBe(first);
    trap.release();
  });

  it('falls back to the container when nothing is focusable', () => {
    const trap = createFocusTrap(container);
    trap.activate();
    expect(document.activeElement).toBe(container);
    trap.release();
  });

  it('activate is idempotent (double activate does not lose previous focus)', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();

    addButton('inside');
    const trap = createFocusTrap(container);
    trap.activate();
    trap.activate(); // no-op
    trap.release();
    expect(document.activeElement).toBe(outside);
  });
});
