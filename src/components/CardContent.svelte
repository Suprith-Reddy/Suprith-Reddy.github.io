<script lang="ts">
  /*
   * CardContent — §3.4 component contract (T1.4, supersedes the T0.8 stub).
   *
   * The prop signature { markdown: string } is FROZEN (§3.4). Only the internals
   * changed here: the raw passthrough is replaced by the real pipeline in
   * lib/markdown/render.ts (marked, then highlight.js core, then DOMPurify on the
   * final HTML). Because that output is DOMPurify-sanitized, rendering it as raw
   * HTML below is safe — every dangerous tag, handler, and URL has been stripped
   * (see render.ts and render.test.ts).
   *
   * The highlight.js theme CSS is imported below so Vite bundles it into the app
   * CSS (the T0.2 PWA workbox glob then precaches the emitted stylesheet) — there
   * is no network-dependent load. We import the github (light) theme as the base
   * and supply dark-mode token overrides in the scoped style block, gated by the
   * same prefers-color-scheme plus data-theme override convention as tokens.css
   * (§ T0.6). Importing a second dark stylesheet would win unconditionally, so the
   * dark colors live in the gated rules instead.
   */
  import { renderMarkdown } from '../lib/markdown/render';
  import 'highlight.js/styles/github.css';

  let { markdown }: { markdown: string } = $props();

  const html = $derived(renderMarkdown(markdown));
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags — content is DOMPurify-sanitized -->
<div class="card-content">{@html html}</div>

<style>
  .card-content {
    word-break: break-word;
    overflow-wrap: anywhere;
    color: var(--color-text);
    line-height: var(--line-height);
  }

  /* Sanitized HTML is injected, so target descendants with :global. */
  .card-content :global(p) {
    margin: 0 0 var(--space-3);
  }
  .card-content :global(p:last-child) {
    margin-bottom: 0;
  }
  .card-content :global(h1),
  .card-content :global(h2),
  .card-content :global(h3),
  .card-content :global(h4) {
    margin: var(--space-4) 0 var(--space-2);
    line-height: 1.25;
  }
  .card-content :global(ul),
  .card-content :global(ol) {
    margin: 0 0 var(--space-3);
    padding-left: var(--space-5);
  }
  .card-content :global(a) {
    color: var(--color-primary);
    text-decoration: underline;
  }
  .card-content :global(blockquote) {
    margin: 0 0 var(--space-3);
    padding-left: var(--space-3);
    border-left: 3px solid var(--color-border);
    color: var(--color-text-muted);
  }
  .card-content :global(img) {
    max-width: 100%;
    height: auto;
  }
  .card-content :global(table) {
    border-collapse: collapse;
    margin: 0 0 var(--space-3);
  }
  .card-content :global(th),
  .card-content :global(td) {
    border: 1px solid var(--color-border);
    padding: var(--space-1) var(--space-2);
  }

  /* Inline code (code not inside a pre block). */
  .card-content :global(:not(pre) > code) {
    font-family: var(--font-mono);
    font-size: 0.9em;
    background: var(--color-surface);
    padding: 0.1em 0.3em;
    border-radius: var(--radius-sm);
  }

  /* Fenced code blocks: highlight.js theme handles token colors; we own layout. */
  .card-content :global(pre) {
    margin: 0 0 var(--space-3);
    overflow-x: auto;
    border-radius: var(--radius-md);
  }
  .card-content :global(pre code.hljs) {
    display: block;
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    padding: var(--space-3);
    border-radius: var(--radius-md);
  }

  /*
   * Dark-mode highlight.js overrides (github-dark palette).
   * Applied when the OS prefers dark AND the user hasn't forced light, OR when
   * the user explicitly forces dark — mirroring tokens.css precedence (§ T0.6).
   * The light github theme is the imported base; these rules recolor for dark.
   */
  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs) {
      color: #c9d1d9;
      background: #0d1117;
    }
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-doctag),
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-keyword),
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-meta .hljs-keyword),
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-template-tag),
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-template-variable),
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-type),
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-variable.language_) {
      color: #ff7b72;
    }
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-title),
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-title.class_),
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-title.function_) {
      color: #d2a8ff;
    }
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-attr),
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-attribute),
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-literal),
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-meta),
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-number),
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-operator),
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-variable),
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-selector-attr),
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-selector-class),
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-selector-id) {
      color: #79c0ff;
    }
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-regexp),
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-string),
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-meta .hljs-string) {
      color: #a5d6ff;
    }
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-built_in),
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-symbol) {
      color: #ffa657;
    }
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-comment),
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-code),
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-formula) {
      color: #8b949e;
    }
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-name),
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-quote),
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-selector-tag),
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-selector-pseudo) {
      color: #7ee787;
    }
    /*
     * Tokens the light github theme hardcodes to the LIGHT text color (#24292e),
     * which would be near-invisible on the dark code background (#0d1117 →
     * contrast 1.29, a serious axe color-contrast failure — T2.2). github-dark
     * maps these back to the default light-on-dark foreground.
     */
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-subst),
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-emphasis),
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-strong) {
      color: #c9d1d9;
    }
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-section) {
      color: #1f6feb;
    }
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-bullet) {
      color: #f2cc60;
    }
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-addition) {
      color: #aff5b4;
      background-color: #033a16;
    }
    :global(:root:not([data-theme='light'])) .card-content :global(.hljs-deletion) {
      color: #ffdcd7;
      background-color: #67060c;
    }
  }

  /* Explicit user-forced dark always wins (regardless of OS preference). */
  :global(:root[data-theme='dark']) .card-content :global(.hljs) {
    color: #c9d1d9;
    background: #0d1117;
  }
  :global(:root[data-theme='dark']) .card-content :global(.hljs-doctag),
  :global(:root[data-theme='dark']) .card-content :global(.hljs-keyword),
  :global(:root[data-theme='dark']) .card-content :global(.hljs-meta .hljs-keyword),
  :global(:root[data-theme='dark']) .card-content :global(.hljs-template-tag),
  :global(:root[data-theme='dark']) .card-content :global(.hljs-template-variable),
  :global(:root[data-theme='dark']) .card-content :global(.hljs-type),
  :global(:root[data-theme='dark']) .card-content :global(.hljs-variable.language_) {
    color: #ff7b72;
  }
  :global(:root[data-theme='dark']) .card-content :global(.hljs-title),
  :global(:root[data-theme='dark']) .card-content :global(.hljs-title.class_),
  :global(:root[data-theme='dark']) .card-content :global(.hljs-title.function_) {
    color: #d2a8ff;
  }
  :global(:root[data-theme='dark']) .card-content :global(.hljs-attr),
  :global(:root[data-theme='dark']) .card-content :global(.hljs-attribute),
  :global(:root[data-theme='dark']) .card-content :global(.hljs-literal),
  :global(:root[data-theme='dark']) .card-content :global(.hljs-meta),
  :global(:root[data-theme='dark']) .card-content :global(.hljs-number),
  :global(:root[data-theme='dark']) .card-content :global(.hljs-operator),
  :global(:root[data-theme='dark']) .card-content :global(.hljs-variable),
  :global(:root[data-theme='dark']) .card-content :global(.hljs-selector-attr),
  :global(:root[data-theme='dark']) .card-content :global(.hljs-selector-class),
  :global(:root[data-theme='dark']) .card-content :global(.hljs-selector-id) {
    color: #79c0ff;
  }
  :global(:root[data-theme='dark']) .card-content :global(.hljs-regexp),
  :global(:root[data-theme='dark']) .card-content :global(.hljs-string),
  :global(:root[data-theme='dark']) .card-content :global(.hljs-meta .hljs-string) {
    color: #a5d6ff;
  }
  :global(:root[data-theme='dark']) .card-content :global(.hljs-built_in),
  :global(:root[data-theme='dark']) .card-content :global(.hljs-symbol) {
    color: #ffa657;
  }
  :global(:root[data-theme='dark']) .card-content :global(.hljs-comment),
  :global(:root[data-theme='dark']) .card-content :global(.hljs-code),
  :global(:root[data-theme='dark']) .card-content :global(.hljs-formula) {
    color: #8b949e;
  }
  :global(:root[data-theme='dark']) .card-content :global(.hljs-name),
  :global(:root[data-theme='dark']) .card-content :global(.hljs-quote),
  :global(:root[data-theme='dark']) .card-content :global(.hljs-selector-tag),
  :global(:root[data-theme='dark']) .card-content :global(.hljs-selector-pseudo) {
    color: #7ee787;
  }
  /* See the media-query block above: tokens the light theme pins to #24292e need
     the github-dark foreground or they fail color-contrast on the dark code bg. */
  :global(:root[data-theme='dark']) .card-content :global(.hljs-subst),
  :global(:root[data-theme='dark']) .card-content :global(.hljs-emphasis),
  :global(:root[data-theme='dark']) .card-content :global(.hljs-strong) {
    color: #c9d1d9;
  }
  :global(:root[data-theme='dark']) .card-content :global(.hljs-section) {
    color: #1f6feb;
  }
  :global(:root[data-theme='dark']) .card-content :global(.hljs-bullet) {
    color: #f2cc60;
  }
  :global(:root[data-theme='dark']) .card-content :global(.hljs-addition) {
    color: #aff5b4;
    background-color: #033a16;
  }
  :global(:root[data-theme='dark']) .card-content :global(.hljs-deletion) {
    color: #ffdcd7;
    background-color: #67060c;
  }
</style>
