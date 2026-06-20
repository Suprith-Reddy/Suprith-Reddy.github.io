# Flash

A minimalist, ad-free, offline-first flashcards study tool — a single Progressive Web App (PWA) that runs entirely on your device. See `docs/DESIGN.md` and `docs/EXECUTION_PLAN.md`.

> This README is seeded by **T0.1** (scaffold) with the **pinned, resolved toolchain versions** below. **T0.7** extends it with full dev/build/deploy and Add-to-Home-Screen instructions.

## Toolchain (pinned at scaffold — T0.1)

- **Node:** `22` (`.nvmrc`); engines `^20.19 || >=22.12`. Install/build verified on Node **22.14.0**.
- **Package manager:** pnpm **10.18.0** (provided via Corepack; `COREPACK_HOME` kept inside the repo for scope-lock).
- **Build:** Vite **8.0.16** (`base: '/'` — deployed to a user site served from root).

### Resolved dependency versions (exact, pinned in `package.json`)

| Package | Version | Role |
|---|---|---|
| `svelte` | 5.56.3 | Framework (runes; plain Svelte, not SvelteKit) |
| `@sveltejs/vite-plugin-svelte` | 7.1.2 | Svelte ↔ Vite 8 integration |
| `vite` | 8.0.16 | Build / dev server |
| `typescript` | 6.0.3 | Language (strict + `noUncheckedIndexedAccess`) |
| `svelte-check` | 4.6.0 | Typecheck (`pnpm run check`) |
| `vite-plugin-pwa` | 1.3.0 | PWA manifest + service worker (Workbox); configured in T0.2 |
| `workbox-window` | 7.4.1 | SW update plumbing |
| `idb` | 8.0.3 | IndexedDB wrapper |
| `marked` | 18.0.5 | Markdown parser |
| `dompurify` | 3.4.11 | HTML sanitizer (runs on final rendered HTML) |
| `@types/dompurify` | 3.2.0 | Types (note: deprecated upstream; DOMPurify v3 ships its own types) |
| `highlight.js` | 11.11.1 | Code highlighting (core + curated languages) |
| `vitest` | 4.1.9 | Unit tests |
| `happy-dom` | 20.10.6 | DOM env for unit tests |
| `@playwright/test` | 1.61.0 | E2E tests |
| `@axe-core/playwright` | 4.11.3 | a11y assertions in E2E |
| `@types/node` | 26.0.0 | Node types |

## Scripts

| Script | Command | What it does |
|---|---|---|
| `dev` | `vite` | Dev server |
| `build` | `vite build` | Production build → `dist/` |
| `preview` | `vite preview` | Serve the built `dist/` |
| `check` | `svelte-check --tsconfig ./tsconfig.json` | TypeScript + Svelte typecheck |
| `test` | `vitest run` | Unit tests |
| `test:e2e` | `playwright test` | End-to-end tests |

## Scope-lock note (running pnpm here)

`pnpm` is provided via Corepack from the Node 22 toolchain. Everything stays inside the repo:

```sh
export PATH="<node-22-bin>:$PATH"
export COREPACK_HOME="$PWD/.corepack"
export PLAYWRIGHT_BROWSERS_PATH="$PWD/.ms-playwright"   # for Playwright
corepack pnpm <command>
```

(`.corepack`, `.ms-playwright`, `node_modules`, `dist`, `flash.bundle`, `*.local` are git-ignored.)

## Develop

```sh
pnpm install            # one-time (uses the pinned pnpm-lock.yaml)
pnpm dev                # http://localhost:5173 — hot-reloading dev server
```

While developing:

```sh
pnpm check              # TypeScript + Svelte typecheck (strict)
pnpm test               # Vitest unit tests
pnpm test:e2e           # Playwright E2E (offline, SW-update, a11y, smoke)
```

> Use Node 22 (`nvm use` reads `.nvmrc`). Do not commit lockfile changes unless you intentionally changed dependencies — CI installs with `--frozen-lockfile`.

## Build

```sh
pnpm build              # production build → dist/ (app shell + precached SW)
pnpm preview            # serve the built dist/ locally to sanity-check
```

The production build emits a service worker (`vite-plugin-pwa`, `registerType: 'prompt'`) that precaches the app shell and render assets so the app works fully offline. New service-worker versions surface an in-app "Update available — reload" toast rather than silently reloading.

## Deploy (GitHub Pages)

This repo deploys to a **user site** served from the root (`https://<username>.github.io/`), which is why `base: '/'` and hash-based routing are used (no SPA-404 hack needed).

CI lives in `.github/workflows/deploy.yml`:

- **Trigger:** push to `main` (or manual `workflow_dispatch`).
- **Steps:** checkout → setup pnpm → `setup-node` pinned to **`22.x`** (with pnpm cache) → `pnpm install --frozen-lockfile` → `pnpm build` → `upload-pages-artifact` (`path: dist`) → `deploy-pages`.
- **Permissions:** `pages: write`, `id-token: write` (OIDC).
- **Environment:** `github-pages`.
- **Concurrency:** group `pages`, `cancel-in-progress: false` (never cancel an in-progress Pages publish).

### First-time deploy runbook

1. Create a **public** repo named exactly **`<username>.github.io`** on github.com.
2. Bring this code in (e.g. `git clone flash.bundle flash && cd flash`), set the remote to the new repo, then `git push -u origin main`.
3. In the repo: **Settings → Pages → Source = GitHub Actions**.
4. Each push to `main` runs the workflow and deploys to the `github-pages` environment. Wait for the green deploy.
5. Visit `https://<username>.github.io/`.

## Add to Home Screen (install the PWA)

Flash is installable and runs offline once added to your home screen.

### iOS / iPadOS (Safari)

1. Open `https://<username>.github.io/` in **Safari** (installation must be done from Safari, not Chrome/Firefox on iOS).
2. Tap the **Share** button (the square with an upward arrow).
3. Scroll down and tap **Add to Home Screen**.
4. Confirm the name ("Flash") and tap **Add**.
5. Launch Flash from the new home-screen icon — it opens standalone (no browser chrome) and works in Airplane Mode.

> iOS does not expose `navigator.storage.persist()`; installing to the Home Screen is what gives your data durable, offline-available storage. Keep regular JSON backups (Settings → Export) as your safety net.

### Android (Chrome)

1. Open the site in **Chrome**.
2. Tap the **⋮** menu → **Add to Home screen** / **Install app** (Chrome may also show an install prompt automatically).
3. Confirm to install.

### Desktop (Chrome / Edge)

1. Open the site.
2. Click the **install icon** in the address bar (or menu → **Install Flash…**).

## Offline verification

After installing, enable Airplane Mode (or DevTools → Network → Offline) and reload the home-screen icon: the app shell loads from the precached service worker and all your cards (stored in IndexedDB) remain available.
