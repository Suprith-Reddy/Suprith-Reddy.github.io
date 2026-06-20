import { describe, it, expect } from 'vitest';
import { createCounter } from '../../src/scaffold-runes-check.svelte';

// Scaffold gate: a $state rune in a .svelte.ts module compiles under the Vite/Svelte
// toolchain AND reacts to mutation. Validates the foundation for the §3.6 rune stores.
describe('scaffold runes-in-module gate', () => {
  it('reacts to $state mutation', () => {
    const c = createCounter(1);
    expect(c.count).toBe(1);
    c.increment();
    c.increment();
    expect(c.count).toBe(3);
  });
});
