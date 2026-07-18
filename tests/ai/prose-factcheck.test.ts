import { describe, it, expect } from 'vitest';
import { loadMethodology } from '../../lib/methodology/load';
import { diagnose } from '../../lib/engine';
import { fallbackProse, type ReportBlocks } from '../../lib/ai/fallback';
import { passesFactCheck } from '../../lib/ai/prose';
import type { Response } from '../../lib/engine/types';

const m = loadMethodology();
function cat(id: string, v: number): Response[] {
  const c = m.questions.categories.find(x => x.id === id)!;
  return c.items.map(it => ({ category_id: id, item_id: it.id, value: v, respondent_label: 'Pastor' }));
}

// Broken chain: guest is the primary constraint → full multi-field draft.
const dBroken = diagnose(
  [...cat('guest', 3), ...cat('conn', 7), ...cat('disc', 7), ...cat('vol', 7),
   ...cat('gen', 7), ...cat('gov', 7), ...cat('comm', 7), ...cat('sys', 7)],
  m, { attendance_band: '500_999' },
);
const draftFull = fallbackProse(dBroken, m);

// Healthy: no constraint → 3-field draft.
const dHealthy = diagnose(
  [...cat('guest', 7), ...cat('conn', 7), ...cat('disc', 7), ...cat('vol', 7),
   ...cat('gen', 7), ...cat('gov', 7), ...cat('comm', 7), ...cat('sys', 7)],
  m, { attendance_band: '500_999' },
);
const draft3 = fallbackProse(dHealthy, m);

describe('passesFactCheck', () => {
  it('(a) accepts a faithful reword — same numbers, fields, category', () => {
    const ai = { ...draftFull, verdict: draftFull.verdict + ' In plain terms, this is the ceiling.' };
    expect(passesFactCheck(ai, draftFull, dBroken, m)).toBe(true);
  });

  it('(b) rejects an invented number not in draft ∪ struct', () => {
    const ai = { ...draftFull, verdict: draftFull.verdict + ' It touches 987654 people.' };
    expect(passesFactCheck(ai, draftFull, dBroken, m)).toBe(false);
  });

  it('(c) rejects a dropped (blanked) populated field', () => {
    expect((draftFull.evidence ?? '').trim().length).toBeGreaterThan(0); // precondition
    const ai = { ...draftFull, evidence: '   ' };
    expect(passesFactCheck(ai, draftFull, dBroken, m)).toBe(false);
  });

  it('(d) rejects an added field the draft left empty', () => {
    expect(draftFull.dispersion).toBeUndefined(); // precondition: single respondent → no dispersion flag
    const ai = { ...draftFull, dispersion: 'One team scored this much higher than another.' };
    expect(passesFactCheck(ai, draftFull, dBroken, m)).toBe(false);
  });

  it('(e) rejects a renamed primary constraint (category fidelity)', () => {
    const primaryName = 'Guest Experience';
    expect(draftFull.verdict).toContain(primaryName); // precondition
    const ai = Object.fromEntries(
      Object.entries(draftFull).map(([k, v]) =>
        [k, typeof v === 'string' ? v.replaceAll(primaryName, 'Systems') : v]),
    ) as ReportBlocks;
    expect(passesFactCheck(ai, draftFull, dBroken, m)).toBe(false);
  });

  it('(f) accepts a faithful reword on the null-constraint 3-field draft', () => {
    expect(dHealthy.primary_constraint).toBeNull(); // precondition
    const ai = { ...draft3, verdict: draft3.verdict + ' Nothing is breaking the chain right now.' };
    expect(passesFactCheck(ai, draft3, dHealthy, m)).toBe(true);
  });

  it('(g) rejects a 4th field added to the 3-field null-constraint draft', () => {
    const ai = { ...draft3, evidence: 'Invented supporting detail.' };
    expect(passesFactCheck(ai, draft3, dHealthy, m)).toBe(false);
  });

  it('(h) treats 45, 45.0, 45% as the same value (value-based membership)', () => {
    const score = dBroken.categories.find(c => c.category_id === 'guest')!.score;
    expect(Number.isInteger(score)).toBe(true); // precondition: category scores are integers
    const ai = { ...draftFull, verdict: `Guest Experience sits at ${score}.0, or ${score}%, still low.` };
    expect(passesFactCheck(ai, draftFull, dBroken, m)).toBe(true);
  });
});
