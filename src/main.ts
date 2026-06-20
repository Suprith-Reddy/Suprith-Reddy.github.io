import './styles/global.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { loadSettings } from './lib/stores/settings.svelte';

// Frame-busting guard (clickjacking defense). CSP `frame-ancestors` is a no-op via
// <meta> and GitHub Pages cannot set HTTP headers, so we enforce frame protection
// here: if we are embedded in a frame, break out to the top-level window.
try {
  if (window.self !== window.top && window.top) {
    window.top.location.href = window.self.location.href;
  }
} catch {
  // Cross-origin framing throws on accessing window.top.location; best-effort.
}

const target = document.getElementById('app');
if (!target) {
  throw new Error('#app mount target not found');
}

const app = mount(App, { target });

// Apply the persisted theme on every load (§3.6). loadSettings() reads the stored
// Settings and calls applyTheme() to set <html data-theme>, so a user who chose
// 'light'/'dark' keeps it across reloads instead of falling back to OS-only.
// Best-effort: a StoreUnavailableError (e.g. private mode) leaves the OS default.
void loadSettings().catch(() => {
  /* no-op: storage unavailable — fall back to prefers-color-scheme default */
});

// Best-effort durable storage on first run (Mitigation 2, DESIGN §6).
// Safe to call repeatedly; ignore failures (unsupported / denied).
void navigator.storage?.persist?.().catch(() => {
  /* no-op: persistence is best-effort */
});

// ── Service worker registration (update PROMPT, delta-6) ──────────────────────
// T0.2 owns this region. We register the Workbox SW via vite-plugin-pwa's virtual
// module with registerType:'prompt' — a new SW is NOT auto-applied mid-session
// (which could discard unsaved editor state). Instead we surface an in-app
// "Update available — reload" affordance via the global Toast host (T0.6) and only
// activate + reload when the user accepts.
//
// Decoupling: T0.2 must not import T0.6's Toast file (separate ownership), and the
// Toast host may mount after this code runs. So we bridge through a DOM CustomEvent
// (`flash:sw-update`) on `window`: the Toast host listens for it and calls
// `detail.reload()` when the user clicks the update action. We also expose
// `window.__flashApplyUpdate` as a programmatic fallback (used by the SW-update E2E,
// T2.3) in case no Toast host is mounted.
//
// The import is wrapped so the scaffold/unit-test/dev environments — where the
// `virtual:pwa-register` module is only provided by the PWA plugin at build time —
// never crash if it is unavailable.
declare global {
  interface Window {
    __flashApplyUpdate?: () => void;
  }
  interface WindowEventMap {
    'flash:sw-update': CustomEvent<{ reload: () => void }>;
  }
}

async function registerServiceWorker(): Promise<void> {
  // Only meaningful in browsers that support SW and in the built app where the
  // PWA virtual module exists. Guard so dev/test/no-SW environments are no-ops.
  if (!('serviceWorker' in navigator)) return;
  try {
    const { registerSW } = await import('virtual:pwa-register');
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        // A new SW is waiting. Surface a prompt; reload (which calls
        // updateSW(true) → skipWaiting + reload) happens only on user accept.
        const reload = () => {
          void updateSW(true);
        };
        window.__flashApplyUpdate = reload;
        window.dispatchEvent(
          new CustomEvent('flash:sw-update', { detail: { reload } })
        );
      },
      onOfflineReady() {
        // App shell is precached and ready to work offline. No prompt needed.
      }
    });
  } catch {
    // `virtual:pwa-register` not present (dev without SW, unit tests, or the
    // delta-7 fallback path). Registration is best-effort — ignore.
  }
}

void registerServiceWorker();

export default app;
