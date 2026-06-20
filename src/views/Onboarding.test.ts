/**
 * Onboarding.test.ts — coverage for the iOS install-hint detection helpers
 * exported from Onboarding.svelte's module block (T1.10).
 *
 * The helpers accept an injectable Navigator/Window so we can test detection
 * without a real device. We only show the "Add to Home Screen" hint on iOS Safari
 * that isn't already an installed standalone PWA.
 */
import { describe, expect, it } from 'vitest';
import {
  isIos,
  isSafari,
  isStandalone,
  shouldShowInstallHint
} from './Onboarding.svelte';

function nav(userAgent: string, extra: Partial<Navigator> = {}): Navigator {
  return { userAgent, maxTouchPoints: 0, ...extra } as unknown as Navigator;
}

function win(opts: { displayStandalone?: boolean; iosStandalone?: boolean }): Window {
  return {
    navigator: { standalone: opts.iosStandalone } as unknown as Navigator,
    matchMedia: (q: string) =>
      ({ matches: q.includes('standalone') ? !!opts.displayStandalone : false }) as MediaQueryList
  } as unknown as Window;
}

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1';
const DESKTOP_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const IPADOS_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

describe('isIos', () => {
  it('detects iPhone', () => {
    expect(isIos(nav(IPHONE_SAFARI))).toBe(true);
  });
  it('detects iPadOS masquerading as Mac with touch', () => {
    expect(isIos(nav(IPADOS_SAFARI, { maxTouchPoints: 5 }))).toBe(true);
  });
  it('rejects a real Mac without touch', () => {
    expect(isIos(nav(IPADOS_SAFARI, { maxTouchPoints: 0 }))).toBe(false);
  });
  it('rejects desktop Windows', () => {
    expect(isIos(nav(DESKTOP_CHROME))).toBe(false);
  });
});

describe('isSafari', () => {
  it('accepts iOS Safari', () => {
    expect(isSafari(nav(IPHONE_SAFARI))).toBe(true);
  });
  it('rejects Chrome on iOS (CriOS)', () => {
    expect(isSafari(nav(IPHONE_CHROME))).toBe(false);
  });
});

describe('isStandalone', () => {
  it('true via iOS navigator.standalone', () => {
    expect(isStandalone(win({ iosStandalone: true }))).toBe(true);
  });
  it('true via display-mode: standalone', () => {
    expect(isStandalone(win({ displayStandalone: true }))).toBe(true);
  });
  it('false in a normal browser tab', () => {
    expect(isStandalone(win({}))).toBe(false);
  });
});

describe('shouldShowInstallHint', () => {
  it('shows on iOS Safari, not installed', () => {
    expect(shouldShowInstallHint(nav(IPHONE_SAFARI), win({}))).toBe(true);
  });
  it('hides when already installed (standalone)', () => {
    expect(shouldShowInstallHint(nav(IPHONE_SAFARI), win({ iosStandalone: true }))).toBe(false);
  });
  it('hides on iOS Chrome', () => {
    expect(shouldShowInstallHint(nav(IPHONE_CHROME), win({}))).toBe(false);
  });
  it('hides on desktop', () => {
    expect(shouldShowInstallHint(nav(DESKTOP_CHROME), win({}))).toBe(false);
  });
});
