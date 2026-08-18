import { describe, it, expect } from 'vitest';
import { correctiveInstruction, type GateFamily, type GateFailure } from '../../lib/ai/section-gates';

const ctx = { lengthCeiling: 1400, categoryIds: ['gen', 'gov', 'comm'] as const };

const ALL_FAMILIES: readonly GateFamily[] = [
  'field parity', 'category coverage', 'numeric containment', 'required mention',
  'banned phrase', 'anonymity', 'pattern claim', 'length ceiling',
];

describe('correctiveInstruction (spec §4.3)', () => {
  it('length ceiling states the measured overage, the limit, and the word budget', () => {
    const out = correctiveInstruction({ family: 'length ceiling', detail: '1834/1400' }, ctx)!;
    expect(out).toContain('1834');
    expect(out).toContain('1400');
    expect(out).toContain('200');       // wordBudget(1400) — same framing as the first attempt
    expect(out.toLowerCase()).toContain('shorter');
  });

  it('numeric containment forbids numbers absent from the facts', () => {
    const out = correctiveInstruction({ family: 'numeric containment', detail: '37' }, ctx)!;
    expect(out.toLowerCase()).toContain('number');
    expect(out.toLowerCase()).toContain('facts');
  });

  it('category coverage names exactly the required ids', () => {
    const out = correctiveInstruction({ family: 'category coverage', detail: 'missing: comm' }, ctx)!;
    for (const id of ctx.categoryIds) expect(out).toContain(id);
    expect(out.toLowerCase()).toContain('exactly one entry');
  });

  it('required mention and banned phrase echo their detail', () => {
    expect(correctiveInstruction({ family: 'required mention', detail: 'tier_name' }, ctx)!).toContain('tier_name');
    expect(correctiveInstruction({ family: 'banned phrase', detail: 'every stage is strong' }, ctx)!)
      .toContain('every stage is strong');
  });

  // THE security assertion of this task.
  it('returns null for anonymity — the label must never re-enter a prompt', () => {
    expect(correctiveInstruction({ family: 'anonymity', detail: 'label 2' }, ctx)).toBeNull();
  });

  it('returns null for field parity and pattern claim', () => {
    expect(correctiveInstruction({ family: 'field parity', detail: '' }, ctx)).toBeNull();
    expect(correctiveInstruction({ family: 'pattern claim', detail: '' }, ctx)).toBeNull();
  });

  // Exhaustiveness: a family added later must not silently default to "no instruction".
  it('handles every GateFamily explicitly', () => {
    for (const family of ALL_FAMILIES) {
      expect(() => correctiveInstruction({ family, detail: '' } as GateFailure, ctx), family).not.toThrow();
    }
    const corrected = ALL_FAMILIES.filter((family) => correctiveInstruction({ family, detail: 'x/1' }, ctx) !== null);
    expect(corrected.sort()).toEqual(
      ['banned phrase', 'category coverage', 'length ceiling', 'numeric containment', 'required mention'].sort(),
    );
  });
});
