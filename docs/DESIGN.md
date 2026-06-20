# Flashcards Tool — Design Document

> **Status:** Design approved 2026-06-19 · **Name:** **Flash** · Execution deltas ratified (binary grading, replace-only import, prompt-to-update SW — see `EXECUTION_PLAN.md` §1)
>
> This document captures requirements, key decisions, and rationale. It is **not** the implementation plan. Once we agree it's solid, a separate `EXECUTION_PLAN.md` will be written to hand off to implementation agents.
>
> Recommendations below are fact-checked against a mid-2026 research pass (GitHub Pages terms, Apple Developer terms, iOS Safari storage behavior, spaced-repetition algorithms, and stack tooling versions). Time-sensitive facts are flagged **[verify at build]**.

---

## 1. Summary & vision

A **minimalist, ad-free, subscription-free flashcards study tool** that runs entirely on your own device. You create cards, organize them into sections, and review them. No accounts, no servers, no tracking, no internet required after first load — your data never leaves your device.

The central design insight that resolves your "app **or** website — maybe both" question:

> **Build one Progressive Web App (PWA).** A PWA *is* both. It's a free static website (hosted on GitHub Pages) **and** an installable, full-screen, offline app on your iPhone's home screen — with no Apple Developer fee and no App Store. One codebase, both form factors.

---

## 2. Goals & non-goals

**Goals**
- Add / edit / delete cards (your core requirement).
- Group cards into sections/decks.
- Review mode with randomized order (+ a smarter spaced-repetition option).
- Minimalist, distraction-free UI.
- Fully **local-first**: all data created and stored on-device; works **offline**; no external service, account, or backend.
- Excellent on **mobile**, and **accessible** (WCAG 2.2 AA).
- **Free** to host and run, forever.

**Non-goals (at least for v1)**
- Cloud sync / multi-device auto-sync (this is the one thing local-first explicitly trades away — handled instead by manual JSON export/import; see §6).
- Accounts, social features, sharing servers, leaderboards.
- Ads, analytics, telemetry, monetization.
- A native-Swift iOS app (the PWA covers the iPhone use case).
- **App Store distribution** (decided: personal use only — install via home screen; no Capacitor, no $99 fee). Revisit only if you later want to share it.
- **Images in cards** (decided: text + Markdown/code only for now; revisit if needed — would store Blobs in IndexedDB).

---

## 3. Answers to your two open questions

### Q1 — "Is it possible to develop and deploy an iOS app easily?"

**Yes — the easy, free path is a PWA installed via Safari's "Add to Home Screen."** It gives a real full-screen app icon, works offline, and stores data on-device. **No Apple Developer account, no fee, no App Store review.** This is the recommended approach.

If you later want it *in the App Store* (discoverability, frictionless install for others), that path exists but is **not** "easy/free":

| iOS path | Cost | Effort | Notes |
|---|---|---|---|
| **PWA → Add to Home Screen** ✅ recommended | **Free** | Trivial | Full-screen, offline, on-device storage. No Apple account. |
| Capacitor wrap → App Store | **$99/yr** Apple Developer Program **[verify at build]** | Medium | Reuses the same web code in a WKWebView shell; needs your Mac + Xcode + App Review (thin-wrapper rejection risk under guideline 4.2). |
| TestFlight (beta distribution) | $99/yr | Medium | Still requires the paid program. |
| Free sideload (Xcode personal team / AltStore) | Free | High/chore | Signature **expires every 7 days**; max ~10 App IDs at once, 3 devices. AltStore PAL (no expiry) is **EU/Japan only** — not viable in the US. |
| Native Swift | $99/yr for App Store | High | ~Zero reuse of web code. Unjustified for this feature set. |

**Verdict:** Ship the PWA. Keep "Capacitor + App Store" as a clearly-scoped *optional later milestone*, only if you decide you want App Store presence.

> ⚠️ One consequence: true **web push notifications** require a server (VAPID), which conflicts with local-first. So review reminders should use the **local Notifications API + local scheduling**, not remote push. (Web push on iOS also needs 16.4+ *and* home-screen install.)

### Q2 — "Can I host it as a GitHub Page or something for free?"

**Yes.** GitHub Pages hosts static sites free with automatic HTTPS (required for PWA service workers). Verified mid-2026 limits — all far above what this app needs:

- Published site ≤ **1 GB** (hard); **100 GB/month** bandwidth (soft); **10 builds/hour** (soft, and *doesn't apply* when deploying via GitHub Actions). **[verify at build]**
- Free Pages requires a **public repo** — fine here: the repo holds only non-sensitive static HTML/CSS/JS; all your card data lives in the browser on-device, never in the repo.
- Commercial-use is restricted, but a personal study tool is clearly non-commercial.

**One real gotcha:** a *project* site serves from a subpath (`https://<you>.github.io/<repo>/`), which complicates routing and the service-worker scope. Two clean fixes:
1. **Use a user site** — a repo named `<you>.github.io` serves from root `/` and avoids the whole class of subpath bugs. **(Recommended.)**
2. Or set the bundler `base`, manifest `scope`/`start_url`, and SW registration all to `/<repo>/`, and use hash routing or a `404.html` SPA bootstrap.

**Free alternatives** if you ever outgrow Pages: **Cloudflare Pages** (unlimited bandwidth, root serving, native SPA fallback — the strongest free option), Netlify (now credit-based), Vercel (Hobby = non-commercial only). **[verify at build]** For this app, GitHub Pages is the simplest and entirely sufficient.

---

## 4. Functional requirements

### 4.1 Core (your stated requirements) — MVP

| ID | Requirement | Notes |
|---|---|---|
| F-1 | **Add a card** | Front (question) + back (answer). Markdown supported (§7). |
| F-2 | **Edit a card** | In-place edit of front/back/section. |
| F-3 | **Delete a card** | With confirmation + brief undo. |
| F-4 | **Sections/decks** | Cards belong to a named section. Create/rename/delete sections; move cards between them. |
| F-5 | **Review — randomized** | Shuffle (Fisher–Yates) a section (or all) and step through; flip to reveal answer. Zero-config mode. |
| F-6 | **Minimalist UI** | Clean typography, generous whitespace, no clutter. See §8. |

### 4.2 Suggested additional features (for your review — pick what you want)

Marked **[MVP]** = I'd include in v1, **[v1.1]** = fast follow, **[later]** = nice-to-have.

| ID | Feature | Tier | Why |
|---|---|---|---|
| F-7 | **Smart review (Leitner 3-box)** | [MVP] | Real spaced repetition for tiny extra state (`box`, `lastReviewed`). Reviews hard cards more, easy cards less. Toggle vs. plain shuffle. |
| F-8 | **Self-grading buttons** (Again / Good) | [MVP] | Feeds the Leitner engine; the core study loop. MVP is **binary** (keys 1/2); a 1–4 ease scale is reserved for the future SM-2 upgrade. |
| F-9 | **JSON export / import** | [MVP] | **Critical** — the only backup & device-transfer mechanism for local-only data (§6). Not optional. |
| F-10 | **Markdown + code rendering** | [MVP] | You're an engineer — code blocks, formatting, lists in cards. Sanitized with DOMPurify (§7). |
| F-11 | **Search / filter cards** | [MVP] | Find a card across sections. |
| F-12 | **Tags** (cross-cutting labels) | [MVP] | Orthogonal to sections; study "all `#sql` cards." |
| F-13 | **Progress / stats** | [MVP] | Cards due, streak, per-section mastery. Motivating, fully local. |
| F-14 | **Dark mode** | [MVP] | Respects `prefers-color-scheme` + manual toggle. |
| F-15 | **Keyboard shortcuts** | [MVP] | Space=flip, ←/→=prev/next, 1=Again 2=Good. Desktop power-use + accessibility. |
| F-16 | **Local study reminders** | [later] | Notifications API + local scheduling (no server). iOS needs home-screen install. |
| F-17 | **Study session config** | [v1.1] | "20 cards", "only due", "cram mode". |
| F-18 | **Sample deck on first run** | [MVP] | Empty-state onboarding so the app isn't blank. |
| F-19 | **CSV / Anki import** | [later] | Bulk-create from existing material. Anki `.apkg` is complex — defer. |
| F-20 | **SM-2 → FSRS upgrade** | [later] | Advanced scheduling. Enabled cheaply *if* we capture a review log from day one (see §6, decision D-4). |

> **Key enabler:** even in the MVP we should write an **append-only review log** (`{cardId, timestamp, grade, elapsedMs}`). It costs almost nothing now and is the single thing that lets us later add SM-2 or FSRS with **no data migration**. Strongly recommended.

---

## 5. Architecture & deployment

```
┌─────────────────────────────────────────────────────────┐
│  Your device (phone / laptop) — everything runs here     │
│                                                          │
│   ┌──────────────┐   reads/writes   ┌──────────────────┐ │
│   │  PWA (UI)    │ ───────────────► │  IndexedDB        │ │
│   │  Svelte+TS   │ ◄─────────────── │  decks/cards/log  │ │
│   │  Service     │                  └──────────────────┘ │
│   │  Worker      │     export/import ▲                    │
│   │  (offline    │                   │ JSON file          │
│   │   app shell) │                   ▼ (manual backup)    │
│   └──────────────┘            Files app / AirDrop /       │
│         ▲                     iCloud Drive (user-driven)  │
└─────────┼────────────────────────────────────────────────┘
          │ first load only (static assets, then cached)
          ▼
   GitHub Pages (free static host, HTTPS)
```

- **No backend.** GitHub Pages only ever serves immutable static files, and only on first load / update check. After that the service worker serves everything from cache — the app is fully offline and the host never sees your data.
- **PWA = both form factors.** Same build is the website and the installable home-screen app.
- **Optional later:** wrap the identical web build with **Capacitor** for an App Store submission ($99/yr). No rewrite.

---

## 6. Data model & persistence (non-functional: local-first)

**Storage engine: IndexedDB** (via a thin wrapper — `idb` ~1 KB, or `Dexie` ~25 KB for query/migration ergonomics; decision D-3). `localStorage` only for tiny UI prefs (theme, last-opened section, last-backup time).

**Object stores**
- `sections` — `{ id, name, createdAt, order }`
- `cards` — `{ id, sectionId, front, back, tags[], box, lastReviewed, createdAt, modifiedAt }` (indexed by `sectionId` and by due date)
- `reviewLog` — append-only `{ id, cardId, ts, grade, elapsedMs }` (the SRS-upgrade enabler)
- `meta` — schema version, settings

**Durability — the honest truth about browser storage (verified mid-2026):**
- Safari/WebKit's tracking prevention **deletes all script-writable storage after 7 days of Safari use with no interaction with your site.** This is the single biggest risk for a local-only app.
- **Mitigation 1 (strong, documented):** A PWA **installed to the Home Screen is explicitly exempt** from that 7-day eviction. → We will actively prompt "Add to Home Screen" on iOS.
- **Mitigation 2 (best-effort):** call `navigator.storage.persist()` on first use (granted heuristically — not guaranteed).
- **Mitigation 3 (the real guarantee):** **JSON export/import is the actual backup.** Treat the browser as untrusted for durability. We'll prompt periodic backups (e.g., when last backup > N days) and offer one-tap export.
- **Capacity** is a non-issue: installed PWAs get ~60% of disk; thousands of text cards are trivial.

**Backup / cross-device (no cloud sync by design):**
- Export = download a single JSON file (Blob + `<a download>`) — works everywhere incl. iOS.
- Import = `<input type="file">` + validated `JSON.parse`, with a `schemaVersion` field for forward-compat. **MVP import is replace-only** (validate → wipe → load, atomic); a cross-device *merge* mode is deferred post-MVP (its collision/dedup semantics are too easy to get wrong to ship untested).
- Move between devices manually via AirDrop / iCloud Drive / email the file.
- ⚠️ The **File System Access API** (save-back-to-same-file) is **not supported on iOS** — we use plain download/upload, not file pickers. (Optional desktop-Chromium enhancement only.)

---

## 7. Review engine (the revision feature)

A pluggable scheduler behind one interface — `nextDue(card, grade)` — so we can upgrade the algorithm without touching the UI.

| Algorithm | Per-card state | Verdict |
|---|---|---|
| **Shuffle** (random) | none | **MVP** — always-available zero-config mode (your stated requirement). |
| **Leitner (3 boxes)** | `box`, `lastReviewed` | **MVP default "smart" mode** — true spaced repetition, trivially explainable, minimal state. |
| SM-2 (classic Anki) | ease, interval, reps, due | [later] — finer per-card intervals; adds graded buttons. |
| FSRS-6 (modern) | stability, difficulty, full review history | [later] — best efficiency; needs the review log + a JS/WASM optimizer. **[verify lib at build]** |

> Industry context **[verified]**: Anki (26.05, mid-2026) still defaults to SM-2 with FSRS-6 opt-in. We mirror that trajectory: start simple, keep the door open. Capturing `reviewLog` from day one makes Shuffle → Leitner → SM-2 → FSRS a pure read of existing data.

---

## 8. UI / UX, accessibility & mobile

**Minimalist principles:** one primary action per screen, large readable type, no chrome you don't need, content-first.

**Accessibility (WCAG 2.2 AA — verified current standard mid-2026):**
- A card is a **disclosure widget**, not a button: question always visible; answer in a container that's hidden until reveal. Flip via a real `<button>` ("Show answer") with `aria-expanded`; announce the reveal through an `aria-live="polite"` region (don't rely on the visual flip alone).
- **Keyboard:** Space/Enter = flip, ←/→ (or P/N) = prev/next, **1 = Again, 2 = Good** (3–4 reserved for the future SM-2 upgrade). Shortcuts suppressed while typing in an input. Documented in an accessible help dialog.
- **Motion:** gate the 3D flip behind `prefers-reduced-motion`; fall back to instant swap / opacity cross-fade.
- **Contrast/targets:** text ≥ 4.5:1, UI ≥ 3:1; touch targets ≥ 24×24 CSS px (AA), prefer **44×44** (Apple HIG / AAA). Never signal correct/incorrect by color alone — pair with text/icon. Visible `:focus-visible` ring.
- **Focus management:** keep focus sensible across flip/next; never strand focus on hidden content.

**Mobile:** thumb-zone primary controls (bottom), swipe as an *enhancement* layered over visible buttons (never the only input), responsive layout, large tap targets, scrollable card body for long content.

**Dark mode:** `prefers-color-scheme` + manual override; re-check contrast in both themes.

**Rich content:** render Markdown with **DOMPurify** sanitization (cards may be imported from shared files → XSS hygiene even locally); syntax-highlight code in `<pre><code>`.

---

## 9. Recommended tech stack

| Layer | Choice | Rationale |
|---|---|---|
| **Framework** | **Svelte 5 + TypeScript** | Compiles away its runtime → smallest bundle for a multi-screen interactive app; ergonomic, good a11y patterns. |
| **Build** | **Vite 8** (+ `@sveltejs/adapter-static`) | Static prerender → plain files for Pages. Vite 8 needs Node `^20.19 \|\| >=22.12`. **[verify version at build]** |
| **PWA** | **`vite-plugin-pwa`** (Workbox) | One plugin → manifest + service worker + offline precache of the app shell. `registerType: 'prompt'` — a new version surfaces an in-app "reload to update" prompt rather than silently swapping assets mid-session (avoids losing unsaved editor state on an offline-first app). |
| **Storage** | **IndexedDB** via `idb` or `Dexie` | See D-3. |
| **Markdown** | a small MD parser + **DOMPurify** | Safe rich cards. |
| **Tests** | **Vitest** (shuffle/SRS/storage logic) + **Playwright** (E2E incl. an explicit offline-reload test) + **@axe-core/playwright** (a11y) | Logic is pure/unit-testable; offline + a11y are the risk areas to test directly. |
| **CI/Deploy** | **GitHub Actions** → `upload-pages-artifact` + `deploy-pages` | Push to `main` auto-deploys. Avoids the 10-builds/hr Jekyll limit. |

**Fallback:** **vanilla TypeScript + Vite** if you'd rather have zero framework dependency / maximal longevity — at the cost of hand-rolling routing and (importantly) accessible focus management. **Preact** is a middle option if you prefer JSX/hooks.

> Your Mac already has Node v25, npm 11, and pnpm — comfortably above tooling minimums. **[noted by research]**

---

## 10. Milestone sketch (detailed plan comes later)

1. **M0 — Scaffold:** repo, Svelte+Vite+TS, PWA plugin, GitHub Actions deploy, "hello offline" verified on phone.
2. **M1 — Core CRUD:** sections + cards (add/edit/delete), IndexedDB layer, minimalist shell. _(F-1…F-4)_
3. **M2 — Review:** shuffle mode + flip + Leitner + grading + review log. _(F-5, F-7, F-8)_
4. **M3 — Durability:** JSON export/import, `persist()`, Add-to-Home-Screen prompt, backup nudges. _(F-9)_
5. **M4 — Find & track:** search/filter, tags, progress/stats. _(F-11, F-12, F-13)_
6. **M5 — Polish:** Markdown/code, dark mode, keyboard shortcuts, a11y audit, sample deck. _(F-10, F-14, F-15, F-18)_
7. **Later:** local reminders; SM-2/FSRS; CSV/Anki import. (App Store ruled out — personal use.)

---

## 11. Decisions (locked 2026-06-19)

| # | Decision | Choice |
|---|---|---|
| **D-1** | Form factor | ✅ **Single PWA, personal use** — installable home-screen app + website. No App Store, no Apple fee. |
| **D-2** | Host | ✅ **GitHub Pages, user site `<you>.github.io`** (serves from root `/`, avoids subpath/SW bugs). |
| **D-3** | IndexedDB wrapper | ✅ **`idb`** (~1 KB, minimal) — matches the lean/minimalist goal. Easy to swap to `Dexie` later if queries/migrations grow. |
| **D-4** | Capture review log in MVP | ✅ **Yes** — append-only `reviewLog` from day one enables SM-2/FSRS later with no migration. |
| **D-5** | Framework | ✅ **Svelte 5 + TypeScript.** |
| **D-6** | MVP review modes | ✅ **Shuffle + Leitner (3-box) + self-grading.** |
| **D-7** | Card content | ✅ **Text + Markdown/code** (DOMPurify-sanitized). No images in v1. |
| **D-8** | v1 feature set | ✅ Core CRUD + sections + shuffle + JSON backup, **plus** smart review (F-7/F-8), Markdown/code (F-10), **search/filter (F-11), tags (F-12), progress/stats (F-13)**, dark mode (F-14), keyboard shortcuts (F-15), sample deck (F-18). Deferred → local reminders (F-16), SM-2/FSRS (F-20), CSV/Anki import (F-19). |

## 12. Remaining open questions

- **O-1 — Name.** ✅ Resolved: **Flash** (app title + PWA manifest `name`).
- **O-5 — GitHub username + public-repo OK?** A user site lives in a repo named `<username>.github.io`, served at `https://<username>.github.io/`. Free Pages needs it **public** — fine here (repo holds only non-sensitive static code; your card data never leaves the device). Needed only at push time on your personal laptop. Confirm your username, that the user-site repo is free for use (you can only have one), and that public source is OK.

_(O-1, O-2, O-3, O-4 resolved → see name above and Decisions D-1, D-7, D-8. Only O-5 remains, and only at push time.)_

---

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Browser eviction wipes local data | Home-screen install (exempt) + `persist()` + **JSON backups as the real guarantee** + backup nudges |
| Service worker / subpath misconfig breaks offline on Pages | Use root-serving user site; explicit Playwright offline-reload test |
| No cloud sync = device loss = data loss | Export/import + periodic backup prompts; document the workflow |
| Time-sensitive facts drift (fees, limits, tool versions) | All flagged **[verify at build]**; re-confirm during M0 |
| XSS via imported card Markdown | DOMPurify sanitization on all rendered card content |

---

_Next step after we agree on this design: I'll write `EXECUTION_PLAN.md` — a task-decomposed, parallelizable plan to hand off to implementation agents._
