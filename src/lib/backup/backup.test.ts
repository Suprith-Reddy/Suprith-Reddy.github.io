/**
 * backup.test.ts — Vitest coverage for the backup module (§3.8, T1.8).
 *
 * Covers:
 *   - validateBackup: discriminated result on valid + each failure gate.
 *   - parseAndValidate: malformed-JSON + invalid-shape throw friendly errors.
 *   - backupFilename / serializeBackup pure helpers.
 *   - ROUND-TRIP equality: build data in a real Store → exportAll → importBackup
 *     (parse+validate+importAll REPLACE) → exportAll deep-equals the first export
 *     (ids + seq preserved).
 *   - exportBackup triggers a DOM download (happy-dom) and records markBackup.
 *
 * The Store is built over the in-memory `_fakeDb` (no browser IndexedDB; the dep
 * set is frozen, so no fake-indexeddb). Runs under happy-dom (vite.config test env).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackupFile, Card, Section } from '../types';
import { SCHEMA_VERSION } from '../types';
import type { Store } from '../db/index';
import { makeStore } from '../db/store';
import { makeFakeDb } from '../stores/_fakeDb';
import { validateBackup } from './validate';
import { backupFilename, serializeBackup, exportBackup } from './export';
import { importBackup, parseAndValidate } from './import';

function freshStore(): Store {
  return makeStore(makeFakeDb());
}

/** A minimal but complete valid backup for validation tests. */
function validBackup(): BackupFile {
  return {
    app: 'flash',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: 1_700_000_000_000,
    sections: [{ id: 's1', name: 'Sec', order: 0, createdAt: 1 }],
    cards: [
      {
        id: 'c1',
        sectionId: 's1',
        front: 'q',
        back: 'a',
        tags: ['t'],
        box: 1,
        lastReviewed: null,
        dueDate: 1,
        createdAt: 1,
        modifiedAt: 1
      }
    ],
    reviewLog: [{ seq: 1, cardId: 'c1', ts: 2, grade: 'good', mode: 'leitner', elapsedMs: 500 }],
    settings: {
      theme: 'system',
      reviewMode: 'shuffle',
      lastBackupAt: null,
      onboardedAt: null,
      schemaVersion: SCHEMA_VERSION
    }
  };
}

// Build a `File` from a JSON-serializable value. happy-dom provides File/Blob.
function jsonFile(value: unknown, name = 'b.json'): File {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return new File([text], name, { type: 'application/json' });
}

describe('validateBackup', () => {
  it('accepts a well-formed backup', () => {
    const r = validateBackup(validBackup());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.cards[0]?.id).toBe('c1');
  });

  it('rejects non-objects', () => {
    expect(validateBackup(null).ok).toBe(false);
    expect(validateBackup('x').ok).toBe(false);
    expect(validateBackup([]).ok).toBe(false);
  });

  it("rejects a wrong app marker", () => {
    const r = validateBackup({ ...validBackup(), app: 'other' });
    expect(r).toMatchObject({ ok: false });
  });

  it('rejects a mismatched schemaVersion', () => {
    const r = validateBackup({ ...validBackup(), schemaVersion: SCHEMA_VERSION + 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/schema version/i);
  });

  it('rejects missing/!array collections', () => {
    expect(validateBackup({ ...validBackup(), sections: {} }).ok).toBe(false);
    expect(validateBackup({ ...validBackup(), cards: null }).ok).toBe(false);
    expect(validateBackup({ ...validBackup(), reviewLog: 'x' }).ok).toBe(false);
  });

  it('rejects a malformed card', () => {
    const bad = validBackup();
    const r = validateBackup({ ...bad, cards: [{ ...bad.cards[0], dueDate: null }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/dueDate/);
  });

  it('rejects an out-of-range box (scheduler NaN-poison guard)', () => {
    // Regression (adversarial review): box must be an integer in 1..LEITNER_BOXES.
    // An out-of-range box makes leitner.next read CADENCE_DAYS[box-1] = undefined →
    // dueDate = NaN, so the card never becomes due. Reject at import time.
    const bad = validBackup();
    for (const box of [0, -1, 999, 1.5]) {
      const r = validateBackup({ ...bad, cards: [{ ...bad.cards[0], box }] });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/box/);
    }
  });

  it('rejects a non-positive / non-finite dueDate', () => {
    const bad = validBackup();
    for (const dueDate of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = validateBackup({ ...bad, cards: [{ ...bad.cards[0], dueDate }] });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/dueDate/);
    }
  });

  it('rejects a malformed review entry', () => {
    const bad = validBackup();
    const r = validateBackup({ ...bad, reviewLog: [{ ...bad.reviewLog[0], grade: 'maybe' }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/grade/);
  });

  it('rejects malformed settings', () => {
    const bad = validBackup();
    const r = validateBackup({ ...bad, settings: { ...bad.settings, theme: 'neon' } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/theme/);
  });
});

describe('parseAndValidate', () => {
  it('parses + validates valid JSON', () => {
    const data = parseAndValidate(JSON.stringify(validBackup()));
    expect(data.app).toBe('flash');
  });

  it('throws on malformed JSON', () => {
    expect(() => parseAndValidate('{not json')).toThrow(/not valid JSON/i);
  });

  it('throws on a valid-JSON but invalid-shape file', () => {
    expect(() => parseAndValidate(JSON.stringify({ app: 'flash' }))).toThrow();
  });
});

describe('pure helpers', () => {
  it('backupFilename uses the local calendar date', () => {
    // Construct a known local date to avoid TZ flakiness.
    const ts = new Date(2026, 5, 19, 12, 0, 0).getTime(); // 2026-06-19 (month is 0-based)
    expect(backupFilename(ts)).toBe('flash-backup-2026-06-19.json');
  });

  it('serializeBackup produces parseable JSON round-tripping the object', () => {
    const data = validBackup();
    expect(JSON.parse(serializeBackup(data))).toEqual(data);
  });
});

describe('round-trip', () => {
  it('export → import (REPLACE) → export deep-equals, preserving ids + seq', async () => {
    const src = freshStore();
    const secA = await src.createSection('Alpha');
    const secB = await src.createSection('Beta');
    const cardA = await src.createCard({
      sectionId: secA.id,
      front: 'Front A',
      back: 'Back A',
      tags: ['#Math', 'algebra']
    });
    await src.createCard({ sectionId: secB.id, front: 'Front B', back: 'Back B', tags: [] });
    await src.appendReview({
      cardId: cardA.id,
      ts: 123,
      grade: 'good',
      mode: 'leitner',
      elapsedMs: 800
    });
    await src.appendReview({
      cardId: cardA.id,
      ts: 456,
      grade: 'again',
      mode: 'shuffle',
      elapsedMs: 200
    });

    const firstExport = await src.exportAll();

    // Round-trip into a FRESH store (proves no reliance on prior state) via the
    // public import path: serialize → File → importBackup (parse+validate+importAll).
    const dst = freshStore();
    // Pre-seed dst with junk to prove REPLACE wipes it.
    await dst.createSection('JUNK to be replaced');

    const file = jsonFile(serializeBackup(firstExport));
    const summary = await importBackup(dst, file);
    expect(summary).toEqual({ sections: 2, cards: 2, reviews: 2 });

    const secondExport = await dst.exportAll();

    // exportedAt differs by design; compare the data payload.
    const strip = (b: BackupFile): Omit<BackupFile, 'exportedAt'> => {
      const { exportedAt: _omit, ...rest } = b;
      return rest;
    };
    expect(strip(secondExport)).toEqual(strip(firstExport));

    // Explicit id + seq preservation checks.
    expect(secondExport.sections.map((s: Section) => s.id).sort()).toEqual(
      [secA.id, secB.id].sort()
    );
    expect(secondExport.cards.map((c: Card) => c.id).sort()).toEqual(
      firstExport.cards.map((c: Card) => c.id).sort()
    );
    expect(secondExport.reviewLog.map((r) => r.seq).sort()).toEqual(
      firstExport.reviewLog.map((r) => r.seq).sort()
    );
  });
});

describe('exportBackup', () => {
  it('builds a download and records the backup time (markBackup)', async () => {
    const store = freshStore();
    await store.createSection('S');

    // Spy on the DOM download machinery (happy-dom).
    const createUrl = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:fake');
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    // Mock markBackup so it doesn't reach the real IndexedDB-backed Store
    // (unavailable under happy-dom); we only assert it is invoked.
    const settings = await import('../stores/settings.svelte');
    const markSpy = vi.spyOn(settings, 'markBackup').mockResolvedValue(undefined);

    await exportBackup(store);

    expect(createUrl).toHaveBeenCalledOnce();
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(markSpy).toHaveBeenCalledOnce();

    createUrl.mockRestore();
    revokeUrl.mockRestore();
    clickSpy.mockRestore();
    markSpy.mockRestore();
  });
});
