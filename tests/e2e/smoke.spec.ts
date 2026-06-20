import { test, expect, type Page } from '@playwright/test';

/**
 * smoke.spec.ts — T2.3 end-to-end happy-path: CRUD → review → backup loop.
 *
 * Runs against the BUILT app served by `vite preview` (see playwright.config.ts).
 * The flow exercises the real, frozen contracts wired by T2.1:
 *   1. Create a section (DeckList, T1.1).
 *   2. Open it and add a card (CardEditor, T1.2 — Markdown front/back + tags).
 *   3. Verify the card is listed in the section (SectionView, T1.1).
 *   4. Run a review session (Review, T1.3): flip → grade → session summary.
 *   5. Trigger a backup export (DeckList staleness CTA / Settings) and assert a
 *      JSON download is produced (T1.8 / §3.8 exportBackup).
 *
 * The app self-seeds a sample deck on first run (T1.10), so we always begin from a
 * clean IndexedDB (a fresh, unique origin per test isn't possible with a single
 * preview server, so we explicitly wipe IndexedDB + localStorage before each test
 * to make assertions deterministic).
 */

const UNIQUE = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/** Wipe all client storage so each test starts from a known-empty state. */
async function resetStorage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Block the first-run sample-deck seed from racing our assertions by marking
    // onboarding done is NOT possible pre-DB; instead we just delete the DB before
    // the app boots on the *next* navigation. Clearing here covers reloads.
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

/** Navigate to a hash route and wait for the app shell to be present. */
async function gotoApp(page: Page, hash = '#/'): Promise<void> {
  await page.goto('/' + hash);
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
}

test.describe('smoke: CRUD → review → backup', () => {
  test.beforeEach(async ({ page }) => {
    await resetStorage(page);
  });

  test('create a section, add a card, review it, and export a backup', async ({
    page
  }) => {
    const sectionName = `Smoke ${UNIQUE()}`;
    const front = 'Capital of France?';
    const back = 'Paris';

    await gotoApp(page, '#/');

    // The DeckList loads (sample deck may or may not have seeded depending on
    // timing of the DB wipe; either way our new section is what we assert on).
    await expect(
      page.getByRole('heading', { name: 'Your decks' })
    ).toBeVisible();

    // 1) Create a section via the inline create form.
    await page.getByLabel('New section').fill(sectionName);
    await page.getByRole('button', { name: 'Add section' }).click();

    // The new section row appears with a link to its SectionView.
    const sectionLink = page.getByRole('link', { name: new RegExp(sectionName) });
    await expect(sectionLink).toBeVisible();

    // 2) Open the section and add a card.
    await sectionLink.click();
    await expect(
      page.getByRole('heading', { name: sectionName })
    ).toBeVisible();

    await page.getByRole('link', { name: '+ Add card' }).click();
    await expect(page.getByRole('heading', { name: 'New card' })).toBeVisible();

    // Pick the section (the editor defaults to none on create).
    await page.getByLabel('Section').selectOption({ label: sectionName });
    await page.getByLabel('Front (question)').fill(front);
    await page.getByLabel('Back (answer)').fill(back);

    // Add a tag (Enter commits it).
    const tagInput = page.getByLabel('Tags');
    await tagInput.fill('geography');
    await tagInput.press('Enter');

    // Live preview reflects the front text (CardContent renders Markdown → text).
    await expect(page.getByLabel('Live preview')).toContainText(front);

    await page.getByRole('button', { name: 'Add card' }).click();

    // 3) After save we land back on the SectionView; the card is listed.
    await expect(
      page.getByRole('heading', { name: sectionName })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: new RegExp(front) })
    ).toBeVisible();

    // 4) Review THIS section. New cards are due immediately in both modes.
    // The SectionView's own "Review" action links to `#/review/s:<id>`; scope to it
    // by href (the top nav also has a "Review" → `#/review/all`, so a name match is
    // ambiguous and would trip Playwright strict mode).
    await page.locator('a[href^="#/review/s:"]').click();
    await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible();

    // The card front is shown; flip to reveal the answer, then grade Good.
    // Scope to the FlipCard's labelled "Question"/"Answer" regions: on flip the
    // answer text is ALSO mirrored into the global LiveRegion (§3.5), so an
    // unscoped getByText(back) matches two elements (answer + live region).
    await expect(
      page.getByRole('region', { name: 'Question' }).getByText(front)
    ).toBeVisible();
    await page.getByRole('button', { name: 'Show answer' }).click();
    await expect(
      page.getByRole('region', { name: 'Answer' }).getByText(back)
    ).toBeVisible();

    await page.getByRole('button', { name: /^Good/ }).click();

    // Single-card session → summary appears.
    await expect(
      page.getByRole('heading', { name: 'Session complete' })
    ).toBeVisible();
    await expect(page.getByText(/Reviewed 1 card/)).toBeVisible();

    // 5) Export a backup. The DeckList hosts the staleness banner CTA; since no
    // backup has ever been made it should be present. Navigate home and export.
    await page.getByRole('link', { name: 'Back to decks' }).click();
    await expect(
      page.getByRole('heading', { name: 'Your decks' })
    ).toBeVisible();

    const backupButton = page
      .getByRole('region', { name: 'Backup reminder' })
      .getByRole('button', { name: 'Back up your cards' });
    await expect(backupButton).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await backupButton.click();
    const download = await downloadPromise;

    // The backup filename follows the §3.8 convention.
    expect(download.suggestedFilename()).toMatch(
      /^flash-backup-\d{4}-\d{2}-\d{2}\.json$/
    );
  });
});
