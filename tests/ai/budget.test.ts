import { describe, it, expect } from 'vitest';
import { wordBudget, budgetSentence, AI_SECTION_IDS } from '../../lib/ai/sections';
import { loadMethodology } from '../../lib/methodology/load';

describe('wordBudget (spec §4.2)', () => {
  it('matches the spec worked examples', () => {
    expect(wordBudget(900)).toBe(128);   // s12
    expect(wordBudget(1400)).toBe(200);  // s2
    expect(wordBudget(6000)).toBe(857);  // s6
  });

  it('floors rather than rounds, so the budget never exceeds ceiling/7', () => {
    expect(wordBudget(2200)).toBe(314);  // s5: 314.28 -> 314
    expect(wordBudget(1)).toBe(0);
  });

  // The margin is the whole point: obeying the word budget must land UNDER the char ceiling.
  it('leaves headroom at 6 characters per word for every real AI section', () => {
    const methodology = loadMethodology();
    for (const id of AI_SECTION_IDS) {
      const ceiling = methodology.report.sections[id].length_ceiling;
      const worstCaseChars = wordBudget(ceiling) * 6;
      expect(worstCaseChars, id).toBeLessThan(ceiling);
      expect(worstCaseChars / ceiling, id).toBeGreaterThan(0.8); // not so tight it wastes the section
    }
  });
});

describe('budgetSentence', () => {
  it('states the word budget in words', () => {
    expect(budgetSentence(1400)).toContain('200');
    expect(budgetSentence(1400).toLowerCase()).toContain('word');
  });
});
