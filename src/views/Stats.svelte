<script lang="ts">
  /**
   * Stats.svelte — progress / stats view (T1.7, F-13).
   *
   * Surfaces motivating, fully-local stats:
   *   - cards due today (calendar-aligned, end-of-local-day)
   *   - study streak (consecutive local days with ≥1 review)
   *   - per-section mastery (% of cards in the top Leitner box)
   *   - per-box (Leitner) distribution
   *   - simple totals (cards / sections / reviews)
   *
   * All the math lives in `stats.helpers.ts` (pure + unit-tested). This component
   * only loads data and renders it.
   *
   * Data sourcing:
   *   - sections + cards come from the §3.6 reactive stores
   *     (`loadCards()` fills every section bucket; `cardsOf` reads them).
   *   - the review log has NO §3.6 reactive accessor (the frozen stores surface
   *     only exposes the live review SESSION, not `allReviews`). Stats needs the
   *     full append-only log for streaks, so we read it once, read-only, via the
   *     Store (§3.2 `allReviews`). See the result notes — this is a contract gap.
   *
   * a11y (§3.5): progress is conveyed with TEXT ("2 / 4 mastered — 50%") and a
   * <progress> element, never color alone; the bars are decorative
   * (aria-hidden). No motion. Navigates only via <a href="#/..."> (§3.5).
   */
  import type { Card, ReviewLogEntry, Section } from '../lib/types';
  import { LEITNER_BOXES } from '../lib/types';
  import { now } from '../lib/util/time';
  import { sections, loadSections } from '../lib/stores/sections.svelte';
  import { cardsOf, loadCards } from '../lib/stores/cards.svelte';
  import { openStore, StoreUnavailableError } from '../lib/db/index';
  import { computeStats } from './stats.helpers';

  let reviewLog = $state<ReviewLogEntry[]>([]);
  let loaded = $state(false);
  let unavailable = $state(false);

  // Reactive flatten of every section's cached cards (cardsOf is reactive).
  const allCards = $derived<Card[]>(
    sections.value.flatMap((s: Section) => cardsOf(s.id))
  );

  const stats = $derived(
    computeStats(sections.value, allCards, reviewLog, now())
  );

  async function load(): Promise<void> {
    try {
      await loadSections();
      await loadCards(); // loads ALL cards into per-section buckets
      const store = await openStore();
      reviewLog = await store.allReviews();
      loaded = true;
    } catch (err) {
      if (err instanceof StoreUnavailableError) {
        unavailable = true;
      } else {
        throw err;
      }
    }
  }

  $effect(() => {
    void load();
  });
</script>

<section class="stats" aria-labelledby="stats-heading">
  <h1 id="stats-heading">Progress</h1>

  {#if unavailable}
    <p class="notice" role="alert">
      Storage is unavailable on this device (for example, a private browsing
      window). Stats can't be shown.
    </p>
  {:else if !loaded}
    <p class="notice">Loading stats…</p>
  {:else}
    <!-- Top-line summary cards. Each value is paired with a text label (§3.5). -->
    <dl class="summary">
      <div class="stat">
        <dt>Due today</dt>
        <dd>{stats.dueToday}</dd>
      </div>
      <div class="stat">
        <dt>Day streak</dt>
        <dd>
          {stats.streak}
          <span class="unit">{stats.streak === 1 ? 'day' : 'days'}</span>
        </dd>
      </div>
      <div class="stat">
        <dt>Total cards</dt>
        <dd>{stats.totalCards}</dd>
      </div>
      <div class="stat">
        <dt>Reviews logged</dt>
        <dd>{stats.totalReviews}</dd>
      </div>
    </dl>

    {#if stats.dueToday > 0}
      <p class="cta">
        <a class="review-link" href="#/review/all">
          Review {stats.dueToday}
          {stats.dueToday === 1 ? 'card' : 'cards'} due today
        </a>
      </p>
    {/if}

    <!-- Per-box Leitner distribution. -->
    <h2>Leitner boxes</h2>
    {#if stats.totalCards === 0}
      <p class="muted">No cards yet.</p>
    {:else}
      <ul class="boxes" role="list">
        {#each stats.boxes as count, i (i)}
          <li class="box-row">
            <span class="box-label">
              Box {i + 1}{i + 1 === LEITNER_BOXES ? ' (mastered)' : ''}
            </span>
            <span class="box-bar" aria-hidden="true">
              <span
                class="box-fill"
                style="width: {stats.totalCards > 0
                  ? Math.round((count / stats.totalCards) * 100)
                  : 0}%"
              ></span>
            </span>
            <span class="box-count">{count}</span>
          </li>
        {/each}
      </ul>
    {/if}

    <!-- Per-section mastery. -->
    <h2>Mastery by section</h2>
    {#if stats.mastery.length === 0}
      <p class="muted">
        No sections yet. <a href="#/">Create one</a> to start tracking progress.
      </p>
    {:else}
      <ul class="mastery" role="list">
        {#each stats.mastery as row (row.section.id)}
          <li class="mastery-row">
            <div class="mastery-head">
              <a class="section-name" href="#/section/{row.section.id}">
                {row.section.name}
              </a>
              <span class="mastery-text">
                {row.mastered} / {row.total} mastered — {row.percent}%
              </span>
            </div>
            <progress
              class="mastery-bar"
              value={row.percent}
              max="100"
              aria-label="{row.section.name}: {row.percent}% mastered"
            ></progress>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</section>

<style>
  .stats {
    max-width: 48rem;
    margin: 0 auto;
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  h1 {
    font-size: var(--font-size-lg);
  }

  h2 {
    font-size: var(--font-size-md);
    margin-top: var(--space-2);
  }

  .notice,
  .muted {
    color: var(--color-text-muted);
  }

  /* ── Summary grid ──────────────────────────────────────────────────── */
  .summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
    gap: var(--space-3);
    margin: 0;
  }

  .stat {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-3);
  }

  .stat dt {
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
  }

  .stat dd {
    margin: var(--space-1) 0 0;
    font-size: var(--font-size-lg);
    font-weight: 700;
  }

  .stat .unit {
    font-size: var(--font-size-sm);
    font-weight: 400;
    color: var(--color-text-muted);
  }

  .cta {
    margin: 0;
  }
  .review-link {
    display: inline-flex;
    align-items: center;
    min-height: var(--tap-target-min);
    padding: var(--space-2) var(--space-4);
    background: var(--color-primary);
    color: var(--color-primary-text);
    border-radius: var(--radius-md);
    font-weight: 600;
    text-decoration: none;
  }
  .review-link:hover {
    background: var(--color-primary-hover);
  }

  /* ── Leitner box bars ──────────────────────────────────────────────── */
  .boxes,
  .mastery {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
  }

  .box-row {
    display: grid;
    grid-template-columns: 9rem 1fr 2.5rem;
    align-items: center;
    gap: var(--space-3);
  }

  .box-label {
    font-size: var(--font-size-sm);
  }

  .box-bar {
    display: block;
    height: 0.75rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }
  .box-fill {
    display: block;
    height: 100%;
    background: var(--color-primary);
  }
  .box-count {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  /* ── Mastery rows ──────────────────────────────────────────────────── */
  .mastery-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .mastery-head {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    flex-wrap: wrap;
  }
  .section-name {
    font-weight: 600;
  }
  .mastery-text {
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
    font-variant-numeric: tabular-nums;
  }
  .mastery-bar {
    width: 100%;
    height: 0.75rem;
    appearance: none;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    overflow: hidden;
    background: var(--color-surface);
  }
  /* Progress fill colors (decorative; the % text is the source of truth). */
  .mastery-bar::-webkit-progress-bar {
    background: var(--color-surface);
  }
  .mastery-bar::-webkit-progress-value {
    background: var(--color-success);
  }
  .mastery-bar::-moz-progress-bar {
    background: var(--color-success);
  }
</style>
