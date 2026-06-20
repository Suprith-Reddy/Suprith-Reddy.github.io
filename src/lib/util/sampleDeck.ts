/**
 * sampleDeck.ts — first-run sample-deck seeding (T1.10, F-18).
 *
 * On first run (when `settings.onboardedAt == null`, see §3.1 / §3.6) the app
 * seeds a tiny, self-explanatory sample deck so the app isn't a blank screen.
 * The cards double as a feature tour: they show Markdown, fenced code (rendered
 * by T1.4's CardContent), tags, and the Leitner/shuffle review loop.
 *
 * Seeding goes THROUGH the reactive stores (§3.6 `addSection`/`addCard`) — never
 * IndexedDB directly (delta-3) — so the in-memory rune caches that the views bind
 * to are populated immediately, and the Store applies its own defaults
 * (box=1, dueDate=createdAt, tag normalization).
 *
 * Idempotency is the CALLER's responsibility via the typed `onboardedAt` flag:
 * `maybeSeedSampleDeck` checks `settings.value.onboardedAt` and `markOnboarded`s
 * after a successful seed, so a second invocation is a no-op. Onboarding.svelte
 * (and tests) call `maybeSeedSampleDeck`; `seedSampleDeck` is the unconditional
 * primitive used internally and exposed for tests.
 */
import type { Card } from '../types';
import { addCard } from '../stores/cards.svelte';
import { addSection } from '../stores/sections.svelte';
import { markOnboarded, settings } from '../stores/settings.svelte';
import { now } from './time';

/** One sample card's authored content (front/back Markdown + tags). */
export interface SampleCardSpec {
  front: string;
  back: string;
  tags: string[];
}

/** A named section plus its cards, as authored (pre-normalization). */
export interface SampleSectionSpec {
  name: string;
  cards: SampleCardSpec[];
}

/**
 * The authored sample content. Small on purpose (one section, a handful of
 * cards). Exercises Markdown emphasis/lists, a fenced code block, and tags.
 */
export const SAMPLE_DECK: readonly SampleSectionSpec[] = [
  {
    name: 'Welcome to Flash',
    cards: [
      {
        front: 'What is **Flash**?',
        back:
          'A tiny, offline-first flashcard app.\n\n' +
          "- Your cards live **on this device** (nothing is uploaded).\n" +
          '- It works without a network once installed.\n' +
          '- Back up regularly with **Settings → Export**.',
        tags: ['welcome', 'basics']
      },
      {
        front: 'How do I review cards?',
        back:
          'Open a deck and press **Review**.\n\n' +
          'Tap the card to flip it, then grade yourself:\n\n' +
          '- **Again** (key `1`) — you missed it; it comes back soon.\n' +
          '- **Good** (key `2`) — you knew it; it waits longer next time.',
        tags: ['review', 'basics']
      },
      {
        front: 'Do cards support Markdown and code?',
        back:
          'Yes. Write **bold**, *italic*, lists, and fenced code:\n\n' +
          '```js\n' +
          'function greet(name) {\n' +
          '  return `Hello, ${name}!`;\n' +
          '}\n' +
          '```\n\n' +
          'Code blocks are syntax-highlighted.',
        tags: ['markdown', 'code']
      },
      {
        front: 'What is spaced repetition?',
        back:
          'Reviewing material at *increasing* intervals so it sticks.\n\n' +
          "Flash uses a simple **Leitner** system: a card you know moves to a " +
          'higher box and is shown less often; a card you miss drops back to box 1.',
        tags: ['review', 'leitner']
      },
      {
        front: 'How do I make my own cards?',
        back:
          'Create a **section** on the home screen, open it, and add cards with ' +
          'the **+** button. Add `#tags` to group and filter related cards.\n\n' +
          'You can delete this sample deck whenever you like.',
        tags: ['basics']
      }
    ]
  }
];

/**
 * Unconditionally create the sample deck via the reactive stores. Returns the
 * created cards (handy for tests). Does NOT touch the `onboardedAt` flag — the
 * caller (or `maybeSeedSampleDeck`) owns idempotency.
 */
export async function seedSampleDeck(): Promise<Card[]> {
  const created: Card[] = [];
  for (const sectionSpec of SAMPLE_DECK) {
    const section = await addSection(sectionSpec.name);
    for (const cardSpec of sectionSpec.cards) {
      const card = await addCard({
        sectionId: section.id,
        front: cardSpec.front,
        back: cardSpec.back,
        tags: cardSpec.tags
      });
      created.push(card);
    }
  }
  return created;
}

/**
 * First-run guard: if onboarding hasn't happened yet (`onboardedAt == null`),
 * seed the sample deck and stamp `onboardedAt` (idempotent via the typed flag,
 * §3.1). If already onboarded, this is a no-op and returns `false`.
 *
 * Returns `true` iff the deck was seeded by this call.
 */
export async function maybeSeedSampleDeck(): Promise<boolean> {
  if (settings.value.onboardedAt != null) return false;
  await seedSampleDeck();
  await markOnboarded(now());
  return true;
}
