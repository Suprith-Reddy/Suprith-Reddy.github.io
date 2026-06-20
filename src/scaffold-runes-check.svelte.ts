/**
 * SCAFFOLD GATE (T0.1): proves a `$state` rune in a `.svelte.ts` module compiles
 * AND reacts. This is the runes-in-module pattern that all §3.6 stores rely on.
 * Kept tiny and self-contained; safe to delete once stores land, but harmless.
 */
export function createCounter(initial = 0) {
  let count = $state(initial);
  return {
    get count() {
      return count;
    },
    increment() {
      count += 1;
    }
  };
}
