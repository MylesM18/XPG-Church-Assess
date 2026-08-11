import { describe, it, expect } from 'vitest';
import { deriveDiagnosisForRun } from '@/lib/report/derive';
import { diagnose } from '../../lib/engine';
import { loadFixtureMethodology, answers } from '../engine/helpers';
import type { Response } from '@/lib/engine/types';
import type { Methodology } from '@/lib/methodology/schema';

// A real attendance-band key is underscore-delimited ('100_249'); benchmarkFor() THROWS on an
// unknown band, so this is the same literal every other engine/report fixture in this suite uses
// (e.g. tests/report/audience.test.ts, tests/report/view.test.ts).
const BAND = '100_249';
const ALL = ['guest', 'conn', 'disc', 'vol', 'gen', 'gov', 'comm', 'sys'];

const methodology = loadFixtureMethodology();

/**
 * A COMPLETE response set for `m`: every one of the eight areas answered in full by two
 * respondents. Parameterised on the methodology because answers() emits one row per item of the
 * methodology it is handed — so passing an AUGMENTED methodology is the only way to produce a
 * complete rectangle that also covers the augmented item.
 */
function completeResponsesFor(m: Methodology): Response[] {
  return ALL.flatMap((id) => [
    ...answers(m, id, id === 'vol' ? 2 : 8, 'Pastor Dana', 'u-1'),
    ...answers(m, id, id === 'vol' ? 9 : 7, 'Elder Sam', 'u-2'),
  ]);
}

/** A COMPLETE response set: every one of the eight areas answered in full by two respondents. */
function completeResponses(): Response[] {
  return completeResponsesFor(methodology);
}

describe('deriveDiagnosisForRun', () => {
  it('re-derives the SAME Diagnosis the engine produces from (responses, methodology, ctx)', () => {
    // Score identity is the whole point of CT-2(c): re-deriving at render must equal what the
    // deterministic engine would produce, so nothing about the numbers can drift from diagnose().
    const responses = completeResponses();
    const ctx = { attendance_band: BAND };

    const result = deriveDiagnosisForRun(responses, methodology, ctx, '0.3.0');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable — asserted ok above');
    expect(result.diagnosis).toEqual(diagnose(responses, methodology, ctx));
  });

  it('blocks with incomplete_areas naming exactly the area whose responses are missing', () => {
    // Drop every response for one area → its fit.n is 0 → the diagnosis gate blocks it.
    const responses = completeResponses().filter((r) => r.category_id !== 'disc');
    const result = deriveDiagnosisForRun(responses, methodology, { attendance_band: BAND }, '0.3.0');
    expect(result).toEqual({ ok: false, reason: 'incomplete_areas', blockedAreas: ['disc'] });
  });

  it('reports unknown_band when every area is complete but the band is not a benchmark key', () => {
    // Gate passes (all areas complete), so the failure is specifically the band guard — the same
    // guard generateDiagnosis applies before assemble() (which throws on an unknown band).
    const result = deriveDiagnosisForRun(completeResponses(), methodology, { attendance_band: 'nope' }, '0.3.0');
    expect(result).toEqual({ ok: false, reason: 'unknown_band' });
  });
});

/**
 * Appends a synthetic 0.3.0-only item to the `guest` area. 'G9' is unused in
 * methodology/questions.yaml (guest runs G1..G7) and appears in no rules.yaml item list, so it
 * can only ever be added or filtered by the `since` logic under test.
 */
function withOutreachItem(m: Methodology): Methodology {
  const aug = structuredClone(m);
  const guest = aug.questions.categories.find((c) => c.id === 'guest')!;
  guest.items.push({
    id: 'G9',
    text: 'Synthetic outreach question',
    signal: 'evidence',
    since: '0.3.0',
    anchors: { lo: 'l', mid: 'm', hi: 'h' },
    reflection: 'Tell us.',
    theme: 'systems',
  });
  return aug;
}

describe('deriveDiagnosisForRun run version', () => {
  it('a pre-0.3.0 run scores against the old item list and stamps 0.2.0', () => {
    const aug = withOutreachItem(loadFixtureMethodology());
    const result = deriveDiagnosisForRun(completeResponses(), aug, { attendance_band: BAND }, '0.2.0');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.diagnosis.methodology_version).toBe('0.2.0');
    expect(
      result.effectiveMethodology.questions.categories
        .find((c) => c.id === 'guest')!
        .items.map((i) => i.id),
    ).not.toContain('G9');
  });

  it('a null run version behaves like a pre-0.3.0 run', () => {
    const aug = withOutreachItem(loadFixtureMethodology());
    const result = deriveDiagnosisForRun(completeResponses(), aug, { attendance_band: BAND }, null);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.diagnosis.methodology_version).toBe('0.2.0');
  });

  it('a 0.3.0 run scores against the new item and gets the methodology back by reference', () => {
    const aug = withOutreachItem(loadFixtureMethodology());
    // Responses are built from `aug`, so the new item is answered by EVERY guest respondent: the
    // fit is only computed over respondents who answered every item of an area (lib/engine/fit.ts),
    // so a respondent missing G9 is dropped from `guest` entirely — which is exactly what the next
    // test pins. This is also the suite's end-to-end proof that a 0.3.0 run scores successfully.
    const result = deriveDiagnosisForRun(completeResponsesFor(aug), aug, { attendance_band: BAND }, '0.3.0');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // toBe, never toEqual: effectiveMethodologyForRun returns the SAME reference for a run that
    // does not predate 0.3.0, and a structural clone would silently satisfy toEqual.
    expect(result.effectiveMethodology).toBe(aug);
  });

  it('a 0.3.0 run with the new item unanswered is blocked on that area', () => {
    const aug = withOutreachItem(loadFixtureMethodology());
    const result = deriveDiagnosisForRun(completeResponses(), aug, { attendance_band: BAND }, '0.3.0');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('incomplete_areas');
    if (result.reason !== 'incomplete_areas') return; // narrowing only — asserted unconditionally above
    expect(result.blockedAreas).toEqual(['guest']);
  });
});
