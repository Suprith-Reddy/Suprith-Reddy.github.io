<script lang="ts">
  /**
   * Review.svelte — the study-session view (T1.3).
   *
   * Drives a review session purely through the frozen review store (§3.6):
   *   startSession(scope, mode) → current / revealed / position / summary
   *   flip() → reveal + LiveRegion mirror; grade('again'|'good') → persist + advance.
   *
   * Routing (§3.5 / §7 rule 4): this view NEVER imports `router.ts`. It READS the
   * `route` store (a Svelte-contract store) for the `:scope` param and parses it
   * locally with the §3.7 grammar, and it navigates only via <a href="#/..."> hash
   * links. The review MODE comes from the persisted settings store (§3.6).
   *
   * Keyboard: global shortcuts (Space/Enter flip, 1=Again 2=Good) are owned by
   * T1.9 (`lib/a11y/shortcuts.ts`) which calls the same review-store actions; this
   * view provides the on-screen buttons that are the frozen MVP contract (swipe
   * gestures are explicitly DEFERRED post-MVP).
   */
  import { tick } from 'svelte';
  import type { ReviewScope } from '../lib/types';
  import { route } from '../router';
  import { settings } from '../lib/stores/settings.svelte';
  import {
    current,
    revealed,
    position,
    summary,
    startSession,
    flip,
    grade
  } from '../lib/stores/review.svelte';
  import { registerShortcuts } from '../lib/a11y/shortcuts';
  import FlipCard from '../components/FlipCard.svelte';
  import ShortcutHelp from '../components/ShortcutHelp.svelte';
  import Button from '../components/Button.svelte';

  // `route` implements the Svelte store contract (subscribe), so it auto-subscribes
  // under the `$` prefix. We only READ it (params) — never mutate/register routes
  // (that is T2.1's job, §7 rule 4). Navigation is via <a href="#/..."> hash links.
  const routeStore = route;

  /**
   * Parse the `:scope` segment into a ReviewScope (§3.7 grammar). Inlined here so
   * the view does not import router.ts (§7 rule 4): "all" → all; "s:<id>" →
   * section; "t:<tag>" → tag; anything else → all.
   */
  function parseScopeParam(raw: string | undefined): ReviewScope {
    const s = decodeURIComponent((raw ?? '').trim());
    if (s === '' || s === 'all') return { kind: 'all' };
    if (s.startsWith('s:')) {
      const id = s.slice(2);
      if (id) return { kind: 'section', id };
    }
    if (s.startsWith('t:')) {
      const tag = s.slice(2);
      if (tag) return { kind: 'tag', tag };
    }
    return { kind: 'all' };
  }

  // Re-start the session whenever the route scope changes. We key on the raw
  // scope string so navigating between review scopes restarts cleanly.
  let lastKey = $state<string | null>(null);
  let starting = $state(false);
  let startError = $state<string | null>(null);

  async function maybeStart(scopeParam: string | undefined): Promise<void> {
    const key = scopeParam ?? 'all';
    if (key === lastKey) return;
    lastKey = key;
    starting = true;
    startError = null;
    try {
      const scope = parseScopeParam(scopeParam);
      await startSession(scope, settings.value.reviewMode);
    } catch (err) {
      startError = err instanceof Error ? err.message : String(err);
    } finally {
      starting = false;
    }
  }

  // React to route param changes. `$routeStore` auto-subscribes + re-runs.
  $effect(() => {
    const scopeParam = $routeStore.params.scope;
    void maybeStart(scopeParam);
  });

  // ── focus management (§3.5: keep focus sensible; never strand it on hidden/
  // removed content) ─────────────────────────────────────────────────────────
  // The card region (FlipCard's "Show answer" button and the grade bar) is torn
  // down and rebuilt on flip / advance, so the element that held focus is removed
  // from the DOM. After each transition we move focus to the next interactive
  // element so keyboard/AT users keep their place.
  let cardRegion = $state<HTMLElement | null>(null);

  async function focusShowAnswer(): Promise<void> {
    await tick();
    cardRegion?.querySelector<HTMLElement>('.flip-btn')?.focus();
  }

  async function focusFirstGrade(): Promise<void> {
    await tick();
    cardRegion?.querySelector<HTMLElement>('.grade-bar button')?.focus();
  }

  function onFlip(): void {
    flip();
    // Answer revealed → grade bar appears; move focus onto the first grade button.
    void focusFirstGrade();
  }

  async function onGrade(g: 'again' | 'good'): Promise<void> {
    // Gate grading on the answer being revealed (so '2' before flip can't grade
    // an unrevealed card). This also guards the keyboard shortcut path.
    if (!revealed.value) return;
    await grade(g);
    // Card advanced → a fresh "Show answer" button rendered; move focus to it.
    void focusShowAnswer();
  }

  // ── keyboard shortcuts (§3.5 / F-15) ─────────────────────────────────────────
  // Registered for the lifetime of the Review session. `again`/`good` are gated on
  // `revealed` (via onGrade); `flip` is a no-op once revealed (store guards it).
  let helpOpen = $state(false);

  $effect(() => {
    const dispose = registerShortcuts({
      flip: onFlip,
      again: () => void onGrade('again'),
      good: () => void onGrade('good'),
      help: () => {
        helpOpen = true;
      }
    });
    return dispose;
  });
</script>

<section class="review" aria-labelledby="review-heading">
  <h1 id="review-heading">Review</h1>

  {#if startError}
    <p class="state error" role="alert">Couldn't start the session: {startError}</p>
    <a class="link" href="#/">Back to decks</a>
  {:else if starting}
    <p class="state" aria-live="polite">Loading…</p>
  {:else if summary.value}
    <!-- Session complete -->
    <div class="summary" aria-live="polite">
      <h2>Session complete</h2>
      <p>Reviewed {summary.value.reviewed} card{summary.value.reviewed === 1 ? '' : 's'}.</p>
      <ul class="tally">
        <li><span class="tally-good">Good</span>: {summary.value.good}</li>
        <li><span class="tally-again">Again</span>: {summary.value.again}</li>
      </ul>
      <div class="actions">
        <a class="link-btn" href="#/">Back to decks</a>
        <a class="link-btn" href="#/stats">View stats</a>
      </div>
    </div>
  {:else if current.value}
    <!-- Active card -->
    <p class="progress" aria-live="polite">
      Card {position.value.index + 1} of {position.value.total}
    </p>

    <div bind:this={cardRegion}>
      <FlipCard
        front={current.value.front}
        back={current.value.back}
        revealed={revealed.value}
        onFlip={onFlip}
      />

      {#if revealed.value}
        <div class="grade-bar" role="group" aria-label="Grade this card">
          <Button variant="danger" onclick={() => void onGrade('again')}>
            Again <span class="key-hint" aria-hidden="true">(1)</span>
          </Button>
          <Button variant="primary" onclick={() => void onGrade('good')}>
            Good <span class="key-hint" aria-hidden="true">(2)</span>
          </Button>
        </div>
      {/if}
    </div>
  {:else}
    <!-- No cards due / empty scope -->
    <div class="state empty">
      <p>Nothing to review right now.</p>
      <p class="muted">
        New cards are due immediately; in Leitner mode, scheduled cards return when due.
      </p>
      <a class="link-btn" href="#/">Back to decks</a>
    </div>
  {/if}

  <!-- Keyboard-shortcut help dialog, toggled by the "?" shortcut. -->
  <ShortcutHelp open={helpOpen} onClose={() => (helpOpen = false)} />
</section>

<style>
  .review {
    max-width: 40rem;
    margin: 0 auto;
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  h1 {
    font-size: var(--font-size-lg);
    margin: 0;
  }

  .progress {
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
    margin: 0;
  }

  .state {
    color: var(--color-text-muted);
  }
  .state.error {
    color: var(--color-danger);
  }
  .muted {
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
  }

  .grade-bar {
    display: flex;
    gap: var(--space-3);
    justify-content: center;
  }
  .grade-bar :global(.btn) {
    flex: 1 1 0;
    max-width: 12rem;
  }

  .key-hint {
    margin-left: var(--space-1);
    opacity: 0.8;
    font-weight: 400;
  }

  .summary,
  .empty {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }

  .tally {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    gap: var(--space-4);
  }
  .tally-good {
    color: var(--color-success);
    font-weight: 600;
  }
  .tally-again {
    color: var(--color-danger);
    font-weight: 600;
  }

  .actions {
    display: flex;
    gap: var(--space-3);
  }

  .link-btn,
  .link {
    display: inline-flex;
    align-items: center;
    min-height: var(--tap-target-min);
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    color: var(--color-text);
    text-decoration: none;
    font-weight: 600;
  }
  .link-btn:hover,
  .link:hover {
    background: var(--color-surface);
  }
</style>
