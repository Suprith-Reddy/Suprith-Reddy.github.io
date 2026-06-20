/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

// T0.2: inject the PWA head tags (manifest link + apple-touch-icon) into the
// built index.html WITHOUT editing the T0.1-owned src index.html. We author the
// manifest by hand at public/manifest.webmanifest (so `manifest: false` on the
// PWA plugin); the plugin therefore does NOT emit a <link rel="manifest"> for us.
// Without that link (and an apple-touch-icon for iOS), the app is not installable
// — failing the T0.2 installability gate. This tiny transform adds exactly those
// tags. theme-color is already present in index.html (set by T0.1), so we don't
// duplicate it. Tags are <head>-injected at build time only.
function injectPwaHeadTags(): Plugin {
  const tags = [
    '<link rel="manifest" href="/manifest.webmanifest" />',
    '<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png" />',
    '<link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon-180.png" />'
  ].join('\n    ');
  return {
    name: 'flash:inject-pwa-head-tags',
    transformIndexHtml(html) {
      // Idempotent: don't double-inject if a manifest link already exists.
      if (html.includes('rel="manifest"')) return html;
      return html.replace('</head>', `  ${tags}\n  </head>`);
    }
  };
}

// base: '/' — deployed to a user site (<username>.github.io), served from root (delta-2).
// PWA block owned by T0.2 (PWA shell + SW-update gate):
//   - registerType: 'prompt' (delta-6) — a new SW does NOT auto-reload mid-session;
//     `virtual:pwa-register` surfaces the update via a Toast in main.ts.
//   - precache the app shell + all render assets (JS/CSS/HTML + icons/manifest).
//   - manifest authored by hand at public/manifest.webmanifest (name "Flash",
//     display "standalone", theme color). With `manifest: false` the plugin does
//     NOT emit a <link rel="manifest">, so the `injectPwaHeadTags()` plugin above
//     adds the manifest link + apple-touch-icon to the built index.html (theme-color
//     is already set by T0.1) — keeping the T0.1-owned index.html source untouched.
export default defineConfig({
  base: '/',
  plugins: [
    svelte(),
    injectPwaHeadTags(),
    VitePWA({
      registerType: 'prompt',
      // We author public/manifest.webmanifest by hand; tell the plugin not to
      // generate its own manifest, and reference the static file for HTML head
      // injection + icon precaching.
      manifest: false,
      manifestFilename: 'manifest.webmanifest',
      injectRegister: null, // registration is done manually in main.ts via virtual:pwa-register
      workbox: {
        // Precache the built app shell and every render asset.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}'],
        // SPA fallback: serve index.html for navigations so offline reload of
        // any hash route works (hash routing means the path is always '/').
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        // delta-6: do NOT skipWaiting — the new SW waits until the user accepts
        // the in-app "Update available" prompt and we call updateSW().
        skipWaiting: false
      },
      // Dev: keep the SW off by default (avoids stale-cache surprises in `vite dev`).
      devOptions: {
        enabled: false,
        type: 'module'
      }
    })
  ],
  test: {
    // Default to happy-dom so DOM-touching unit tests (and the scaffold runes gate)
    // run under a real-ish DOM. Pure logic tests are unaffected.
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.{ts,svelte.ts}', 'tests/unit/**/*.{test,spec}.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**']
  }
});
