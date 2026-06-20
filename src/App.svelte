<script lang="ts">
  /**
   * App shell: nav + <Router/> outlet.
   *
   * SHARED FILE (§7 rule 3): T0.1 created the skeleton shell; T2.1 wires the
   * route table → view mapping and the real nav links (with aria-current).
   * No Wave 1 task edits this file.
   *
   * Responsibilities (T2.1, §3.7):
   *   - Subscribe to the reactive `route` store.
   *   - Resolve `route.path` → a view component via `matchRoute` (route table).
   *   - Unknown hash → fall back to DeckList (deep-link refresh ⇒ no 404).
   *   - Render accessible primary nav with `aria-current="page"` on the active link.
   *   - Mount the always-present Onboarding host (it self-gates on first run /
   *     iOS install hint) and the global LiveRegion + Toast singletons.
   */
  import { route, matchRoute, type RouteState, type RouteMatch } from './router';
  import LiveRegion from './components/LiveRegion.svelte';
  import Toast from './components/Toast.svelte';
  import Onboarding from './views/Onboarding.svelte';
  import DeckList from './views/DeckList.svelte';

  let current = $state<RouteState>(route.value);
  $effect(() => {
    // Subscribe to the route store; keep `current` in sync. Cleaned up on unmount.
    const unsub = route.subscribe((r) => {
      current = r;
    });
    return unsub;
  });

  // Resolve the active route → component. Unknown hashes fall back to DeckList so a
  // refresh on any (even stale) hash renders the home view instead of a blank/404.
  const match = $derived<RouteMatch>(
    matchRoute(current.path) ?? { component: DeckList, params: {}, label: 'Decks' },
  );
  const ActiveView = $derived(match.component);

  // Primary nav entries (the param-bearing routes — section/edit/review/new — are
  // reached contextually from within views, not from the top-level nav).
  const navItems: { href: string; label: string }[] = [
    { href: '#/', label: 'Decks' },
    { href: '#/review/all', label: 'Review' },
    { href: '#/search', label: 'Search' },
    { href: '#/stats', label: 'Stats' },
    { href: '#/settings', label: 'Settings' },
  ];

  // A nav item is "current" when the active path matches its target. "#/" is current
  // only on the exact home path; the others match their path prefix so that, e.g.,
  // `#/review/s:abc` still highlights "Review".
  function isCurrent(href: string, path: string): boolean {
    const target = href.replace(/^#/, '');
    if (target === '/') return path === '/';
    const base = target.split('/')[1]; // "review", "search", ...
    const active = path.split('/')[1];
    return base === active;
  }
</script>

<a class="skip-link" href="#main">Skip to content</a>

<header>
  <nav aria-label="Primary">
    <a class="brand" href="#/">Flash</a>
    <ul>
      {#each navItems as item (item.href)}
        <li>
          <a
            href={item.href}
            aria-current={isCurrent(item.href, current.path) ? 'page' : undefined}
          >
            {item.label}
          </a>
        </li>
      {/each}
    </ul>
  </nav>
</header>

<!-- Always-present first-run / install-hint host. Self-gates; renders nothing when idle. -->
<Onboarding />

<main id="main" tabindex="-1">
  <!-- Router outlet: render the matched view. `current.path` is the reactive key so
       the component (and its internal route-param reads) refresh on navigation. -->
  {#key current.path}
    <ActiveView />
  {/key}
</main>

<!-- Global a11y singletons (§3.5 / §T0.6). One LiveRegion + one Toast host for the app. -->
<LiveRegion />
<Toast />

<style>
  .skip-link {
    position: absolute;
    left: -9999px;
    top: 0;
  }
  .skip-link:focus {
    left: 0;
  }
  header {
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--border, #ddd);
  }
  nav {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .brand {
    font-weight: 700;
    text-decoration: none;
    color: inherit;
  }
  nav ul {
    display: flex;
    gap: 0.25rem;
    list-style: none;
    margin: 0;
    padding: 0;
    flex-wrap: wrap;
  }
  nav a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 0.75rem;
    border-radius: 0.375rem;
    text-decoration: none;
    color: inherit;
  }
  nav a[aria-current='page'] {
    font-weight: 700;
    /* Not color-only: also bold + underline so state is conveyed non-chromatically. */
    text-decoration: underline;
    text-underline-offset: 0.3em;
    background: var(--accent-muted, rgba(0, 0, 0, 0.06));
  }
  nav a:focus-visible {
    outline: 2px solid var(--focus, #2563eb);
    outline-offset: 2px;
  }
  main {
    padding: 1rem;
  }
</style>
