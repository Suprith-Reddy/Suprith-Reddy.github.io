import type { ReviewScope } from './lib/types';

/**
 * Hash router (delta-1): `#/section/:id` style routes. No server rewrites, no 404.html.
 *
 * T0.1 owned the route STORE + hash parser skeleton + parseScope().
 * T2.1 wires the actual route TABLE (matching hashes → views + named params) — see §3.7.
 *
 * Contract (§3.7): `route.value = { path: string; params: Record<string,string> }`.
 * Views READ `route.value` / subscribe; they never import to mutate (§3.5, §7 rule 4).
 */

import type { Component } from 'svelte';
import DeckList from './views/DeckList.svelte';
import SectionView from './views/SectionView.svelte';
import CardEditor from './views/CardEditor.svelte';
import Review from './views/Review.svelte';
import Search from './views/Search.svelte';
import Stats from './views/Stats.svelte';
import Settings from './views/Settings.svelte';

export interface RouteState {
  /** Normalized hash path, e.g. "/", "/section/abc", "/review/all". Leading slash, no leading '#'. */
  path: string;
  /** Named params extracted by the route table (§3.7). e.g. `{ id }`, `{ scope }`. */
  params: Record<string, string>;
}

/**
 * A wired route: a pattern (with `:name` segments) → the view component to render.
 * Pattern segments beginning `:` capture into `params` (URL-decoded).
 */
interface RouteDef {
  /** Pattern path, e.g. "/", "/section/:id", "/review/:scope". */
  pattern: string;
  /** Default-exported Svelte component for this route. */
  component: Component;
  /** Accessible label, used by App.svelte to set the document/nav context. */
  label: string;
}

/**
 * Route table (§3.7). Order matters only for documentation; matching is exact per
 * segment count + literal/param segments, so there is no ambiguity between routes.
 *
 *   #/                 → DeckList      (—)
 *   #/section/:id      → SectionView   (id)
 *   #/new              → CardEditor    (— create)
 *   #/edit/:id         → CardEditor    (id → edit)
 *   #/review/:scope    → Review        (scope; see parseScope grammar)
 *   #/search           → Search        (—)
 *   #/stats            → Stats         (—)
 *   #/settings         → Settings      (—)
 */
export const routes: readonly RouteDef[] = [
  { pattern: '/', component: DeckList as Component, label: 'Decks' },
  { pattern: '/section/:id', component: SectionView as Component, label: 'Section' },
  { pattern: '/new', component: CardEditor as Component, label: 'New card' },
  { pattern: '/edit/:id', component: CardEditor as Component, label: 'Edit card' },
  { pattern: '/review/:scope', component: Review as Component, label: 'Review' },
  { pattern: '/search', component: Search as Component, label: 'Search' },
  { pattern: '/stats', component: Stats as Component, label: 'Stats' },
  { pattern: '/settings', component: Settings as Component, label: 'Settings' },
];

/** A resolved match: which component to mount + the extracted named params. */
export interface RouteMatch {
  component: Component;
  params: Record<string, string>;
  label: string;
}

function splitSegments(path: string): string[] {
  // "/" → [] ; "/section/abc" → ["section","abc"]. Trailing slash tolerated.
  return path.split('/').filter((s) => s.length > 0);
}

/**
 * Match a normalized path (leading slash, no '#') against the route table.
 * Returns the matched component + extracted params, or `null` if nothing matches
 * (App.svelte falls back to DeckList for an unknown hash → no 404 on refresh).
 */
export function matchRoute(path: string): RouteMatch | null {
  const segs = splitSegments(path);
  for (const def of routes) {
    const pat = splitSegments(def.pattern);
    if (pat.length !== segs.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < pat.length; i++) {
      const p = pat[i] as string;
      const s = segs[i] as string;
      if (p.startsWith(':')) {
        params[p.slice(1)] = decodeURIComponent(s);
      } else if (p !== s) {
        ok = false;
        break;
      }
    }
    if (ok) return { component: def.component, params, label: def.label };
  }
  return null;
}

/** Extract just the named params for a path (used by the store to populate `route.params`). */
function paramsFor(path: string): Record<string, string> {
  return matchRoute(path)?.params ?? {};
}

type Subscriber = (value: RouteState) => void;

function readHash(): string {
  // location.hash is like "#/section/abc" or "" — normalize to a leading-slash path.
  const raw = window.location.hash.replace(/^#/, '');
  if (raw === '' || raw === '/') return '/';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

/**
 * Reactive route store. Svelte-compatible (`subscribe` returns an unsubscribe fn) AND
 * exposes a synchronous `.value` accessor for direct reads (§3.7).
 */
class RouteStore {
  #state: RouteState = { path: readHash(), params: paramsFor(readHash()) };
  #subs = new Set<Subscriber>();
  #started = false;

  get value(): RouteState {
    return this.#state;
  }

  /** Svelte store contract: call immediately, then on every change. Returns unsubscribe. */
  subscribe(run: Subscriber): () => void {
    this.#ensureStarted();
    this.#subs.add(run);
    run(this.#state);
    return () => {
      this.#subs.delete(run);
    };
  }

  /** Replace the current route state and notify subscribers. Used internally + by T2.1. */
  set(next: RouteState): void {
    this.#state = next;
    for (const run of this.#subs) run(this.#state);
  }

  #ensureStarted(): void {
    if (this.#started) return;
    this.#started = true;
    window.addEventListener('hashchange', () => {
      // T2.1: re-derive named params from the wired route table on every change.
      const path = readHash();
      this.set({ path, params: paramsFor(path) });
    });
  }
}

export const route = new RouteStore();

/** Programmatic navigation helper (sets the hash; the hashchange listener updates `route`). */
export function navigate(path: string): void {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  window.location.hash = `#${normalized}`;
}

/**
 * Parse the `:scope` segment of `#/review/:scope` into a ReviewScope (§3.7 grammar):
 *   "all"        → { kind: 'all' }
 *   "s:<id>"     → { kind: 'section', id }
 *   "t:<tag>"    → { kind: 'tag', tag }
 * Unknown / malformed input falls back to { kind: 'all' }.
 */
export function parseScope(s: string): ReviewScope {
  const raw = decodeURIComponent(s ?? '').trim();
  if (raw === '' || raw === 'all') return { kind: 'all' };
  if (raw.startsWith('s:')) {
    const id = raw.slice(2);
    if (id) return { kind: 'section', id };
  }
  if (raw.startsWith('t:')) {
    const tag = raw.slice(2);
    if (tag) return { kind: 'tag', tag };
  }
  return { kind: 'all' };
}

/** Inverse of parseScope — build the `:scope` segment for an href (used by views/T2.1). */
export function scopeToParam(scope: ReviewScope): string {
  switch (scope.kind) {
    case 'all':
      return 'all';
    case 'section':
      return `s:${scope.id}`;
    case 'tag':
      return `t:${encodeURIComponent(scope.tag)}`;
  }
}
