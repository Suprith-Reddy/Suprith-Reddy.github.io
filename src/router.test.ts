import { describe, it, expect } from 'vitest';
import { matchRoute, routes, parseScope, scopeToParam } from './router';

// T2.1 — route table (§3.7). These tests assert the wired table maps every
// documented hash to a component and extracts the named params views read
// (SectionView/CardEditor read params.id; Review reads params.scope).

describe('matchRoute — route table (§3.7)', () => {
  it('matches the home route with no params', () => {
    const m = matchRoute('/');
    expect(m).not.toBeNull();
    expect(m!.params).toEqual({});
  });

  it('extracts :id for #/section/:id', () => {
    const m = matchRoute('/section/abc123');
    expect(m).not.toBeNull();
    expect(m!.params).toEqual({ id: 'abc123' });
  });

  it('extracts :id for #/edit/:id', () => {
    const m = matchRoute('/edit/card-9');
    expect(m).not.toBeNull();
    expect(m!.params).toEqual({ id: 'card-9' });
  });

  it('matches #/new with no params (create mode)', () => {
    const m = matchRoute('/new');
    expect(m).not.toBeNull();
    expect(m!.params).toEqual({});
  });

  it('extracts :scope for #/review/:scope', () => {
    expect(matchRoute('/review/all')!.params).toEqual({ scope: 'all' });
    expect(matchRoute('/review/s:sec1')!.params).toEqual({ scope: 's:sec1' });
    expect(matchRoute('/review/t:math')!.params).toEqual({ scope: 't:math' });
  });

  it('matches the static routes', () => {
    expect(matchRoute('/search')).not.toBeNull();
    expect(matchRoute('/stats')).not.toBeNull();
    expect(matchRoute('/settings')).not.toBeNull();
  });

  it('URL-decodes param segments', () => {
    const m = matchRoute('/review/' + encodeURIComponent('t:a b'));
    expect(m!.params).toEqual({ scope: 't:a b' });
  });

  it('does not confuse routes with different segment counts', () => {
    // "/section" (no id) should not match "/section/:id"
    expect(matchRoute('/section')).toBeNull();
    // "/edit" (no id) should not match "/edit/:id"
    expect(matchRoute('/edit')).toBeNull();
  });

  it('returns null for an unknown hash (App falls back to DeckList → no 404)', () => {
    expect(matchRoute('/totally/unknown/path')).toBeNull();
    expect(matchRoute('/bogus')).toBeNull();
  });

  it('every documented route has a component', () => {
    for (const def of routes) {
      expect(def.component).toBeTruthy();
      expect(typeof def.label).toBe('string');
    }
  });
});

describe('parseScope / scopeToParam round-trip', () => {
  it('parses the scope grammar', () => {
    expect(parseScope('all')).toEqual({ kind: 'all' });
    expect(parseScope('s:sec1')).toEqual({ kind: 'section', id: 'sec1' });
    expect(parseScope('t:math')).toEqual({ kind: 'tag', tag: 'math' });
  });

  it('round-trips through scopeToParam → parseScope', () => {
    const scopes = [
      { kind: 'all' as const },
      { kind: 'section' as const, id: 'abc' },
      { kind: 'tag' as const, tag: 'data structures' },
    ];
    for (const s of scopes) {
      const param = scopeToParam(s);
      const matched = matchRoute('/review/' + param);
      expect(matched).not.toBeNull();
      expect(parseScope(matched!.params.scope!)).toEqual(s);
    }
  });
});
