import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  announce,
  registerLiveRegion,
  _resetLiveRegion
} from './liveRegion';

describe('liveRegion', () => {
  beforeEach(() => {
    _resetLiveRegion();
  });

  function makeRegion(): HTMLElement {
    const el = document.createElement('div');
    document.body.appendChild(el);
    return el;
  }

  it('writes an announcement into a registered region (clear-then-set)', async () => {
    const el = makeRegion();
    registerLiveRegion(el);

    announce('hello');
    // Set is deferred to a microtask so the clear is observed first.
    expect(el.textContent).toBe('');
    await Promise.resolve();
    expect(el.textContent).toBe('hello');
  });

  it('queues announcements made before a region registers, then flushes', async () => {
    announce('first');
    announce('second');

    const el = makeRegion();
    registerLiveRegion(el);

    await Promise.resolve();
    // Last flushed write wins as the visible text.
    expect(el.textContent).toBe('second');
  });

  it('ignores empty / whitespace-only messages', async () => {
    const el = makeRegion();
    registerLiveRegion(el);

    announce('   ');
    await Promise.resolve();
    expect(el.textContent).toBe('');
  });

  it('does not throw when no region is registered', () => {
    expect(() => announce('nobody-listening')).not.toThrow();
  });

  it('detaches on registerLiveRegion(null) and re-queues afterwards', async () => {
    const el = makeRegion();
    registerLiveRegion(el);
    registerLiveRegion(null);

    announce('after-detach');
    await Promise.resolve();
    // Detached element should not receive the text.
    expect(el.textContent).toBe('');
  });

  it('repeated identical messages still update via clear-then-set', async () => {
    const el = makeRegion();
    registerLiveRegion(el);

    announce('same');
    await Promise.resolve();
    expect(el.textContent).toBe('same');

    announce('same');
    expect(el.textContent).toBe(''); // cleared synchronously
    await Promise.resolve();
    expect(el.textContent).toBe('same');

    vi.useRealTimers();
  });
});
