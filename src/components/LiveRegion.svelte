<script lang="ts">
  /**
   * LiveRegion — the single global aria-live="polite" host (§3.5).
   *
   * Mount this ONCE near the app root (T2.1 places it in App.svelte). It registers
   * its DOM node with `lib/a11y/liveRegion.ts`; any code then calls `announce(...)`
   * to push text here for assistive tech. Visually hidden via `.sr-only`.
   */
  import { registerLiveRegion } from '../lib/a11y/liveRegion';

  let el = $state<HTMLElement | null>(null);

  $effect(() => {
    registerLiveRegion(el);
    return () => registerLiveRegion(null);
  });
</script>

<div
  bind:this={el}
  class="sr-only"
  role="status"
  aria-live="polite"
  aria-atomic="true"
></div>
