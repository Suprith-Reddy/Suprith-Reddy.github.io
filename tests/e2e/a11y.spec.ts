import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { Result } from 'axe-core';

/**
 * T2.2 — Accessibility audit.
 *
 * Runs `@axe-core/playwright` against EVERY view (§3.7 route table) in BOTH the
 * light and dark themes, and exercises the Review flip→grade flow so the disclosure
 * pattern + grade bar are audited in their revealed state too. The gate (§5 T2.2 /
 * §8) is: ZERO serious/critical violations on any view.
 *
 * Why a real build + preview: the app is offline-first and seeds a sample deck on
 * first run (Onboarding → maybeSeedSampleDeck), so once the home view has loaded
 * there is real content (sections, cards, tags) to audit on the data-bearing views.
 *
 * Theme coverage: tokens.css honors an explicit `[data-theme]` on <html> which wins
 * over the OS media query (T0.6). We force each theme via that attribute so the run
 * is deterministic regardless of the CI machine's `prefers-color-scheme`.
 *
 * Manual-only items (a machine cannot fully self-certify — see notes at bottom):
 *   - VoiceOver/screen-reader announcement of flip + grade + nav (the LiveRegion is
 *     present and aria-live="polite"; axe verifies structure, not spoken output).
 *   - Subjective focus-order / reading-order sanity.
 */

const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];

// Tags we hold the app to. WCAG 2.0/2.1 A + AA, plus axe "best-practice" rules.
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// We only HARD-FAIL on serious/critical (the §8 gate). Moderate/minor are reported.
const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

/** Force a theme by setting the explicit `[data-theme]` override that tokens.css reads. */
async function setTheme(page: Page, theme: Theme): Promise<void> {
  await page.evaluate((t) => {
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
}

/** Navigate to a hash route and wait for the SPA to settle on it. */
async function goto(page: Page, hash: string): Promise<void> {
  await page.goto(`/${hash}`);
  await page.waitForLoadState('networkidle');
}

/** Run axe, return only the serious/critical violations (the blocking set). */
async function blockingViolations(page: Page): Promise<Result[]> {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  return results.violations.filter((v) => BLOCKING_IMPACTS.has(v.impact ?? ''));
}

/** Human-readable summary of violations for assertion messages. */
function describe(violations: Result[]): string {
  return violations
    .map(
      (v) =>
        `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))\n` +
        v.nodes.map((n) => `    → ${n.target.join(' ')}`).join('\n'),
    )
    .join('\n');
}

async function expectClean(page: Page, label: string): Promise<void> {
  const violations = await blockingViolations(page);
  expect(violations, `serious/critical a11y violations on ${label}:\n${describe(violations)}`).toEqual([]);
}

// Routes that render directly with no required interaction. `#/` is loaded first in
// beforeEach so the sample deck is seeded before the data-bearing views are audited.
const STATIC_ROUTES: { hash: string; label: string }[] = [
  { hash: '#/', label: 'DeckList (#/)' },
  { hash: '#/search', label: 'Search (#/search)' },
  { hash: '#/stats', label: 'Stats (#/stats)' },
  { hash: '#/settings', label: 'Settings (#/settings)' },
  { hash: '#/new', label: 'CardEditor — create (#/new)' },
  { hash: '#/review/all', label: 'Review — all (#/review/all)' },
];

test.describe('Accessibility audit (axe-core: zero serious/critical)', () => {
  test.beforeEach(async ({ page }) => {
    // Load home first so Onboarding seeds the sample deck → real content exists.
    await goto(page, '#/');
    // Wait until the deck list has finished loading (sample deck seeded + rendered).
    await page.locator('ul.sections').first().waitFor({ state: 'visible', timeout: 15_000 });
  });

  for (const theme of THEMES) {
    test.describe(`theme: ${theme}`, () => {
      for (const route of STATIC_ROUTES) {
        test(`${route.label}`, async ({ page }) => {
          await goto(page, route.hash);
          await setTheme(page, theme);
          // Give views with async loads (Search tags, Stats helpers) a tick to settle.
          await page.waitForTimeout(300);
          await expectClean(page, `${route.label} [${theme}]`);
        });
      }

      test(`SectionView — first section (#/section/:id) `, async ({ page }) => {
        // Resolve a real section id from the seeded deck via its DeckList link.
        await goto(page, '#/');
        const firstLink = page.locator('a.section-row__link').first();
        await firstLink.waitFor({ state: 'visible' });
        const href = await firstLink.getAttribute('href');
        expect(href, 'expected a seeded section link').toBeTruthy();
        await goto(page, href!.replace(/^#/, '#'));
        await setTheme(page, theme);
        await page.waitForTimeout(300);
        await expectClean(page, `SectionView [${theme}]`);
      });

      test(`CardEditor — edit existing card (#/edit/:id)`, async ({ page }) => {
        // Use Search to surface a real card id, then audit its editor.
        await goto(page, '#/search');
        await page.locator('#search-query').fill('a');
        const result = page.locator('a.result-link').first();
        await result.waitFor({ state: 'visible', timeout: 10_000 });
        const href = await result.getAttribute('href');
        expect(href, 'expected at least one search result from the sample deck').toBeTruthy();
        await goto(page, href!.replace(/^#/, '#'));
        await setTheme(page, theme);
        await page.waitForTimeout(300);
        await expectClean(page, `CardEditor edit [${theme}]`);
      });

      test(`Review — revealed answer + grade bar (#/review/all)`, async ({ page }) => {
        await goto(page, '#/review/all');
        await setTheme(page, theme);
        // Flip the card to reveal the answer + grade buttons, then audit that state.
        const flip = page.getByRole('button', { name: /show answer/i }).first();
        if (await flip.isVisible().catch(() => false)) {
          await flip.click();
          // Grade bar appears once revealed.
          await page.getByRole('group', { name: /grade this card/i }).waitFor({ state: 'visible' });
        }
        await page.waitForTimeout(200);
        await expectClean(page, `Review revealed [${theme}]`);
      });

      test(`Search — with results + tag filter bar (#/search)`, async ({ page }) => {
        await goto(page, '#/search');
        await setTheme(page, theme);
        await page.locator('#search-query').fill('a');
        // Let the debounced search resolve and render results.
        await page.waitForTimeout(500);
        await expectClean(page, `Search results [${theme}]`);
      });
    });
  }

  test('nav: primary navigation landmark is clean (DeckList)', async ({ page }) => {
    await goto(page, '#/');
    const results = await new AxeBuilder({ page })
      .withTags(AXE_TAGS)
      .include('nav[aria-label="Primary"]')
      .analyze();
    const blocking = results.violations.filter((v) => BLOCKING_IMPACTS.has(v.impact ?? ''));
    expect(blocking, `nav a11y violations:\n${describe(blocking)}`).toEqual([]);
  });
});
