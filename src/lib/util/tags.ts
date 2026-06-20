/**
 * tags.ts — tag normalization (T0.4).
 *
 * THE single normalization chokepoint (§3.2). Store.createCard / Store.updateCard
 * run every tag through `normalizeTag`; callers never normalize themselves.
 *
 * Normalized form: lowercase, leading '#' stripped, trimmed, empties dropped.
 * `normalizeTags` additionally de-dupes while preserving first-seen order.
 */

/**
 * Normalize a single tag. Returns the canonical form, or `''` if the tag is
 * empty after normalization (callers should drop empties — `normalizeTags` does).
 */
export function normalizeTag(tag: string): string {
  let t = (tag ?? '').trim().toLowerCase();
  // Strip any leading '#' characters (users may type "#sql" or "##sql").
  t = t.replace(/^#+/, '');
  return t.trim();
}

/**
 * Normalize a list of tags: normalize each, drop empties, de-dupe
 * (first occurrence wins), preserving order.
 */
export function normalizeTags(tags: readonly string[] | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags ?? []) {
    const t = normalizeTag(raw);
    if (t === '' || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}
