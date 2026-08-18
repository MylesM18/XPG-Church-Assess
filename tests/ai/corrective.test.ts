import { describe, it, expect } from 'vitest';
import { correctiveInstruction, sliceCategoryIds, type GateFamily, type GateFailure } from '../../lib/ai/section-gates';
import { loadMethodology } from '../../lib/methodology/load';
import { CAPACITY_FACTS } from '../fixtures/facts';

// D4. Every assertion in this file used to survive the mutation it existed to catch: swapping
// the required-mention and banned-phrase CASE BODIES, swapping the three length numbers into
// each other's roles, and echoing the offending model number back in the numeric corrective all
// left the file 7/7 green. The fix pattern is `toBe` the whole sentence, or bind the number/id
// to the imperative that gives it its role.

// The ids are the REAL s6 slice, read through the function compose.ts actually calls (pinned by
// its own tests in section-gates.test.ts). This file previously hand-wrote ['gen','gov','comm'],
// which is not the s5 or s6 slice of any fixture in the repo — so the corrective was asserted
// against ids the composer could never send.
const categoryIds = sliceCategoryIds('s6', CAPACITY_FACTS);
// An id guaranteed absent from that slice: s5 takes categories.slice(0, 3), s6 the remainder.
const outsideSlice = sliceCategoryIds('s5', CAPACITY_FACTS)[0]!;
const ctx = { lengthCeiling: 1400, categoryIds };

const methodology = loadMethodology();
// A REAL banned phrase, quoted from report.yaml:169-172. The old input here was 'every stage is
// strong', which appears nowhere in the methodology — harmless as a test input, but it is the
// same fabricated-quote class of error D7 corrected in shipped comments, so it goes.
const BANNED = methodology.report.banned_phrases.constraint[0]!;

// Exhaustiveness, enforced by the COMPILER rather than by hand. `readonly GateFamily[]` accepts
// a proper subset, so the old literal let a newly-added family be silently skipped by the very
// test that exists to catch it. A `Record<GateFamily, true>` object literal cannot: a missing
// member is a missing-property error and an extra one is an excess-property error.
const FAMILY_PRESENCE: Record<GateFamily, true> = {
  'field parity': true,
  'category coverage': true,
  'numeric containment': true,
  'required mention': true,
  'banned phrase': true,
  'anonymity': true,
  'pattern claim': true,
  'length ceiling': true,
};
const ALL_FAMILIES = Object.keys(FAMILY_PRESENCE) as GateFamily[];

describe('correctiveInstruction (spec §4.3)', () => {
  // Whole-sentence equality, so all three numbers are bound to their roles by position. The
  // second case is what makes the binding load-bearing: swapping `actual` with `lengthCeiling`
  // fails both, where a toContain trio failed neither.
  it('length ceiling states the measured overage, the limit, and the word budget', () => {
    expect(correctiveInstruction({ family: 'length ceiling', detail: '1834/1400' }, ctx)).toBe(
      'Your previous response was 1834 characters. The limit is 1400 characters, about 200 words. Rewrite it substantially shorter.',
    );
  });

  it('length ceiling carries THIS section ceiling and word budget, not a fixed pair', () => {
    expect(correctiveInstruction({ family: 'length ceiling', detail: '2971/2200' }, { ...ctx, lengthCeiling: 2200 })).toBe(
      'Your previous response was 2971 characters. The limit is 2200 characters, about 314 words. Rewrite it substantially shorter.',
    );
  });

  it('numeric containment forbids numbers absent from the facts', () => {
    const out = correctiveInstruction({ family: 'numeric containment', detail: '37' }, ctx)!;
    expect(out).toBe(
      'You used a number that does not appear in the facts. Use only numbers present in the facts you were given.',
    );
    // The offending number is MODEL OUTPUT (section-gates.ts's MAX_ECHOED_ID reasoning). Feeding
    // it back would put the model's own invention into the next prompt as though it were a fact.
    expect(out).not.toContain('37');
  });

  it('category coverage names exactly the required ids, and no others', () => {
    const out = correctiveInstruction({ family: 'category coverage', detail: 'missing: comm' }, ctx)!;
    expect(out).toBe(`Return exactly one entry for each of these category ids, and no others: ${categoryIds.join(', ')}.`);
    // Non-vacuity for the sentence above: an empty slice would make it trivially satisfiable.
    expect(categoryIds.length).toBeGreaterThan(1);
    // Cross-slice: an id from the OTHER section must not appear, or s6 would be told to write
    // about s5's categories.
    expect(out).not.toContain(outsideSlice);
  });

  // Bound to the imperative, not to the echoed detail. Swapping these two case bodies used to
  // stay green: both sentences contain the detail, so `toContain(detail)` cannot tell "you must
  // include this" from "you must never write this" — opposite instructions to the model.
  it('required mention tells the model to include the missing item', () => {
    expect(correctiveInstruction({ family: 'required mention', detail: 'tier_name' }, ctx)).toBe(
      'Your response must mention: tier_name.',
    );
  });

  it('banned phrase tells the model NOT to use the offending phrase', () => {
    expect(correctiveInstruction({ family: 'banned phrase', detail: BANNED }, ctx)).toBe(
      `Do not use the phrase: "${BANNED}".`,
    );
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
