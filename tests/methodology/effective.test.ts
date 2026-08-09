import { describe, expect, it } from 'vitest';
import type { Methodology } from '../../lib/methodology/schema';
import {
  OUTREACH_VERSION,
  PRE_OUTREACH_VERSION,
  effectiveMethodologyForRun,
  predatesOutreach,
} from '../../lib/methodology/effective';

function fixtureMethodology(): Methodology {
  return {
    questions: {
      version: '0.3.0',
      categories: [
        {
          id: 'guest',
          name: 'Guest Experience',
          items: [
            { id: 'G1', text: 'Old question', signal: 'evidence', anchors: { lo: 'l', mid: 'm', hi: 'h' } },
            {
              id: 'G6',
              text: 'New question',
              signal: 'evidence',
              since: '0.3.0',
              anchors: { lo: 'l', mid: 'm', hi: 'h' },
              reflection: 'Tell us.',
            },
          ],
        },
      ],
    },
  } as unknown as Methodology;
}

// A second item with an intermediate `since` isolates the boundary the fixture
// above can't reach: whether an item introduced in exactly the run's own version
// is kept (>=) or wrongly dropped (>). Kept as a separate fixture so none of the
// existing assertions above have to change shape.
function fixtureMethodologyWithIntermediateItem(): Methodology {
  return {
    questions: {
      version: '0.3.0',
      categories: [
        {
          id: 'guest',
          name: 'Guest Experience',
          items: [
            { id: 'G1', text: 'Old question', signal: 'evidence', anchors: { lo: 'l', mid: 'm', hi: 'h' } },
            {
              id: 'G2',
              text: 'Mid question',
              signal: 'evidence',
              since: '0.2.0',
              anchors: { lo: 'l', mid: 'm', hi: 'h' },
            },
          ],
        },
      ],
    },
  } as unknown as Methodology;
}

describe('predatesOutreach', () => {
  it('null predates (pre-stamping runs)', () => {
    expect(predatesOutreach(null)).toBe(true);
  });
  it.each(['0.1.0', '0.2.0'])('%s predates', (v) => {
    expect(predatesOutreach(v)).toBe(true);
  });
  it('0.3.0 does not predate', () => {
    expect(predatesOutreach('0.3.0')).toBe(false);
  });
  it('constants are pinned', () => {
    expect(OUTREACH_VERSION).toBe('0.3.0');
    expect(PRE_OUTREACH_VERSION).toBe('0.2.0');
  });
});

describe('effectiveMethodologyForRun', () => {
  it('non-predating run gets the SAME reference back', () => {
    const m = fixtureMethodology();
    expect(effectiveMethodologyForRun(m, '0.3.0')).toBe(m);
  });
  it.each([null, '0.1.0', '0.2.0'])('predating run (%s) gets a filtered copy stamped 0.2.0', (v) => {
    const m = fixtureMethodology();
    const eff = effectiveMethodologyForRun(m, v as string | null);
    expect(eff).not.toBe(m);
    expect(eff.questions.version).toBe('0.2.0');
    expect(eff.questions.categories[0]!.items.map((i) => i.id)).toEqual(['G1']);
  });
  it('keeps categories intact (filter drops items, never categories)', () => {
    const m = fixtureMethodology();
    const eff = effectiveMethodologyForRun(m, '0.2.0');
    expect(eff.questions.categories).toHaveLength(m.questions.categories.length);
    expect(eff.questions.categories[0]!.id).toBe('guest');
  });
  it('does not mutate the input', () => {
    const m = fixtureMethodology();
    effectiveMethodologyForRun(m, '0.2.0');
    expect(m.questions.categories[0]!.items).toHaveLength(2);
    expect(m.questions.version).toBe('0.3.0');
  });
});

describe('effectiveMethodologyForRun: since boundary is inclusive (>=, not >)', () => {
  it("keeps an item whose since exactly equals the run's version", () => {
    const m = fixtureMethodologyWithIntermediateItem();
    const eff = effectiveMethodologyForRun(m, '0.2.0');
    expect(eff.questions.categories[0]!.items.map((i) => i.id)).toEqual(['G1', 'G2']);
  });
  it.each([null, '0.1.0'])('drops an item whose since is after the run version (%s)', (v) => {
    const m = fixtureMethodologyWithIntermediateItem();
    const eff = effectiveMethodologyForRun(m, v as string | null);
    expect(eff.questions.categories[0]!.items.map((i) => i.id)).toEqual(['G1']);
  });
});
