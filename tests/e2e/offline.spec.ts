import { test, expect, type Page } from '@playwright/test';

/**
 * offline.spec.ts — T2.3 offline-first / PWA E2E.
 *
 * Proves the core offline-first promise (§8 DoD): once the service worker has
 * precached the app shell + render assets (T0.2, vite-plugin-pwa / Workbox), the
 * user can go fully offline, RELOAD, and the app still boots and their data is
 * intact (IndexedDB persists across the offline reload).
 *
 * Runs against the BUILT app served by `vite preview` (playwright.config.ts) — the
 * dev server has the SW disabled (`devOptions.enabled:false` in vite.config.ts), so
 * only the build exercises real precaching. `base:'/'` + hash routing (delta-1/2)
 * mean every route's path is `/`, so the SW's `navigateFallback:'/index.html'`
 * serves any reload offline with no 404.
 *
 * Flow:
 *   1. Boot online; wait for the SW to control the page (offline-ready).
 *   2. Create a section + a card (DeckList → CardEditor) so there is user data.
 *   3. Go offline (context.setOffline(true)).
 *   4. Reload — the shell must come from the SW cache, not the network.
 *   5. Assert the app booted (nav present) AND the user's data survived.
 */

const UNIQUE = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/** Wipe client storage before the app boots so each test starts known-empty. */
async function resetStorage(page: Page): Promise<void> {
  // addInitScript runs on EVERY document load — including the in-test reload that
  // these offline tests perform AFTER creating data. So we guard the wipe behind a
  // sessionStorage sentinel: storage is cleared once (the first load of the test's
  // isolated context) and then left intact across the reload, so the data we create
  // genuinely survives the offline reload (which is the whole point of the test).
  await page.addInitScript(() => {
    try {
      if (sessionStorage.getItem('__flash_e2e_reset') === '1') return;
      sessionStorage.setItem('__flash_e2e_reset', '1');
    } catch {
      /* sessionStorage unavailable — fall through and reset anyway */
    }
    try {
      indexedDB.deleteDatabase('flash');
    } catch {
      /* ignore */
    }
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });
}

/** Navigate to a hash route and wait for the app shell. */
async function gotoApp(page: Page, hash = '#/'): Promise<void> {
  await page.goto('/' + hash);
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
}

/**
 * Wait until a service worker is registered AND has taken control of the page
 * (`navigator.serviceWorker.controller` is non-null). With `clientsClaim:true`
 * (vite.config.ts) the active SW claims existing clients, but the FIRST load
 * before claim may be uncontrolled — so we poll until controlled.
 */
async function waitForSWControl(page: Page): Promise<void> {
  // Resolve `navigator.serviceWorker.ready` (the registration is active for this
  // client) instead of polling `getRegistration().active`, which can transiently
  // report a null `.active` right after the test's IndexedDB wipe + reload — a
  // race that flakes the precache-readiness wait. Then poll for `controller` so we
  // know this client is actually being served *from* the SW (precache in effect).
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return;
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(
    () => !!navigator.serviceWorker.controller,
    undefined,
    { timeout: 30_000 }
  );
}

test.describe('offline-first: reload while offline keeps app + data', () => {
  test.beforeEach(async ({ page }) => {
    await resetStorage(page);
  });

  test('SW precaches the shell; offline reload boots the app with data intact', async ({
    page,
    context
  }) => {
    const sectionName = `Offline ${UNIQUE()}`;
    const front = 'What protocol does HTTP use?';
    const back = 'TCP';

    // 1) Boot ONLINE and let the SW install + take control (precache complete).
    await gotoApp(page, '#/');
    await expect(page.getByRole('heading', { name: 'Your decks' })).toBeVisible();
    await waitForSWControl(page);

    // 2) Create a section.
    await page.getByLabel('New section').fill(sectionName);
    await page.getByRole('button', { name: 'Add section' }).click();
    const sectionLink = page.getByRole('link', { name: new RegExp(sectionName) });
    await expect(sectionLink).toBeVisible();

    // 3) Add a card to that section.
    await sectionLink.click();
    await expect(page.getByRole('heading', { name: sectionName })).toBeVisible();
    await page.getByRole('link', { name: '+ Add card' }).click();
    await expect(page.getByRole('heading', { name: 'New card' })).toBeVisible();
    await page.getByLabel('Section').selectOption({ label: sectionName });
    await page.getByLabel('Front (question)').fill(front);
    await page.getByLabel('Back (answer)').fill(back);
    await page.getByRole('button', { name: 'Add card' }).click();

    // Back on the SectionView, the card is listed.
    await expect(page.getByRole('heading', { name: sectionName })).toBeVisible();
    await expect(
      page.getByRole('link', { name: new RegExp(front) })
    ).toBeVisible();

    // Return to the home view first so the post-reload assertions below target the
    // DeckList ("Your decks"). reload() reloads the CURRENT hash, and we're on
    // `#/section/:id` after adding the card — without this we'd reload SectionView.
    await page.getByRole('link', { name: '← Decks' }).click();
    await expect(page.getByRole('heading', { name: 'Your decks' })).toBeVisible();

    // 4) GO OFFLINE and reload. The shell must be served from the SW cache.
    await context.setOffline(true);
    // Sanity: the network really is down for this context.
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);

    await page.reload();

    // 5a) The app booted offline — nav + home heading rendered from cache.
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Your decks' })
    ).toBeVisible();

    // 5b) The user's data survived the offline reload (IndexedDB persisted).
    const offlineSectionLink = page.getByRole('link', {
      name: new RegExp(sectionName)
    });
    await expect(offlineSectionLink).toBeVisible();

    // 5c) Deep navigation still works fully offline (hash routing, no network).
    await offlineSectionLink.click();
    await expect(page.getByRole('heading', { name: sectionName })).toBeVisible();
    await expect(
      page.getByRole('link', { name: new RegExp(front) })
    ).toBeVisible();

    // Restore connectivity for any teardown.
    await context.setOffline(false);
  });

  test('offline deep-link refresh of a hash route serves index.html (no 404)', async ({
    page,
    context
  }) => {
    // Boot online + let the SW control the page so the navigateFallback is cached.
    await gotoApp(page, '#/');
    await waitForSWControl(page);

    // Navigate to a non-home hash route and confirm it renders online first.
    await page.goto('/#/stats');
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();

    // Go offline and reload the deep hash route. The SW's navigateFallback must
    // serve /index.html (the path is always '/'), so the SPA renders — no 404.
    await context.setOffline(true);
    await page.reload();

    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
    // Stats view renders its own heading ("Progress") offline.
    await expect(
      page.getByRole('heading', { name: 'Progress' })
    ).toBeVisible();

    await context.setOffline(false);
  });
});
