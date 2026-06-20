import { describe, it, expect, afterEach, vi } from 'vitest';
// NOTE: `mount`/`unmount`/`flushSync` are imported from Svelte's *client* source
// directly. Vitest transforms test files in SSR mode, so a bare `from 'svelte'`
// resolves to the server build whose `mount` throws `lifecycle_function_unavailable`.
// We must NOT edit vite.config.ts (T0.1-owned), so importing the client entry by
// path sidesteps the condition-resolution mismatch without any config change.
// @ts-expect-error — deep client-source import has no bundled .d.ts; typed below.
import { mount as _mount, unmount as _unmount } from '../../node_modules/svelte/src/internal/client/render.js';
// @ts-expect-error — deep client-source import has no bundled .d.ts; typed below.
import { flushSync as _flushSync } from '../../node_modules/svelte/src/internal/client/reactivity/batch.js';
import type { mount as MountType, unmount as UnmountType, flushSync as FlushSyncType } from 'svelte';
import TagFilterBar from './TagFilterBar.svelte';

// Re-bind the runtime client imports to the public Svelte type signatures.
const mount = _mount as typeof MountType;
const unmount = _unmount as typeof UnmountType;
const flushSync = _flushSync as typeof FlushSyncType;

/**
 * T1.6 unit tests for the presentational TagFilterBar.
 *
 * No @testing-library is installed, so we mount with Svelte 5's `mount`/`unmount`
 * directly under happy-dom (the configured Vitest env) and assert on the DOM.
 */

let host: HTMLElement | null = null;
let app: Record<string, unknown> | null = null;

function render(props: {
  tags: string[];
  selected: string[];
  onToggle: (t: string) => void;
  label?: string;
}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  app = mount(TagFilterBar, { target: host, props });
  flushSync();
  return host;
}

function chips(): HTMLButtonElement[] {
  return Array.from(host!.querySelectorAll<HTMLButtonElement>('button.chip'));
}

/** Indexed chip access that satisfies noUncheckedIndexedAccess. */
function chipAt(i: number): HTMLButtonElement {
  const c = chips()[i];
  if (!c) throw new Error(`no chip at index ${i}`);
  return c;
}

afterEach(() => {
  if (app) unmount(app);
  app = null;
  if (host) host.remove();
  host = null;
});

describe('TagFilterBar', () => {
  it('renders one button per tag', () => {
    render({ tags: ['algebra', 'biology', 'chem'], selected: [], onToggle: () => {} });
    const labels = chips().map((c) => c.querySelector('.chip-label')!.textContent);
    expect(labels).toEqual(['algebra', 'biology', 'chem']);
  });

  it('renders nothing when there are no tags', () => {
    render({ tags: [], selected: [], onToggle: () => {} });
    expect(host!.querySelector('.tag-filter-bar')).toBeNull();
    expect(chips()).toHaveLength(0);
  });

  it('reflects pressed state via aria-pressed for selected tags', () => {
    render({ tags: ['a', 'b', 'c'], selected: ['b'], onToggle: () => {} });
    const [a, b, c] = [chipAt(0), chipAt(1), chipAt(2)];
    expect(a.getAttribute('aria-pressed')).toBe('false');
    expect(b.getAttribute('aria-pressed')).toBe('true');
    expect(c.getAttribute('aria-pressed')).toBe('false');
    expect(b.classList.contains('pressed')).toBe(true);
  });

  it('marks pressed chips in the accessible name (not color-alone)', () => {
    render({ tags: ['a', 'b'], selected: ['a'], onToggle: () => {} });
    const [a, b] = [chipAt(0), chipAt(1)];
    expect(a.getAttribute('aria-label')).toBe('a (active)');
    expect(b.getAttribute('aria-label')).toBe('b');
    // Pressed chip also carries a visible check glyph.
    expect(a.querySelector('.check')!.textContent).toBe('✓');
    expect(b.querySelector('.check')!.textContent).toBe('');
  });

  it('calls onToggle with the exact tag on click', () => {
    const onToggle = vi.fn();
    render({ tags: ['x', 'y'], selected: [], onToggle });
    chipAt(1).click();
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('y');
  });

  it('is presentational only — it does not change `selected` itself', () => {
    const onToggle = vi.fn();
    render({ tags: ['x'], selected: [], onToggle });
    const chip = chipAt(0);
    chip.click();
    flushSync();
    // Parent owns selection; without a prop update the chip stays unpressed.
    expect(chip.getAttribute('aria-pressed')).toBe('false');
  });

  it('uses native buttons of type="button" (keyboard-operable, no form submit)', () => {
    render({ tags: ['a'], selected: [], onToggle: () => {} });
    const chip = chipAt(0);
    expect(chip.tagName).toBe('BUTTON');
    expect(chip.getAttribute('type')).toBe('button');
  });

  it('wraps chips in a labelled group', () => {
    render({ tags: ['a'], selected: [], onToggle: () => {}, label: 'Tags' });
    const group = host!.querySelector('.tag-filter-bar')!;
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBe('Tags');
  });

  it('defaults the group label when none is given', () => {
    render({ tags: ['a'], selected: [], onToggle: () => {} });
    expect(host!.querySelector('.tag-filter-bar')!.getAttribute('aria-label')).toBe(
      'Filter by tag'
    );
  });
});
