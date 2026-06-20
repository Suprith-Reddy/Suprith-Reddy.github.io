<script module lang="ts">
  /**
   * Onboarding.svelte — first-run experience (T1.10, F-18).
   *
   * Two jobs, both safe to run on every mount:
   *   1. SEED the sample deck once, the first time the app is opened
   *      (`settings.onboardedAt == null`). Idempotent via the typed flag in
   *      `maybeSeedSampleDeck` (§3.1 / §3.6) — re-mounting never re-seeds.
   *   2. Show an "Add to Home Screen" instructions card on iOS Safari (when not
   *      already running as an installed standalone PWA), since iOS has no
   *      `beforeinstallprompt`. The card is DISMISSIBLE; the dismissal is
   *      remembered in localStorage so it doesn't nag on every visit.
   *
   * Navigation is via plain `<a href="#/…">` hash links (§3.5) — this view never
   * imports `router.ts`. T2.1 decides where/whether to mount it (typically on the
   * DeckList route or as an always-present banner above the outlet).
   *
   * The iOS-detection + standalone helpers are exported so they can be unit-tested
   * without rendering the component.
   */

  // localStorage key for "user dismissed the iOS install hint". localStorage is
  // sanctioned for tiny UI prefs (the rest of state is IndexedDB) — and the
  // onboardedAt seed flag lives in IndexedDB via settings, not here.
  export const INSTALL_HINT_DISMISSED_KEY = 'flash.installHintDismissed';

  /** True on an iOS device (iPhone/iPad/iPod), incl. iPadOS reporting as Mac+touch. */
  export function isIos(nav: Navigator = navigator): boolean {
    const ua = nav.userAgent ?? '';
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    // iPadOS 13+ masquerades as desktop Safari; detect via Mac UA + touch points.
    const maxTouch = (nav as Navigator & { maxTouchPoints?: number }).maxTouchPoints ?? 0;
    return /Macintosh/.test(ua) && maxTouch > 1;
  }

  /** True for Safari (excludes Chrome/Firefox/Edge on iOS, which embed Safari's UA). */
  export function isSafari(nav: Navigator = navigator): boolean {
    const ua = nav.userAgent ?? '';
    // CriOS = Chrome iOS, FxiOS = Firefox iOS, EdgiOS = Edge iOS, OPiOS = Opera iOS.
    return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  }

  /** True when already running as an installed standalone PWA (don't nag). */
  export function isStandalone(win: Window = window): boolean {
    // iOS uses the non-standard navigator.standalone; others use display-mode.
    const iosStandalone = (win.navigator as Navigator & { standalone?: boolean }).standalone;
    if (iosStandalone === true) return true;
    return typeof win.matchMedia === 'function'
      ? win.matchMedia('(display-mode: standalone)').matches
      : false;
  }

  /**
   * Should we show the "Add to Home Screen" hint? Only on iOS Safari that isn't
   * already installed. (Android/desktop get the browser's own install UI.)
   */
  export function shouldShowInstallHint(
    nav: Navigator = navigator,
    win: Window = window
  ): boolean {
    return isIos(nav) && isSafari(nav) && !isStandalone(win);
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { maybeSeedSampleDeck } from '../lib/util/sampleDeck';

  // Whether to render the iOS install-instructions card. Decided on mount so SSR /
  // non-DOM environments (none here, but defensive) don't throw.
  let showInstallHint = $state(false);
  // Set true once the first-run seed has been attempted (so DeckList, which loads
  // after, has data). Surfaced for any parent that wants to react.
  let seeded = $state(false);

  function hintWasDismissed(): boolean {
    try {
      return localStorage.getItem(INSTALL_HINT_DISMISSED_KEY) === '1';
    } catch {
      // localStorage can throw in private mode / blocked-storage — fail open
      // (treat as not dismissed) but never crash onboarding.
      return false;
    }
  }

  function dismissInstallHint(): void {
    showInstallHint = false;
    try {
      localStorage.setItem(INSTALL_HINT_DISMISSED_KEY, '1');
    } catch {
      // Best-effort; if it throws the hint simply reappears next session.
    }
  }

  onMount(() => {
    // 1) Seed the sample deck on first run (idempotent via onboardedAt flag).
    void maybeSeedSampleDeck()
      .then(() => {
        seeded = true;
      })
      .catch(() => {
        // A seeding failure (e.g. storage unavailable) must not break the view;
        // the storage-unavailable state is surfaced elsewhere (§8). Onboarding
        // just declines to seed.
        seeded = false;
      });

    // 2) Decide whether to show the iOS install hint.
    if (typeof navigator !== 'undefined' && typeof window !== 'undefined') {
      showInstallHint = shouldShowInstallHint() && !hintWasDismissed();
    }
  });
</script>

{#if showInstallHint}
  <section class="install-hint" aria-labelledby="install-hint-title">
    <div class="install-hint-head">
      <h2 id="install-hint-title">Install Flash on your iPhone</h2>
      <button
        type="button"
        class="dismiss"
        aria-label="Dismiss install instructions"
        title="Dismiss"
        onclick={dismissInstallHint}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
    <p>Add Flash to your Home Screen so it works offline and keeps your cards safe:</p>
    <ol>
      <li>
        Tap the <strong>Share</strong> button
        <span aria-hidden="true">(the square with an up-arrow)</span> in Safari's toolbar.
      </li>
      <li>Choose <strong>Add to Home Screen</strong>.</li>
      <li>Tap <strong>Add</strong>, then open Flash from your Home Screen.</li>
    </ol>
    <p class="install-hint-note">
      Installed apps are exempt from Safari's storage cleanup — but still
      <a href="#/settings">export a backup</a> now and then.
    </p>
  </section>
{/if}

<style>
  .install-hint {
    margin: var(--space-3) 0;
    padding: var(--space-4);
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-sm);
  }

  .install-hint-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .install-hint h2 {
    margin: 0 0 var(--space-2);
    font-size: var(--font-size-lg);
  }

  .install-hint ol {
    margin: var(--space-2) 0;
    padding-left: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .install-hint-note {
    margin: var(--space-2) 0 0;
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
  }

  .install-hint a {
    color: var(--color-primary);
  }

  .dismiss {
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
  .dismiss:hover {
    color: var(--color-text);
    background: var(--color-surface);
  }
</style>
