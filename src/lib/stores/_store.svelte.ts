/**
 * stores/_store.svelte.ts — shared Store accessor for the reactive store layer (T0.5).
 *
 * The §3.6 reactive stores (`sections`/`cards`/`settings`/`review`) all talk to
 * the SAME `Store` (§3.2) singleton. Rather than each module calling
 * `openStore()` independently, they go through `getStore()` here so:
 *   - the async `openStore()` promise is resolved at most once and shared;
 *   - unit tests can inject an in-memory `makeStore(fakeDb)` via `_setStoreForTests`
 *     (mirrors the `__resetStoreSingletonForTests` / `_resetLiveRegion` convention
 *     used elsewhere in Wave 0) without touching the frozen public surface.
 *
 * This module is internal to `stores/` (underscore-prefixed). It is NOT part of
 * the §3.6 frozen API; views never import it.
 */
import { openStore, type Store } from '../db/index';

let injected: Store | null = null;
let pending: Promise<Store> | null = null;

/**
 * Resolve the shared `Store`. Uses the injected test store if present, otherwise
 * opens (once) the real IndexedDB-backed store. Rejects with `StoreUnavailableError`
 * when IndexedDB is unavailable (propagated from `openStore`).
 */
export function getStore(): Promise<Store> {
  if (injected) return Promise.resolve(injected);
  if (!pending) pending = openStore();
  return pending;
}

/** Test-only: inject an in-memory store and reset cached promise state. */
export function _setStoreForTests(store: Store | null): void {
  injected = store;
  pending = null;
}
