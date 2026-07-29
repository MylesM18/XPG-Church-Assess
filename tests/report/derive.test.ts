import { describe, it, expect } from 'vitest';
import { deriveDiagnosisForRun } from '@/lib/report/derive';
import { diagnose } from '../../lib/engine';
import { loadFixtureMethodology, answers } from '../engine/helpers';
import type { Response } from '@/lib/engine/types';

// A real attendance-band key is underscore-delimited ('100_249'); benchmarkFor() THROWS on an
// unknown band, so this is the same literal every other engine/report fixture in this suite uses
// (e.g. tests/report/audience.test.ts, tests/report/view.test.ts).
const BAND = '100_249';
const ALL = ['guest', 'conn', 'disc', 'vol', 'gen', 'gov', 'comm', 'sys'];

const methodology = loadFixtureMethodology();

/** A COMPLETE response set: every one of the eight areas answered in full by two respondents. */
function completeResponses(): Response[] {
  return ALL.flatMap((id) => [
    ...answers(methodology, id, id === 'vol' ? 2 : 8, 'Pastor Dana', 'u-1'),
    ...answers(methodology, id, id === 'vol' ? 9 : 7, 'Elder Sam', 'u-2'),
  ]);
}

describe('deriveDiagnosisForRun', () => {
  it('re-derives the SAME Diagnosis the engine produces from (responses, methodology, ctx)', () => {
    // Score identity is the whole point of CT-2(c): re-deriving at render must equal what the
    // deterministic engine would produce, so nothing about the numbers can drift from diagnose().
    const responses = completeResponses();
    const ctx = { attendance_band: BAND };

    const result = deriveDiagnosisForRun(responses, methodology, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable — asserted ok above');
    expect(result.diagnosis).toEqual(diagnose(responses, methodology, ctx));
  });

  it('blocks with incomplete_areas naming exactly the area whose responses are missing', () => {
    // Drop every response for one area → its fit.n is 0 → the diagnosis gate blocks it.
    const responses = completeResponses().filter((r) => r.category_id !== 'disc');
    const result = deriveDiagnosisForRun(responses, methodology, { attendance_band: BAND });
    expect(result).toEqual({ ok: false, reason: 'incomplete_areas', blockedAreas: ['disc'] });
  });

  it('reports unknown_band when every area is complete but the band is not a benchmark key', () => {
    // Gate passes (all areas complete), so the failure is specifically the band guard — the same
    // guard generateDiagnosis applies before assemble() (which throws on an unknown band).
    const result = deriveDiagnosisForRun(completeResponses(), methodology, { attendance_band: 'nope' });
    expect(result).toEqual({ ok: false, reason: 'unknown_band' });
  });
});
