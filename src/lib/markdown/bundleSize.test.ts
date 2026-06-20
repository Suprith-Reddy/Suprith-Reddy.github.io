/**
 * T1.4 — Bundle-budget assertion (delta-8).
 *
 * The renderer pulls in three non-trivial libraries: `marked`, `DOMPurify`, and
 * `highlight.js`. The single biggest budget risk is highlight.js: importing the
 * full distribution (`highlight.js`) instead of the *core* (`highlight.js/lib/core`)
 * plus a small curated language set drags in ~190 grammars and balloons the
 * bundle by ~900 KB. This test bundles `render.ts` exactly as it would ship
 * (tree-shaken, minified) and fails if the gzipped size regresses past the
 * budget — catching an accidental `import hljs from 'highlight.js'` or a flood of
 * extra language registrations.
 *
 * Runs in the Node environment (it invokes Vite's build API), so it is annotated
 * to opt out of the default happy-dom environment for this file.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';

// Gzipped budget for the whole render module (marked + DOMPurify + highlight.js
// core + curated languages). Current size is ~43 KB gz; 80 KB leaves headroom
// for small additions while still failing hard if the full highlight.js
// distribution (~hundreds of KB gz) is ever pulled in.
const GZIP_BUDGET_BYTES = 80 * 1024;

const here = dirname(fileURLToPath(import.meta.url));
const entry = resolve(here, 'render.ts');

describe('markdown render bundle budget', () => {
  it(
    `stays under ${GZIP_BUDGET_BYTES / 1024} KB gzipped (guards against the full highlight.js dist)`,
    async () => {
      const result = await build({
        configFile: false,
        logLevel: 'error',
        build: {
          write: false,
          minify: 'terser',
          lib: { entry, formats: ['es'], fileName: 'render' },
        },
      });

      const output = Array.isArray(result) ? result[0]!.output : (result as { output: unknown[] }).output;
      let gzipBytes = 0;
      for (const chunk of output as Array<{ type: string; code?: string }>) {
        if (chunk.type === 'chunk' && typeof chunk.code === 'string') {
          gzipBytes += gzipSync(chunk.code).length;
        }
      }

      expect(gzipBytes).toBeGreaterThan(0);
      expect(gzipBytes).toBeLessThan(GZIP_BUDGET_BYTES);
    },
    60_000,
  );
});
