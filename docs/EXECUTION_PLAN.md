# Flash — Execution Plan

> **Companion to** `DESIGN.md` (read it first). · **Date:** 2026-06-19 · **Rev 2** (hardened after adversarial review)
>
> This is the implementation hand-off. It is **contract-first**: Wave 0 establishes shared interfaces and scaffolding; Wave 1 feature tasks then run **in parallel**, each owning a disjoint set of files and coding against the Wave 0 contracts; Wave 2 integrates and hardens.
>
> **Audience:** an orchestrator agent + implementer subagents. Each task below is self-contained enough to hand to one agent. **Golden rule:** a task may only create/modify the files in its **Files owned** list. Shared files (`types.ts`, the router table, `App.svelte` nav) are touched **only** in Wave 0 or by the Wave 2 integrator (T2.1) — see the sanctioned create-then-supersede exceptions in §7.
>
> ### 🔒 SCOPE LOCK (hard, non-negotiable)
> Every file created, modified, moved, or deleted by **any** agent MUST be under **`/Users/suprith.gurudu/flashcards/`**. No agent may write to `~/`, any sibling directory, or any global/system location. Specifically: **no** edits to `~/.zshrc`/shell profiles, **no** global package installs, **no** `git` config outside the repo, **no** writes outside `flashcards/`. All `pnpm`/`npm`/`git`/`playwright` commands run with **cwd inside `flashcards/`** and write only into `flashcards/` (e.g. `flashcards/node_modules`, `flashcards/dist`). The transfer bundle is written to **`flashcards/flash.bundle`** (git-ignored), never `~/`. An agent that finds it would need to touch anything outside `flashcards/` must **stop and report**, not proceed.

---

## 0. Tech baseline (verify + **pin** versions at scaffold time)

| Thing | Choice | Notes |
|---|---|---|
| Language | **TypeScript** (strict) | `strict: true`, `noUncheckedIndexedAccess: true` |
| Framework | **Svelte 5** (runes: `$state`, `$derived`, `$effect`) | Plain Svelte, **not** SvelteKit — see §1 routing note. Stores use `.svelte.ts` runes-in-module. |
| Build | **Vite 8** | `base: '/'` (user site serves from root). Engine `^20.19 \|\| >=22.12`. **CI pins Node 22.x** (see T0.7). **[verify + fallback: §1 delta-7]** |
| PWA | **`vite-plugin-pwa`** (Workbox) | `registerType: **'prompt'**` (NOT silent autoUpdate — see §1 delta-6); precache app shell + all render assets. **Compatibility with Vite 8 / Rolldown is an explicit T0.2 gate.** |
| Storage | **IndexedDB** via **`idb`** (~1 KB) | `localStorage` only for theme bootstrap (avoid FOUC); everything else in IndexedDB. |
| Markdown | **`marked`** (pinned major) + **`DOMPurify`** | DOMPurify runs on the **final HTML**, not the Markdown. Sanitize ALL rendered card HTML. |
| Code highlight | **`highlight.js` core** + a small curated language set | **Locked** (not shiki — bundle/offline budget, §1 delta-8). Assets **precached** (no network-dependent lazy-load). |
| Unit tests | **Vitest** (+ `happy-dom` for DOM-touching tests) | Pure logic: scheduler, storage, backup, search, stats, time. DOMPurify XSS tests run under a real DOM env. |
| E2E tests | **Playwright** + **`@axe-core/playwright`** | Incl. **offline-reload** test, **SW-update** test, and a11y assertions. |
| Package mgr | **pnpm** | npm fine too |
| Deploy | **GitHub Actions** → Pages | `upload-pages-artifact` + `deploy-pages`; `environment: github-pages`; concurrency group `pages` |

> Machine has Node v25, npm 11, pnpm. **T0.1 must resolve and record the exact pinned versions in `README.md` and add `.nvmrc` + `engines`** so downstream agents read real numbers, not `[verify]`.

---

## 1. Architecture refinements & agreed deltas from DESIGN.md

These are the deltas from `DESIGN.md` §9. Deltas 4–6 are **new in Rev 2** and should be ratified by the user (they touch the design's stated behavior).

- **delta-1 — Plain Svelte 5 + Vite SPA, no SvelteKit.** Smaller/simpler; **fully sidesteps the GitHub Pages SPA-404 problem** via **hash-based routing** (`#/section/:id`). No server rewrites, no `404.html` hack. (Design listed `adapter-static`; this is the agreed simplification.)
- **delta-2 — `base: '/'`** because we deploy to a **user site** (`<username>.github.io`), served from root. The service worker registers at `/` with scope `/` — no subpath pitfalls.
- **delta-3 — State:** Svelte 5 runes. A single reactive store layer (`lib/stores/`) wraps the async `Store` (IndexedDB) and exposes reactive in-memory caches the views bind to (frozen API in **§3.6**). Views never call IndexedDB directly.
- **delta-4 — Binary grading in MVP.** `Grade = 'again' | 'good'` with keys **1 = Again, 2 = Good**. DESIGN §4.2 F-8 / §8 mention "1–4". Leitner only needs binary grades; **3–4 ease grades are reserved for the future SM-2 upgrade** (D-4 review log still captures everything needed). The §8 keyboard line is reconciled to 1/2 by this delta.
- **delta-5 — Import is REPLACE-only in MVP.** DESIGN §6 describes import as validated-JSON restore. A `merge` mode has too many undefined collision/dedup semantics to ship safely untested, so **`importAll` takes no mode and always replaces** (wipe + load, atomic). Cross-device *merge* is deferred post-MVP. This removes a data-integrity risk from the frozen contract.
- **delta-6 — Service-worker updates prompt, not silent.** `registerType: 'prompt'`. A new SW does **not** auto-reload mid-session (which could discard unsaved editor state on an offline-first app). Instead an in-app "Update available — reload" Toast lets the user reload at a safe point. E2E covers this path.
- **delta-7 — Build-tool fallback.** If `vite-plugin-pwa`/Workbox is not compatible with Vite 8 / Rolldown at scaffold time, fall back (in order): `rolldown-vite` compat mode → Vite 7 (still maintained) → hand-authored SW via Workbox CLI. This is decided at the **T0.2 gate**, before Wave 1 opens.
- **delta-8 — Highlighter locked to `highlight.js` core.** Honors the minimalist/small-bundle rationale and the offline-precache requirement (shiki's WASM/grammars are too heavy). Bundle budget asserted in T1.4.

**Accepted limitation (personal single-device use):** multiple open tabs of the installed PWA share one IndexedDB; the in-memory rune caches use last-write-wins and are not cross-tab synced. A `BroadcastChannel` sync is a possible post-MVP enhancement; not a v1 target. Noted so it isn't mistaken for a bug.

---

## 2. Target repository layout

```
flashcards/                      (repo root → becomes <username>.github.io)
├─ .github/workflows/deploy.yml
├─ index.html                    # includes CSP <meta> (§ T0.1)
├─ .nvmrc  package.json  tsconfig.json  vite.config.ts  svelte.config.js
├─ playwright.config.ts  .gitignore  README.md
├─ public/
│  ├─ manifest.webmanifest
│  └─ icons/  (icon-192.png, icon-512.png, icon-512-maskable.png, apple-touch-icon-180.png)
├─ src/
│  ├─ main.ts                    # mounts App, registers SW (prompt), requests persist()
│  ├─ App.svelte                 # shell: nav + <Router/> outlet  (SHARED — Wave 0 / T2.1 only)
│  ├─ router.ts                  # hash router: route store + param parser (SHARED — T0.1 creates skeleton, T2.1 wires routes)
│  ├─ lib/
│  │  ├─ types.ts                # ALL shared types/interfaces + constants  (SHARED — Wave 0 only)
│  │  ├─ db/        store.ts (idb impl), index.ts (Store interface), migrations.ts
│  │  ├─ scheduler/ index.ts (Scheduler iface + getScheduler), shuffle.ts, leitner.ts
│  │  ├─ markdown/  render.ts    # marked + DOMPurify + highlight.js
│  │  ├─ backup/    export.ts, import.ts, validate.ts
│  │  ├─ stores/    sections.svelte.ts, cards.svelte.ts, settings.svelte.ts, review.svelte.ts
│  │  ├─ a11y/      liveRegion.ts, focus.ts, shortcuts.ts
│  │  └─ util/      id.ts (uuid), shuffle.ts (Fisher–Yates), time.ts, tags.ts (normalize)
│  ├─ components/   Button.svelte, IconButton.svelte, Dialog.svelte, LiveRegion.svelte, Toast.svelte,
│  │                CardContent.svelte, FlipCard.svelte, TagChip.svelte, TagFilterBar.svelte, ConfirmDelete.svelte
│  ├─ views/        DeckList.svelte, SectionView.svelte, CardEditor.svelte, Review.svelte,
│  │                Search.svelte, Stats.svelte, Settings.svelte, Onboarding.svelte
│  └─ styles/       tokens.css, global.css
└─ tests/
   ├─ unit/         (Vitest, may also colocate *.test.ts next to source — owned by that source's task)
   └─ e2e/          offline.spec.ts, swupdate.spec.ts, a11y.spec.ts, smoke.spec.ts
```

---

## 3. Shared contracts (Wave 0 — frozen before Wave 1 starts)

These are the interfaces every parallel task codes against. **Do not change them in Wave 1.** Changing a §3 interface requires orchestrator sign-off and a re-broadcast to dependent tasks.

### 3.1 `src/lib/types.ts`

```ts
export type ID = string;
export type Grade = 'again' | 'good';   // MVP Leitner binary (keys 1/2). 1–4 ease reserved for future SM-2 (delta-4).
export type ReviewMode = 'shuffle' | 'leitner';
export type ThemePref = 'system' | 'light' | 'dark';

export type ReviewScope =
  | { kind: 'all' }
  | { kind: 'section'; id: ID }
  | { kind: 'tag'; tag: string };

export interface Section { id: ID; name: string; order: number; createdAt: number; }

export interface Card {
  id: ID;
  sectionId: ID;
  front: string;            // Markdown SOURCE (question)
  back: string;             // Markdown SOURCE (answer)
  tags: string[];           // normalized: lowercase, no '#', trimmed, de-duped (enforced by Store — §3.2)
  box: number;              // Leitner box 1..LEITNER_BOXES (1 = hardest / shortest interval)
  lastReviewed: number | null;
  dueDate: number;          // ms epoch. NEVER null. A new card is due immediately (dueDate = createdAt).
  createdAt: number;
  modifiedAt: number;       // bumped only on CONTENT edits (not on review — see recordReview)
}

export interface ReviewLogEntry {
  seq: number;              // store-assigned autoIncrement key; monotonic ⇒ chronological
  cardId: ID;
  ts: number;               // ms epoch when graded
  grade: Grade;
  mode: ReviewMode;         // scheduler that produced this review
  elapsedMs: number;        // ms from card-shown to grade (see §3.6 review store)
}

export interface Settings {
  id: 'singleton';
  theme: ThemePref;
  reviewMode: ReviewMode;
  lastBackupAt: number | null;
  onboardedAt: number | null;   // set once after first-run sample-deck seed (idempotency flag — T1.10)
  schemaVersion: number;
}

export interface BackupFile {
  app: 'flash';
  schemaVersion: number;
  exportedAt: number;
  sections: Section[];
  cards: Card[];
  reviewLog: ReviewLogEntry[];
  settings: Omit<Settings, 'id'>;
}

export interface ImportSummary { sections: number; cards: number; reviews: number; }

export const SCHEMA_VERSION = 1;
export const LEITNER_BOXES = 3;
export const CADENCE_DAYS: readonly number[] = [1, 3, 7]; // index = box-1; box1→1d, box2→3d, box3→7d
export const DAY_MS = 86_400_000;
```

> **Rev-2 contract fixes baked in:** `dueDate` is non-null (fixes the IndexedDB null-key index bug — new cards are indexable and due immediately); review log keyed by monotonic `seq`; explicit `CADENCE_DAYS` table (no `2^(box-1)` approximation; top interval is 7 days, not 4); `onboardedAt` gives T1.10 a typed home; `ReviewScope` is shared by router + review store.

### 3.2 `Store` interface (`src/lib/db/index.ts`)

```ts
export class StoreUnavailableError extends Error {}   // thrown when IndexedDB is blocked (e.g. private mode)

export type ValidateResult =
  | { ok: true; data: BackupFile }
  | { ok: false; error: string };

export interface Store {
  // sections (listSections ordered by `order`)
  listSections(): Promise<Section[]>;
  createSection(name: string): Promise<Section>;
  renameSection(id: ID, name: string): Promise<void>;
  deleteSection(id: ID): Promise<void>;        // cascade: section + its cards in ONE transaction. reviewLog is RETAINED (append-only is sacrosanct; orphan cardIds are acceptable for analytics).
  restoreSection(section: Section, cards: Card[]): Promise<void>;  // undo of deleteSection — re-puts by ORIGINAL ids in one transaction
  // cards
  listCards(sectionId?: ID): Promise<Card[]>;
  getCard(id: ID): Promise<Card | undefined>;
  createCard(input: Pick<Card,'sectionId'|'front'|'back'|'tags'>): Promise<Card>; // box=1, dueDate=createdAt, lastReviewed=null, tags normalized
  updateCard(id: ID, patch: Partial<Omit<Card,'id'|'createdAt'>>): Promise<Card>; // CONTENT edit: sets modifiedAt=now; tags normalized. Cannot patch id/createdAt.
  recordReview(id: ID, fields: Pick<Card,'box'|'lastReviewed'|'dueDate'>): Promise<Card>; // scheduler-driven update; does NOT bump modifiedAt
  deleteCard(id: ID): Promise<void>;
  restoreCard(card: Card): Promise<void>;      // undo of deleteCard — re-puts by ORIGINAL id
  searchCards(query: string): Promise<Card[]>; // case-insensitive SUBSTRING over raw front+back+tags; query normalized (trim, lowercase, strip leading '#'); unordered
  cardsByTag(tag: string): Promise<Card[]>;    // exact match on normalized tag
  dueCards(now: number, sectionId?: ID): Promise<Card[]>; // cards with dueDate <= now (all cards are scheduled; never null)
  allTags(): Promise<string[]>;                // sorted unique normalized tags
  // review log
  appendReview(entry: Omit<ReviewLogEntry,'seq'>): Promise<void>; // store assigns seq
  allReviews(): Promise<ReviewLogEntry[]>;     // returned in seq (chronological) order
  // backup — REPLACE-only (delta-5)
  exportAll(): Promise<BackupFile>;
  importAll(data: BackupFile): Promise<ImportSummary>; // validates schemaVersion===SCHEMA_VERSION; wipes all stores; loads atomically; preserves ids + seq
  // settings
  getSettings(): Promise<Settings>;            // returns defaults on first run
  updateSettings(patch: Partial<Omit<Settings,'id'>>): Promise<Settings>;
}

export function openStore(): Promise<Store>;   // singleton; rejects with StoreUnavailableError if IndexedDB is unavailable
```

**Tag normalization is a single chokepoint:** `createCard`/`updateCard` run every tag through `util/tags.ts#normalizeTag` (lowercase, strip leading `#`, trim, drop empties, de-dupe). Callers never need to normalize.

### 3.3 `Scheduler` interface (`src/lib/scheduler/index.ts`)

> **Owned in Wave 0 (T0.4)** — the interface + `getScheduler` signature must exist before Wave 1 (mirrors how T0.4 owns the `Store` interface). T1.3 implements `shuffle.ts` + `leitner.ts` + the `getScheduler` body.

```ts
export interface Scheduler {
  mode: ReviewMode;
  /** Order/select the cards to study this session. Pure. */
  buildQueue(cards: Card[], now: number): Card[];
  /** Given a grade, return the card-field updates to persist. Pure, deterministic. */
  next(card: Card, grade: Grade, now: number): Pick<Card,'box'|'lastReviewed'|'dueDate'>;
}
export function getScheduler(mode: ReviewMode): Scheduler;
```

**Exact, deterministic semantics (unit-testable — no approximations):**

- **shuffle.buildQueue** = Fisher–Yates (`util/shuffle.ts`) over all passed cards.
- **shuffle.next** = `{ box: card.box, lastReviewed: now, dueDate: card.dueDate }` — **only `lastReviewed` advances**; no scheduling change. (So "last studied" is correct in shuffle mode too; box/dueDate untouched.)
- **leitner.buildQueue** = `cards.filter(c => c.dueDate <= now)`, ordered **hardest-first**: ascending `box`, then ascending `dueDate`.
- **leitner.next**:
  - `good` → `newBox = Math.min(card.box + 1, LEITNER_BOXES)`
  - `again` → `newBox = 1`
  - returns `{ box: newBox, lastReviewed: now, dueDate: now + CADENCE_DAYS[newBox - 1] * DAY_MS }` (rolling 24h, **not** calendar-aligned).
- **New cards** are created with `box = 1, dueDate = createdAt` (in `Store.createCard`), so they are immediately due in both modes — and, because `dueDate` is a real number (never null), they are returned by the `by-due` index range scan.

### 3.4 Component contract: `CardContent.svelte`
Props **frozen** as `{ markdown: string }` → renders sanitized HTML (marked + DOMPurify on the final HTML + highlight.js). Owned by **T1.4**; **referenced** by T1.2/T1.3 (they import it and rely only on this prop shape). **T0.8 ships a self-contained passthrough stub** (no import of `lib/markdown/render.ts`, which doesn't exist until T1.4) so parallel tasks compile. T1.4 may change internals only — **never the prop signature**. (Create-then-supersede pair; see §7.)

### 3.5 a11y conventions (all UI tasks follow)
- Flip = real `<button>` with `aria-expanded`; answer container `hidden` until revealed; mirror revealed answer into the global `LiveRegion` (`aria-live="polite"`).
- Targets ≥ 44×44 CSS px; text contrast ≥ 4.5:1; visible `:focus-visible` ring (≥ 3:1).
- Gate motion behind `@media (prefers-reduced-motion)`.
- Never convey state by color alone; pair with text/icon.
- **Navigation convention:** Wave 1 views navigate by rendering plain `<a href="#/...">` hash links using the route shapes in §3.7 and read params from the `route` store. **Views never import/mutate `router.ts`** — T2.1 owns route registration.

### 3.6 `stores/*` reactive API (frozen — `src/lib/stores/`)
> The single biggest parallelism enabler: **five** Wave 1 tasks bind to these. Owned by **T0.5** (Wave 0); frozen before Wave 1. Implemented as Svelte 5 runes in `.svelte.ts` modules. Public surface (mutations call `Store` then update the reactive cache):

```ts
// sections.svelte.ts
export const sections: { value: Section[] };                 // reactive, ordered
export function loadSections(): Promise<void>;
export function addSection(name: string): Promise<Section>;
export function renameSection(id: ID, name: string): Promise<void>;
export function removeSection(id: ID): Promise<{ section: Section; cards: Card[] }>; // returns payload for undo
export function restoreSection(p: { section: Section; cards: Card[] }): Promise<void>;

// cards.svelte.ts
export function cardsOf(sectionId: ID): Card[];               // reactive getter from cache
export function loadCards(sectionId?: ID): Promise<void>;
export function addCard(input: Pick<Card,'sectionId'|'front'|'back'|'tags'>): Promise<Card>;
export function editCard(id: ID, patch: Partial<Omit<Card,'id'|'createdAt'>>): Promise<Card>;
export function moveCard(id: ID, sectionId: ID): Promise<Card>;   // F-4: reassign section (bumps modifiedAt)
export function removeCard(id: ID): Promise<Card>;            // returns deleted card for undo
export function restoreCard(card: Card): Promise<void>;

// settings.svelte.ts
export const settings: { value: Settings };                  // reactive
export const effectiveTheme: { value: 'light' | 'dark' };    // resolves 'system'; applied via [data-theme]
export function setTheme(p: ThemePref): Promise<void>;
export function setReviewMode(m: ReviewMode): Promise<void>;
export function markBackup(ts: number): Promise<void>;        // sets lastBackupAt
export function markOnboarded(ts: number): Promise<void>;     // sets onboardedAt
export function backupIsStale(now: number, days?: number): boolean; // lastBackupAt==null || now-lastBackupAt > days(default 14)*DAY_MS

// review.svelte.ts  (session state machine)
export function startSession(scope: ReviewScope, mode: ReviewMode): Promise<void>; // fetches scope cards → scheduler.buildQueue
export const current: { value: Card | null };
export const revealed: { value: boolean };
export const position: { value: { index: number; total: number } };
export const summary: { value: { reviewed: number; again: number; good: number } | null };
export function flip(): void;                                 // reveal answer; mirror to LiveRegion; clock for elapsedMs already running
export function grade(g: Grade): Promise<void>;               // scheduler.next → store.recordReview → store.appendReview({elapsedMs}) → advance
```
> `elapsedMs` clock starts when `current` is shown and stops at `grade()` (flip does **not** reset it). This populates the D-4 SRS-upgrade enabler with real timings.

### 3.7 Router contract (`src/lib/router.ts`)
- A reactive `route` store: `route.value = { path: string; params: Record<string,string> }`. T0.1 creates the store + hash-parser skeleton; T2.1 registers the table.
- **Route table** (T2.1 wires; Wave 1 views build against these strings):

  | Hash | View | Params |
  |---|---|---|
  | `#/` | DeckList | — |
  | `#/section/:id` | SectionView | `id` |
  | `#/new` | CardEditor (create) | — (section chosen in UI) |
  | `#/edit/:id` | CardEditor (edit) | `id` |
  | `#/review/:scope` | Review | `scope` (grammar below) |
  | `#/search` | Search | — |
  | `#/stats` | Stats | — |
  | `#/settings` | Settings | — |

- **`:scope` grammar** → parsed to `ReviewScope`: `all` → `{kind:'all'}`; `s:<sectionId>` → `{kind:'section'}`; `t:<tag>` → `{kind:'tag'}`. A `parseScope(s): ReviewScope` helper lives in `router.ts`.
- Views read params from `route.value.params`; deep-link refresh works (pure hash ⇒ no 404).

### 3.8 Backup module signatures (`src/lib/backup/`)
> Frozen so T1.11 (Settings) codes against these in parallel with T1.8, instead of taking a Wave1→Wave1 hard dependency.

```ts
// validate.ts
export function validateBackup(json: unknown): ValidateResult;   // checks app==='flash', schemaVersion===SCHEMA_VERSION, shape
// export.ts
export function exportBackup(store: Store): Promise<void>;       // build BackupFile → Blob download `flash-backup-YYYY-MM-DD.json` → markBackup(now)
// import.ts
export function importBackup(store: Store, file: File): Promise<ImportSummary>; // read → validateBackup → store.importAll (throws on invalid)
```

### 3.9 `TagFilterBar.svelte` prop contract (`src/components/`)
> Presentational, owned by **T1.6**, frozen props so T1.5/T1.1 can render it without editing T1.6's file or being blocked by it:

```ts
// Props: { tags: string[]; selected: string[]; onToggle: (tag: string) => void }
```
Renders `TagChip`s (one per tag) with pressed state for `selected`; pure, keyboard-operable, no store access.

---

## 4. Wave 0 — Foundation (must complete before Wave 1)

Run T0.1 → T0.3 first (they unblock everyone). T0.4–T0.8 may then run in parallel; T0.5 lands last (depends on the Store + Scheduler interfaces).

| Task | Title | Depends | Files owned | Done when |
|---|---|---|---|---|
| **T0.1** | Scaffold | — | `package.json`, `.nvmrc`, `tsconfig.json`, `vite.config.ts`, `svelte.config.js`, `index.html` (+ CSP `<meta>`), `playwright.config.ts`, `src/main.ts`, `src/App.svelte` (nav shell + outlet), `src/router.ts` (route store + `parseScope`, table empty), `.gitignore` | `pnpm dev` serves a blank shell; `pnpm build` emits `dist/`; TS strict passes; **resolved versions recorded in README**; **scaffold-gate: a trivial `$state` in a `.svelte.ts` module compiles & reacts** |
| **T0.2** | PWA shell + SW-update gate | T0.1 | `public/manifest.webmanifest`, `public/icons/*`, vite-plugin-pwa block in `vite.config.ts`, SW-update plumbing in `main.ts` region | Manifest `name:"Flash"`, `display:"standalone"`, theme color; **`registerType:'prompt'`**; SW precaches shell + render assets; Lighthouse "installable" passes; **GATE: prove `vite build` produces a working precached SW under the pinned Vite and reloads offline in a real browser — else trigger delta-7 fallback before Wave 1 opens** |
| **T0.3** | Shared types | — | `src/lib/types.ts` | Exactly §3.1 (incl. constants); compiles; no other file edits |
| **T0.4** | Storage + scheduler iface + utils | T0.3 | `src/lib/db/*`, `src/lib/scheduler/index.ts` (iface + `getScheduler` signature/stub), `src/lib/util/id.ts`, `src/lib/util/time.ts`, `src/lib/util/shuffle.ts`, `src/lib/util/tags.ts` | `Store` (§3.2) fully implemented over `idb`; object stores `sections/cards/reviewLog(keyPath:'seq',autoIncrement)/meta` w/ indexes `cards.by-section`, `cards.by-due`; cascade delete + `restore*` are single transactions; `openStore()` detects IndexedDB-unavailable → `StoreUnavailableError`; `time.ts` exports `now/DAY_MS/startOfLocalDay/isSameLocalDay/isDue(card,now)/daysBetweenLocal`; `tags.ts#normalizeTag`; **Vitest covers: CRUD, cascade (+ reviewLog retained), tag normalization, search substring, `dueCards(now)` returns a freshly-created card, export/import replace round-trip preserving ids+seq** |
| **T0.5** | State stores | T0.3, T0.4 | `src/lib/stores/*` | Implements §3.6 exactly; `settings` applies `[data-theme]`; optimistic cache updates; undo helpers re-create by original id; review session drives scheduler→recordReview→appendReview with `elapsedMs`; unit-tested where logic exists |
| **T0.6** | Tokens + base components | T0.1 | `src/styles/*`, `src/components/Button.svelte`, `IconButton.svelte`, `Dialog.svelte`, `LiveRegion.svelte`, **`Toast.svelte`**, `ConfirmDelete.svelte`, `src/lib/a11y/liveRegion.ts`, `src/lib/a11y/focus.ts` | Light/dark tokens via `prefers-color-scheme` + `[data-theme]` override; accessible Dialog (focus trap, Esc, restore focus); **`Toast` host = undo + update-available messages, configurable window (default 5s), `aria-live`**; global `LiveRegion` singleton; focus-ring styles |
| **T0.7** | CI + repo meta | T0.1 | `.github/workflows/deploy.yml`, `README.md` | Workflow: on push `main` → setup-node **pinned `22.x`**, `pnpm i --frozen-lockfile`, `pnpm build`, `upload-pages-artifact path:dist`, `deploy-pages`; perms `pages:write,id-token:write`; **`environment: github-pages`**; **`concurrency: {group: pages, cancel-in-progress: false}`**; README has dev/build/deploy + Add-to-Home-Screen steps |
| **T0.8** | CardContent stub | T0.3 | `src/components/CardContent.svelte` | Self-contained passthrough honoring §3.4 prop (NO import of `markdown/render.ts`), so T1.x compile before T1.4 lands |

**`main.ts` responsibilities (T0.1/T0.2):** mount `App`; register SW with **update prompt** wired to a `Toast`; call `navigator.storage?.persist?.()` once on first run (best-effort).

---

## 5. Wave 1 — Feature modules (PARALLEL)

All depend on Wave 0. Each owns disjoint files and uses `stores/` + §3 contracts. **No Wave 1 task edits `types.ts`, `router.ts`, or `App.svelte`.** Recommended: `isolation: worktree` per agent if parallelizing aggressively; otherwise disjoint ownership makes same-tree parallelism safe.

| Task | Title | Depends | Files owned | Acceptance criteria |
|---|---|---|---|---|
| **T1.1** | Sections + DeckList | W0 | `src/views/DeckList.svelte`, `src/views/SectionView.svelte` | List/create/rename/delete sections (ConfirmDelete + **Toast undo** via `removeSection`/`restoreSection`); list cards within a section; empty states; keyboard-operable. **DeckList hosts the backup-staleness banner** (`backupIsStale(now())` → "Back up your cards" CTA → triggers export). May render `TagFilterBar` (§3.9) in SectionView |
| **T1.2** | Card add/edit/delete/move | W0, T0.8 | `src/views/CardEditor.svelte`, `src/components/TagChip.svelte` | Create/edit/delete a card (front/back Markdown textareas + live preview via `CardContent`); **pick/change section = move (F-4), bumps `modifiedAt`** via `moveCard`/`editCard`; add/remove tags (TagChip); delete w/ confirm + **Toast undo** (`removeCard`/`restoreCard`) |
| **T1.3** | Review engine + UI | W0 | `src/lib/scheduler/shuffle.ts`, `src/lib/scheduler/leitner.ts`, `src/lib/scheduler/index.ts` body (impl only — iface frozen by T0.4), `src/views/Review.svelte`, `src/components/FlipCard.svelte` | `Scheduler` (§3.3) **exact semantics, heavily unit-tested** (assert lastReviewed advances in BOTH modes; leitner dueDate offsets = `CADENCE_DAYS`); FlipCard disclosure pattern (aria-expanded, LiveRegion, reduced-motion); Again/Good buttons drive `review.grade`; **`elapsedMs` recorded (shown→grade)**; session summary. **Swipe gestures explicitly DEFERRED post-MVP** (buttons are the contract) |
| **T1.4** | Markdown + code render | W0 (supersedes T0.8 stub) | `src/lib/markdown/render.ts`, `src/components/CardContent.svelte` | marked (pinned major) → **DOMPurify on final HTML**; fenced code highlighted via **highlight.js core** (assets precached, no network lazy-load); honors §3.4 prop. **XSS unit tests under happy-dom** (`<script>`, `onerror`, `javascript:`/`data:` URLs neutralized); **bundle-size assertion** |
| **T1.5** | Search / filter | W0 | `src/views/Search.svelte` | Query box → `store.searchCards` (debounced); results link to `#/edit/:id`; keyboard-navigable; may render `TagFilterBar` (§3.9) to filter by tag (`cardsByTag`) |
| **T1.6** | Tag filter bar | W0 | `src/components/TagFilterBar.svelte` | Self-contained presentational component per **§3.9 frozen props**; renders `TagChip`-style chips with pressed state; pure + unit-tested; **does not edit Search/SectionView** (they consume it) |
| **T1.7** | Stats / progress | W0 | `src/views/Stats.svelte` | Pure, unit-tested helpers using shared `time.ts#isDue`: **due-today** = cards `isDue(card, endOfLocalDay(now))`; **streak** = consecutive local-calendar days ending today (or yesterday if none yet today) each with ≥1 reviewLog entry; **mastery** (per section) = % of that section's cards with `box===LEITNER_BOXES`; per-box distribution. No color-only encoding |
| **T1.8** | Backup export/import | W0 | `src/lib/backup/*` (export/import/validate) | Implements §3.8; export → Blob `flash-backup-YYYY-MM-DD.json` download (works on iOS) + `markBackup`; import → `<input type=file>` → `validateBackup` → `store.importAll` (REPLACE); `validateBackup` returns discriminated result; **round-trip equality test** (export→import→export deep-equals) |
| **T1.9** | Keyboard shortcuts | W0 | `src/lib/a11y/shortcuts.ts`, `src/components/ShortcutHelp.svelte` | Global handler calling review-store actions: Space/Enter `flip`, ←/→ prev/next, **1=Again 2=Good** (3/4 reserved, delta-4); **suppressed when focus in input/textarea**; "?" opens accessible help dialog |
| **T1.10** | Onboarding + install prompt | W0 | `src/views/Onboarding.svelte`, `src/lib/util/sampleDeck.ts` | First-run: if `settings.onboardedAt==null`, seed a small sample deck then `markOnboarded(now())` (**idempotent via typed flag**); iOS-Safari-detected "Add to Home Screen" instructions card; dismissible |
| **T1.11** | Settings view | W0, §3.8 | `src/views/Settings.svelte` | Theme toggle (system/light/dark), review-mode toggle, storage estimate (`navigator.storage.estimate()`), **persist status with iOS feature-detection** (when `persist()` is unavailable — typical iOS — show "Install to Home Screen + back up" guidance, NOT a false "not persisted" warning; tolerate undefined quota), export/import buttons (call §3.8 `exportBackup`/`importBackup`), backup-staleness note. **Codes against §3.8 signatures — no hard wait on T1.8 internals** |

**Soft coupling notes:** (a) T1.4 supersedes the T0.8 stub — sanctioned (§7). (b) T1.1/T1.5 render `TagFilterBar` against §3.9; because the prop contract is frozen, they compile even before T1.6 merges (the bar simply appears once T1.6 lands). (c) T1.11 imports only §3.8 signatures, so it parallelizes with T1.8.

---

## 6. Wave 2 — Integration & hardening (after Wave 1)

| Task | Title | Depends | Files owned | Done when |
|---|---|---|---|---|
| **T2.1** | Routing & nav integration | all W1 | `src/router.ts` (route table), `src/App.svelte` (nav) | §3.7 routes wired; accessible nav (current-page `aria-current`); deep-link refresh works (hash → no 404); confirms views read params from `route` store |
| **T2.2** | Accessibility audit | T2.1 | `tests/e2e/a11y.spec.ts` + targeted fixes in offending components | `@axe-core/playwright` zero serious/critical on every view; manual VoiceOver pass on flip/grade/nav; contrast + target-size verified light & dark |
| **T2.3** | Offline + PWA E2E | T2.1, T0.2 | `tests/e2e/offline.spec.ts`, `tests/e2e/swupdate.spec.ts`, `tests/e2e/smoke.spec.ts` | Build+preview, create data, `setOffline(true)`, **reload**, assert app + data work; **SW-update path**: new SW → "update available" Toast → reload picks up new assets without data loss; manifest/SW/installability assertions; smoke covers CRUD→review→backup loop |
| **T2.4** | Finalize + handoff | all | `README.md` updates, initial git history | `git init` (inside `flashcards/`); `.gitignore` excludes `node_modules`,`dist`,`*.local`,`flash.bundle`; conventional initial commit(s); produce **`flashcards/flash.bundle`** via `git bundle create flash.bundle --all` for transfer (stays inside scope-lock; DESIGN §"transfer") |

---

## 7. Parallelization & conflict-avoidance rules

1. **Wave gate:** no Wave 1 task starts until **all** Wave 0 tasks are merged, the **T0.2 SW-update gate** is green, and `pnpm build` + typecheck pass.
2. **Disjoint ownership:** every file appears in exactly **one** task's "Files owned", **except** the three sanctioned create-then-supersede pairs below.
3. **Sanctioned shared-file exceptions** (not races — strictly sequenced):
   - `types.ts` — **Wave 0 only** (T0.3).
   - `CardContent.svelte` — T0.8 creates stub → **T1.4 is sole long-term owner** (may change internals only; §3.4 prop frozen).
   - `router.ts` + `App.svelte` — **T0.1 creates skeleton → T2.1 wires** (no Wave 1 task touches them).
   - `scheduler/index.ts` — **T0.4 owns the interface/`getScheduler` signature** → **T1.3 fills the body** (interface frozen).
4. **Extension points, not edits:** a Wave 1 view that needs a nav entry does **not** edit `App.svelte`; it exports a default component — T2.1 adds the route/nav link. Views navigate via `<a href="#/...">` (§3.5), never by importing `router.ts`.
5. **Contracts are frozen:** changing a §3 interface requires orchestrator sign-off and a re-broadcast to dependent tasks.
6. **Optional worktrees:** if running >4 implementers concurrently, give each Wave 1 task `isolation: worktree` and integrate sequentially; otherwise same-tree is fine given rule 2.
7. **Per-task DoD:** TS strict passes · its unit tests pass · no console errors · a11y conventions (§3.5) honored · only owned files changed (modulo rule 3).

---

## 8. Definition of Done (whole project)

- [ ] `pnpm build` clean; TS strict; no runtime console errors.
- [ ] All MVP features (DESIGN §D-8): sections, card CRUD **+ move**, shuffle + Leitner review w/ binary grading, search, tags, stats, Markdown/code, JSON export/import, dark mode, keyboard shortcuts, sample deck.
- [ ] Review log written on every grade **with real `elapsedMs`** (enables future SM-2/FSRS).
- [ ] A freshly-created card appears in a review session in both modes (regression guard for the dueDate/index fix).
- [ ] Offline E2E passes (reload while offline works); **SW-update E2E passes** (update prompt → reload, no data loss).
- [ ] axe: zero serious/critical; VoiceOver smoke pass.
- [ ] Backup export→import round-trips losslessly (schema-validated, ids + seq preserved).
- [ ] **Backup-staleness banner surfaces on DeckList** (not only Settings).
- [ ] `persist()` requested; storage estimate shown in Settings with correct iOS messaging.
- [ ] **IndexedDB-unavailable (private mode) surfaces a clear "storage unavailable" state**, not an uncaught throw.
- [ ] CSP `<meta>` present; DOMPurify sanitizes rendered card HTML (XSS tests pass).
- [ ] Deploy workflow green (`environment: github-pages`, concurrency group); site loads at `https://<username>.github.io/`; installs to iPhone home screen and runs offline.
- [ ] `~/flash.bundle` produced for hand-off.

---

## 9. Deploy runbook (on personal laptop, after transfer)

1. Create a **public** repo named exactly **`<username>.github.io`** on github.com.
2. `git clone ~/flash.bundle flash && cd flash` → set remote to the new repo → `git push -u origin main`.
3. Repo **Settings → Pages → Source = GitHub Actions**.
4. Push triggers `deploy.yml` (targets `github-pages` environment); wait for the green deploy.
5. Visit `https://<username>.github.io/` → on iPhone **Safari → Share → Add to Home Screen**.
6. Verify offline: enable Airplane Mode, open the home-screen icon — it should load and show your data.

---

## 10. Suggested orchestration (for the agent that runs this)

```
Phase A (sequential): T0.1 → T0.3 → [T0.2, T0.4, T0.6, T0.7, T0.8 in parallel] → T0.5
  GATES: scaffold runes-in-module check (T0.1) · SW-update/offline build gate (T0.2) · build + typecheck green
Phase B (parallel): early sub-batch [T1.6 (TagFilterBar), T1.4 (CardContent)] then full fan-out
  T1.1 … T1.11   (each: implement → unit test → self-check DoD)
  Note: T1.1/T1.5 consume §3.9 TagFilterBar; T1.11 consumes §3.8 backup signatures — all frozen, so true parallel.
  gate: all merged, build green
Phase C (sequential): T2.1 → [T2.2, T2.3 parallel] → T2.4
Phase D: review pass (code-review agent) → fix → final DoD checklist
```

> Keep the human in the loop at the **Phase A T0.2 gate** (confirm PWA/offline works on the pinned stack), the **Phase B→C gate** (review the running app), and **before the final commit/bundle**.

---

## 11. Autonomous overnight run (no human-in-the-loop)

When run unattended, the human gates in §10 are **replaced by automated gates + an adversarial review pass**, and a morning checklist is produced. No human approval is requested mid-run.

**Automated gates (each is an agent that runs commands inside `flashcards/` and returns structured pass/fail + errors; on fail, a fixer agent loops up to N times before recording the failure and continuing):**

- **G0 — Wave 0 gate:** `pnpm install` resolved once in T0.1 (all §0 deps up front — parallel tasks never install); then `pnpm build`, typecheck (`svelte-check`/`tsc`), Wave 0 unit tests, **and the PWA/offline build check** (build → preview → assert SW + precache manifest emitted, app loads offline). **If the PWA check fails → auto-apply delta-7 fallback** (rolldown-vite compat → else pin Vite 7 → else Workbox-CLI SW) and re-gate. Wave 1 does not start until G0 is green.
- **G1 — Wave 1 gate:** `pnpm build` + typecheck + **all** unit tests green. Fixer loop on failures.
- **G2 — Wave 2 gate:** Playwright E2E (offline-reload, SW-update, smoke) + `@axe-core/playwright` (zero serious/critical). Fixer loop.
- **G3 — Adversarial review pass:** multi-lens `code-review` agents over the built app vs the §3 contracts; **critical/major** findings are fixed automatically and re-gated; minor/nit findings are logged to the report, not fixed.

**Morning artifacts (written to `flashcards/docs/`):**
- **`BUILD_REPORT.md`** — what was built per task, each gate's outcome (incl. whether delta-7 fallback triggered and why), full test/lint/axe results, bundle size, and any task that failed its fixer loop (with the error) so nothing is silently dropped.
- **`CHECKLIST.md`** — the §8 Definition-of-Done as a tickable list with each item marked ✅/⚠️/❌ from the actual gate results, plus the §9 deploy runbook to follow on the personal laptop, and a short "things to eyeball" list (visual/VoiceOver items a machine can't fully self-certify).

**Stop conditions (the run halts and reports rather than thrashing):** a gate's fixer loop exhausts its retries; a required dependency fails to install; or any action would require touching a path outside `flashcards/` (scope-lock violation). In every halt case the partial state is committed locally and the report explains exactly where it stopped and why.

**Unattended prerequisite:** the session must run in a permission posture that **auto-approves tool calls** (file writes + `pnpm`/`git`/`playwright` in `flashcards/`). If approvals are required, the run will pause at the first command and wait — defeating the overnight goal. Nothing leaves the machine (no push, no deploy); those remain manual on the personal laptop per §9.
