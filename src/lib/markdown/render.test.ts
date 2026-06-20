/**
 * T1.4 — Markdown render + XSS sanitization tests.
 *
 * Runs under happy-dom (vite.config.ts `test.environment: 'happy-dom'`) because
 * DOMPurify needs a real DOM. These assert the FROZEN security property: rendered
 * card HTML is sanitized (DOMPurify on the final HTML) — no <script>, no inline
 * event handlers, no javascript:/dangerous-data: URLs survive — plus that the
 * happy-path Markdown + code highlighting still works.
 */
// Install the happy-dom NodeIterator shim BEFORE importing `./render` (which
// imports dompurify). DOMPurify captures `document.createNodeIterator` when its
// factory binds; under happy-dom the native iterator is not mutation-safe and
// DOMPurify silently no-ops, so this shim is required for these XSS assertions
// to exercise the real sanitizer. Production code never imports the shim — the
// native browser iterator works correctly there. See _happyDomPurifyPatch.ts.
import './_happyDomPurifyPatch';
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './render';

describe('renderMarkdown — happy path', () => {
  it('renders headings and paragraphs', () => {
    const html = renderMarkdown('# Title\n\nHello **world**');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>world</strong>');
  });

  it('renders lists', () => {
    const html = renderMarkdown('- a\n- b');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>a</li>');
  });

  it('returns empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('');
  });

  it('highlights a fenced code block with a known language', () => {
    const html = renderMarkdown('```js\nconst x = 1;\n```');
    expect(html).toContain('<pre>');
    expect(html).toContain('class="hljs language-javascript"');
    // highlight.js wraps tokens in spans
    expect(html).toContain('hljs-keyword');
  });

  it('resolves a language alias (ts → typescript)', () => {
    const html = renderMarkdown('```ts\ntype A = number;\n```');
    expect(html).toContain('language-typescript');
  });

  it('renders an unknown-language fence as escaped plaintext code', () => {
    const html = renderMarkdown('```nope-not-a-lang\n<b>raw</b>\n```');
    expect(html).toContain('<pre><code class="hljs">');
    // The angle brackets must be escaped, not live HTML.
    expect(html).toContain('&lt;b&gt;raw&lt;/b&gt;');
    expect(html).not.toContain('<b>raw</b>');
  });

  it('renders inline code', () => {
    const html = renderMarkdown('use `npm`');
    expect(html).toContain('<code>npm</code>');
  });
});

describe('renderMarkdown — XSS sanitization (DOMPurify on final HTML)', () => {
  it('strips <script> tags', () => {
    const html = renderMarkdown('hi <script>alert(1)</script> there');
    expect(html.toLowerCase()).not.toContain('<script');
    expect(html).not.toContain('alert(1)');
  });

  it('strips inline event handlers (onerror)', () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)">');
    expect(html.toLowerCase()).not.toContain('onerror');
    expect(html).not.toContain('alert(1)');
  });

  it('strips onload/onclick handlers on arbitrary elements', () => {
    const html = renderMarkdown('<div onclick="steal()">x</div><body onload="boom()">');
    expect(html.toLowerCase()).not.toContain('onclick');
    expect(html.toLowerCase()).not.toContain('onload');
    expect(html).not.toContain('steal()');
    expect(html).not.toContain('boom()');
  });

  it('neutralizes javascript: URLs in links', () => {
    const html = renderMarkdown('[click](javascript:alert(1))');
    expect(html.toLowerCase()).not.toContain('javascript:');
  });

  it('neutralizes javascript: URLs in raw anchor HTML', () => {
    const html = renderMarkdown('<a href="javascript:alert(1)">x</a>');
    expect(html.toLowerCase()).not.toContain('javascript:');
  });

  it('neutralizes dangerous data: URLs (data:text/html)', () => {
    const html = renderMarkdown(
      '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
    );
    // DOMPurify drops data: hrefs on anchors by default.
    expect(html).not.toContain('data:text/html');
  });

  it('strips <iframe> embeds', () => {
    // about:blank avoids happy-dom attempting a real network fetch while parsing
    // the (to-be-removed) iframe src; the assertion is the same either way.
    const html = renderMarkdown('<iframe src="about:blank"></iframe>');
    expect(html.toLowerCase()).not.toContain('<iframe');
  });

  it('strips <object>/<embed>', () => {
    const html = renderMarkdown('<object data="x"></object><embed src="y">');
    expect(html.toLowerCase()).not.toContain('<object');
    expect(html.toLowerCase()).not.toContain('<embed');
  });

  it('strips inline <style> blocks', () => {
    const html = renderMarkdown('<style>body{display:none}</style>ok');
    expect(html.toLowerCase()).not.toContain('<style');
  });

  it('hardens surviving links with rel + target via the DOMPurify hook', () => {
    const html = renderMarkdown('[ok](https://example.com)');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).toContain('target="_blank"');
  });

  it('keeps benign image src but drops onerror', () => {
    const html = renderMarkdown('![alt](https://example.com/p.png)');
    expect(html).toContain('src="https://example.com/p.png"');
    expect(html.toLowerCase()).not.toContain('onerror');
  });
});
