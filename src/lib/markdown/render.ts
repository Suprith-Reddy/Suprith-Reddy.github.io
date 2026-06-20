/**
 * Markdown → sanitized HTML renderer (T1.4).
 *
 * Pipeline (per §0 baseline + §3.4):
 *   markdown source
 *     → marked (pinned major 18) parses Markdown to HTML
 *     → fenced code blocks highlighted with highlight.js *core* + a small curated
 *       language set (delta-8: locked to highlight.js core for bundle/offline budget;
 *       no network lazy-load — every language is statically imported and thus
 *       bundled + precached by the SW glob in vite.config.ts)
 *     → DOMPurify sanitizes the *final HTML* (NOT the markdown), neutralizing XSS
 *       (<script>, onerror=, javascript:/data: URLs, etc.)
 *
 * DOMPurify runs on the final HTML so that anything marked/highlight.js produced
 * — including HTML the author embedded inline in their Markdown — is scrubbed.
 *
 * Synchronous: `marked.parse` is sync (no async extensions are registered) and
 * highlight.js is sync, so `renderMarkdown` returns a string directly. This keeps
 * `CardContent.svelte` a pure derived render with no loading state.
 */
import { Marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';

// --- Curated language set (delta-8) -----------------------------------------
// A small, statically-imported set keeps the bundle tiny while covering the
// languages a flashcard author is most likely to use. These are bundled (and
// therefore SW-precached) — there is NO network-dependent lazy load.
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml'; // HTML/XML
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import python from 'highlight.js/lib/languages/python';
import java from 'highlight.js/lib/languages/java';
import sql from 'highlight.js/lib/languages/sql';
import markdown from 'highlight.js/lib/languages/markdown';
import plaintext from 'highlight.js/lib/languages/plaintext';

// Registration is idempotent across module re-eval; do it once at import time.
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('python', python);
hljs.registerLanguage('java', java);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('plaintext', plaintext);

// Common aliases → registered canonical names, so ```js / ```ts / ```html work.
const LANG_ALIASES: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  html: 'xml',
  htm: 'xml',
  svg: 'xml',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  py: 'python',
  py3: 'python',
  py2: 'python',
  md: 'markdown',
  text: 'plaintext',
  txt: 'plaintext',
};

function resolveLanguage(lang: string | undefined): string | null {
  if (!lang) return null;
  const key = lang.trim().toLowerCase();
  if (!key) return null;
  const resolved = LANG_ALIASES[key] ?? key;
  return hljs.getLanguage(resolved) ? resolved : null;
}

// --- marked instance ---------------------------------------------------------
// A dedicated `Marked` instance (not the global) so we never mutate shared state.
//   - `highlight`: returns highlighted markup for the inner <code>. We do NOT
//     mark output as trusted — DOMPurify still runs on the final HTML.
//   - `langPrefix: 'language-'` matches highlight.js CSS theme selectors.
//   - `gfm + breaks`: friendly defaults for flashcard prose (single newline = <br>).
const marked = new Marked({
  gfm: true,
  breaks: true,
});

marked.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const resolved = resolveLanguage(lang);
      if (resolved) {
        try {
          const { value } = hljs.highlight(text, { language: resolved });
          return `<pre><code class="hljs language-${resolved}">${value}</code></pre>\n`;
        } catch {
          // fall through to plain escaped output
        }
      }
      // No (recognized) language: emit escaped plaintext. DOMPurify will also run.
      return `<pre><code class="hljs">${escapeHtml(text)}</code></pre>\n`;
    },
  },
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// --- DOMPurify config --------------------------------------------------------
// Hook: force any surviving <a> to open safely (no target injection / tabnabbing).
// Runs only in a DOM environment (browser / happy-dom tests).
let hooksInstalled = false;
function installHooks(): void {
  if (hooksInstalled) return;
  // `addHook` exists only when DOMPurify has a window (jsdom/happy-dom/browser).
  if (typeof DOMPurify.addHook !== 'function') return;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node instanceof Element && node.tagName === 'A' && node.hasAttribute('href')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer nofollow');
    }
  });
  hooksInstalled = true;
}

// Explicit ALLOWLIST of exactly the markup marked + highlight.js produce for
// flashcard prose. An allowlist (rather than DOMPurify's broad default profile)
// is the tighter, safer posture: anything not enumerated — <script>, <style>,
// <iframe>, <object>, <embed>, form controls, event handlers, etc. — is dropped.
// DOMPurify additionally neutralizes javascript:/disallowed-data: URLs on the
// remaining href/src attributes by default.
const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    // block + inline prose
    'p', 'br', 'hr', 'blockquote',
    'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ins', 'mark', 'sub', 'sup', 'small',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'a', 'img',
    // code
    'pre', 'code', 'span', 'kbd', 'samp',
    // tables (GFM)
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    // GFM task-list checkboxes render as <input type=checkbox disabled>
    'input',
  ],
  ALLOWED_ATTR: [
    'href', 'title', 'src', 'alt',
    // class is needed for hljs token spans + language-* on <code>.
    'class',
    // link hardening attributes added by the afterSanitizeAttributes hook.
    'target', 'rel',
    // GFM task-list checkbox attributes (kept inert: disabled + type only).
    'type', 'checked', 'disabled',
    // table cell alignment that GFM emits.
    'align',
  ],
  ALLOW_DATA_ATTR: false,
};

/**
 * Whether DOMPurify is actually able to sanitize in this runtime. DOMPurify can
 * "silently no-op" (return its input UNCHANGED) when the DOM environment lacks a
 * usable window / mutation-safe `createNodeIterator` (older/embedded WebViews,
 * future engine quirks). In that degraded state, returning marked's raw output to
 * an `{@html}` sink would be a stored-XSS path. We compute this ONCE at module
 * init and fail CLOSED (escape everything) when sanitization can't be trusted.
 */
const SANITIZER_OK =
  typeof DOMPurify.sanitize === 'function' &&
  typeof DOMPurify.addHook === 'function' &&
  // `isSupported` is false when DOMPurify has no usable DOM to operate on.
  DOMPurify.isSupported === true;

/**
 * Render Markdown source to sanitized, highlight-ready HTML.
 * Pure w.r.t. inputs; safe to call in a `$derived`.
 *
 * FAIL-CLOSED: if DOMPurify is unsupported/degraded in this runtime, do NOT return
 * unsanitized markup. Instead escape the entire rendered HTML so a degraded
 * sanitizer can never let attacker-controlled HTML reach the `{@html}` sink.
 */
export function renderMarkdown(source: string): string {
  if (!source) return '';
  const rawHtml = marked.parse(source, { async: false }) as string;
  if (!SANITIZER_OK) {
    // Degraded sanitizer: render the produced HTML as inert escaped text.
    return escapeHtml(rawHtml);
  }
  installHooks();
  // DOMPurify on the FINAL HTML (§0 / §3.4).
  return DOMPurify.sanitize(rawHtml, PURIFY_CONFIG);
}
