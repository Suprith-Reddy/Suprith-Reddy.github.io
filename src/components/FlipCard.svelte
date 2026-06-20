<script lang="ts">
  /**
   * FlipCard — the review card disclosure pattern (T1.3, §3.5).
   *
   * Accessibility contract (§3.5):
   *   - The flip control is a real <button> with `aria-expanded` reflecting whether
   *     the answer is shown, and `aria-controls` pointing at the answer container.
   *   - The answer container is `hidden` until revealed (so SR/keyboard users don't
   *     reach it early; it's not just visually hidden).
   *   - Revealing the answer is mirrored into the global LiveRegion by the caller
   *     (review store `flip()` calls `announce(card.back)`), so we don't double-announce.
   *   - Motion (the flip transition) is gated behind `prefers-reduced-motion`.
   *
   * This component is CONTROLLED: `revealed` + `onFlip` are owned by the parent
   * (Review.svelte binds them to the review store). It renders card content via
   * the frozen §3.4 CardContent component (we rely only on its `{ markdown }` prop).
   *
   * Front/back are Markdown SOURCE strings (Card.front / Card.back).
   */
  import CardContent from './CardContent.svelte';

  interface Props {
    front: string;
    back: string;
    revealed: boolean;
    /** Invoked when the user activates the flip control while the answer is hidden. */
    onFlip: () => void;
  }

  let { front, back, revealed, onFlip }: Props = $props();

  // Stable id so aria-controls / id match for assistive tech.
  const answerId = `flipcard-answer-${Math.random().toString(36).slice(2, 9)}`;

  function handleFlip(): void {
    if (!revealed) onFlip();
  }
</script>

<div class="flipcard">
  <section class="face front" aria-label="Question">
    <CardContent markdown={front} />
  </section>

  {#if !revealed}
    <button
      type="button"
      class="flip-btn"
      aria-expanded={false}
      aria-controls={answerId}
      onclick={handleFlip}
    >
      Show answer
    </button>
  {/if}

  <section
    id={answerId}
    class="face back"
    class:revealed
    aria-label="Answer"
    hidden={!revealed}
  >
    <hr class="divider" aria-hidden="true" />
    <CardContent markdown={back} />
  </section>
</div>

<style>
  .flipcard {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    width: 100%;
  }

  .face {
    padding: var(--space-4);
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }

  .face.front {
    font-size: var(--font-size-lg);
  }

  .divider {
    border: none;
    border-top: 1px solid var(--color-border);
    margin: 0 0 var(--space-3);
  }

  .flip-btn {
    align-self: center;
    min-height: var(--tap-target-min);
    padding: var(--space-2) var(--space-5);
    background: var(--color-primary);
    color: var(--color-primary-text);
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-md);
    font-size: var(--font-size-md);
    font-weight: 600;
    cursor: pointer;
  }
  .flip-btn:hover {
    background: var(--color-primary-hover);
    border-color: var(--color-primary-hover);
  }

  /* Reveal motion, gated behind prefers-reduced-motion (§3.5). */
  .face.back.revealed {
    animation: reveal var(--transition-fast);
  }

  @keyframes reveal {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .face.back.revealed {
      animation: none;
    }
  }
</style>
