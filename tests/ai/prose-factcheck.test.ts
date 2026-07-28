import { describe, it, expect } from 'vitest';
import { loadMethodology } from '../../lib/methodology/load';
import { diagnose } from '../../lib/engine';
import { fallbackProse, type ReportBlocks } from '../../lib/ai/fallback';
import { passesFactCheck } from '../../lib/ai/prose';
import type { Response } from '../../lib/engine/types';

const m = loadMethodology();
function cat(id: string, v: number): Response[] {
  const c = m.questions.categories.find(x => x.id === id)!;
  return c.items.map(it => ({ category_id: id, item_id: it.id, value: v, respondent_label: 'Pastor', respondent_id: 'Pastor' }));
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

// Two respondents who disagree sharply on one category, so the engine really emits
// disagreement_flags[].respondents[] carrying their labels. A respondent-anonymity test built
// on a fixture with an EMPTY respondents array would pass because the loop never runs.
const NAMED = 'Priscilla Vandermeer';
function cat2(id: string, a: number, b: number): Response[] {
  const c = m.questions.categories.find(x => x.id === id)!;
  return c.items.flatMap(it => [
    { category_id: id, item_id: it.id, value: a, respondent_label: NAMED, respondent_id: NAMED },
    { category_id: id, item_id: it.id, value: b, respondent_label: 'Marcus Ellingsworth', respondent_id: 'Marcus Ellingsworth' },
  ]);
}

// guest stays the primary constraint; comm carries the disagreement (means 1 and 9 →
// population stddev 4.0, over the 2.0 dispersion threshold in methodology/rules.yaml).
const dNamed = diagnose(
  [...cat2('guest', 3, 3), ...cat2('conn', 7, 7), ...cat2('disc', 7, 7), ...cat2('vol', 7, 7),
   ...cat2('gen', 7, 7), ...cat2('gov', 7, 7), ...cat2('comm', 1, 9), ...cat2('sys', 7, 7)],
  m, { attendance_band: '500_999' },
);
const draftNamed = fallbackProse(dNamed, m);

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

  it('(i) rejects a score swapped in from a different category (numeric containment must be per-field, not global)', () => {
    const guestScore = dBroken.categories.find(c => c.category_id === 'guest')!.score;
    const connScore = dBroken.categories.find(c => c.category_id === 'conn')!.score;
    // Preconditions: the two scores differ, and conn's score is not already present
    // in the verdict field's own text (so this genuinely tests cross-field leakage).
    expect(connScore).not.toBe(guestScore);
    expect(draftFull.verdict.includes(String(connScore))).toBe(false);
    // connScore IS present elsewhere in the serialized Diagnosis struct (it's another
    // category's score), which is exactly what makes the old global ∪-struct allowed
    // set too permissive: a reword that migrates a number from one field (or the
    // struct) into a DIFFERENT field must still be rejected.
    const ai = { ...draftFull, verdict: draftFull.verdict.replace(String(guestScore), String(connScore)) };
    expect(passesFactCheck(ai, draftFull, dBroken, m)).toBe(false);
  });

  it('(j) rejects a verdict that swaps the real primary score for the literal scale number (100)', () => {
    const guestScore = dBroken.categories.find(c => c.category_id === 'guest')!.score;
    // Precondition: guest's score isn't literally 100, so this is a genuine swap, and the
    // template's own "out of 100" scale token means BOTH 100 and the real score are
    // already legitimate members of verdict's per-field allowed set — so prong 2 (numeric
    // containment) alone cannot catch this: "It scored 100 out of 100" passes field parity,
    // passes per-field containment (100 ∈ allowed), and passes category fidelity (the name
    // is untouched). Only a check that pins the *specific* primary-score number can catch it.
    expect(guestScore).not.toBe(100);
    const ai = { ...draftFull, verdict: draftFull.verdict.replace(String(guestScore), '100') };
    expect(passesFactCheck(ai, draftFull, dBroken, m)).toBe(false);
  });

  it('(k) rejects a reword that names an individual respondent (respondent anonymity)', () => {
    // Precondition: the fixture genuinely carries the label, so the gate's loop can fire.
    expect(dNamed.disagreement_flags.some(f => f.respondents.some(r => r.label === NAMED))).toBe(true);
    expect(draftNamed.evidence).toBeDefined();
    // Nothing downstream strips prose, so a reword that names an individual would reach the
    // public /r/[shareToken] page unfiltered. Fail closed to deterministic prose instead.
    const ai = { ...draftNamed, evidence: `${draftNamed.evidence} ${NAMED} rated this lowest.` };
    expect(passesFactCheck(ai, draftNamed, dNamed, m)).toBe(false);
  });

  it('(l) FIRING POSITIVE CONTROL for (k): the same reword without the name passes', () => {
    // If this did not pass, (k) would prove nothing — it would be failing on some other gate.
    const ai = { ...draftNamed, evidence: `${draftNamed.evidence} One campus lead rated this lowest.` };
    expect(passesFactCheck(ai, draftNamed, dNamed, m)).toBe(true);
  });
});
