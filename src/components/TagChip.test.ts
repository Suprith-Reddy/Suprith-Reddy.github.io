import { describe, it, expect, afterEach, vi } from 'vitest';
// NOTE: `mount`/`unmount`/`flushSync` are imported from Svelte's *client* source
// directly. Vitest transforms test files in SSR mode, so a bare `from 'svelte'`
// resolves to the server build whose `mount` throws `lifecycle_function_unavailable`.
// We must NOT edit vite.config.ts (T0.1-owned), so importing the client entry by
// path sidesteps the condition-resolution mismatch without any config change.
// (Mirrors the working approach in TagFilterBar.test.ts.)
// @ts-expect-error — deep client-source import has no bundled .d.ts; typed below.
import { mount as _mount, unmount as _unmount } from '../../node_modules/svelte/src/internal/client/render.js';
// @ts-expect-error — deep client-source import has no bundled .d.ts; typed below.
import { flushSync as _flushSync } from '../../node_modules/svelte/src/internal/client/reactivity/batch.js';
import type { mount as MountType, unmount as UnmountType, flushSync as FlushSyncType } from 'svelte';
import TagChip from './TagChip.svelte';

// Re-bind the runtime client imports to the public Svelte type signatures.
const mount = _mount as typeof MountType;
const unmount = _unmount as typeof UnmountType;
const flushSync = _flushSync as typeof FlushSyncType;

/**
 * T1.2 unit tests for the presentational TagChip.
 *
 * No @testing-library is installed, so we mount with Svelte 5's `mount`/`unmount`
 * directly under happy-dom (the configured Vitest env) and assert on the DOM.
 *
 * Covers the three modes:
 *   - toggle (onToggle): whole chip is a button with aria-pressed.
 *   - removable (onRemove): static chip with a "Remove tag X" button.
 *   - inert (neither handler): plain label.
 */

let host: HTMLElement | null = null;
let app: Record<string, unknown> | null = null;

function render(props: {
  tag: string;
  selected?: boolean;
  onToggle?: (t: string) => void;
  onRemove?: (t: string) => void;
}): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  app = mount(TagChip, { target: host, props });
  flushSync();
  return host;
}

afterEach(() => {
  if (app) unmount(app);
  app = null;
  if (host) host.remove();
  host = null;
});

describe('TagChip', () => {
  it('renders the tag label and a decorative hash', () => {
    render({ tag: 'sql' });
    expect(host!.textContent).toContain('sql');
    const hash = host!.querySelector('.hash');
    expect(hash?.getAttribute('aria-hidden')).toBe('true');
  });

  describe('toggle mode', () => {
    it('renders the whole chip as a button with aria-pressed', () => {
      render({ tag: 'sql', selected: false, onToggle: () => {} });
      const btn = host!.querySelector<HTMLButtonElement>('button.chip-toggle');
      expect(btn).not.toBeNull();
      expect(btn!.getAttribute('aria-pressed')).toBe('false');
    });

    it('reflects selected via aria-pressed=true', () => {
      render({ tag: 'sql', selected: true, onToggle: () => {} });
      const btn = host!.querySelector<HTMLButtonElement>('button.chip-toggle');
      expect(btn!.getAttribute('aria-pressed')).toBe('true');
      expect(btn!.classList.contains('selected')).toBe(true);
    });

    it('calls onToggle with the tag on click', () => {
      const onToggle = vi.fn();
      render({ tag: 'sql', onToggle });
      host!.querySelector<HTMLButtonElement>('button.chip-toggle')!.click();
      expect(onToggle).toHaveBeenCalledWith('sql');
    });
  });

  describe('removable mode', () => {
    it('renders a remove button with an accessible name', () => {
      render({ tag: 'sql', onRemove: () => {} });
      // The chip itself is NOT a button in removable mode.
      expect(host!.querySelector('button.chip-toggle')).toBeNull();
      const remove = host!.querySelector<HTMLButtonElement>('button.chip-remove');
      expect(remove).not.toBeNull();
      expect(remove!.getAttribute('aria-label')).toBe('Remove tag sql');
    });

    it('calls onRemove with the tag on click', () => {
      const onRemove = vi.fn();
      render({ tag: 'sql', onRemove });
      host!.querySelector<HTMLButtonElement>('button.chip-remove')!.click();
      expect(onRemove).toHaveBeenCalledWith('sql');
    });
  });

  describe('inert mode', () => {
    it('renders no buttons when no handler is given', () => {
      render({ tag: 'sql' });
      expect(host!.querySelector('button')).toBeNull();
    });
  });
});
