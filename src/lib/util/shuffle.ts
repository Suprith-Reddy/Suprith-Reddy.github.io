/**
 * shuffle.ts — Fisher–Yates shuffle (T0.4).
 *
 * Pure: returns a NEW array, never mutates the input. Used by the shuffle
 * scheduler (T1.3) and anywhere a uniform random permutation is needed.
 *
 * `rng` is injectable (defaults to Math.random) so tests can be deterministic.
 */

/** Return a uniformly-random permutation of `items` (new array; input untouched). */
export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}
