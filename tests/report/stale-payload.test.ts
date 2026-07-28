import { describe, it, expect } from 'vitest';
import { resolveReportView } from '@/lib/report/view';
import { loadMethodology } from '@/lib/methodology/load';
import { fallbackProse } from '@/lib/ai/fallback';
import type { Diagnosis } from '@/lib/engine/types';

const methodology = loadMethodology();

/**
 * Whole-branch review, finding CT-1. Genuinely pre-branch-shaped, not a hand-set
 * `storedVersion` string paired with a fresh view (the shortcut
 * tests/report/components.test.ts's ReportBody test uses, and precisely the combination
 * that let this ship green — that test builds a fully-populated ReportView from a live
 * diagnose() and only fakes the version string, so it never actually exercises what an old
 * row's DATA looks like).
 *
 * `diagnoses.payload` is cached JSONB, read back with a bare `as Diagnosis` cast in all
 * three routes (app/app/[churchId]/diagnosis/page.tsx, app/r/[shareToken]/page.tsx,
 * app/api/report/[runId]/pdf/route.ts) and never runtime-validated. A row generated before
 * methodology_version 0.2.0 carries `overall_score` and `dispersion_flags` — never
 * `throughput`/`capacity`/`gap`, `disagreement_flags`, `dependencies`, `correlations`, or
 * `calibration`, all of which are required, non-optional fields on the CURRENT `Diagnosis`
 * type. Typed `as unknown as Diagnosis`, not `Partial<Diagnosis>`, precisely so TypeScript
 * cannot "helpfully" fill in the new required fields this fixture must NOT have — a
 * `Partial<Diagnosis>` cast would let a future required field silently vanish from this
 * fixture without the compiler ever telling us we stopped testing the old shape.
 */
const STALE_PAYLOAD = {
  methodology_version: '0.1.0',
  overall_score: 52,
  categories: [
    {
      category_id: 'guest', kind: 'stage', score: 30, belief: null, evidence: null,
      gap: null, gap_class: null, cohort_percentile: null, state: 'broken',
      respondent_count: 2, excluded_partial: 0, questionEffects: [],
    },
  ],
  primary_constraint: { category_id: 'guest' },
  contributing: [],
  do_not_work_on: [],
  gating_conditions: [],
  generosity_mode: null,
  blind_spots: [],
  dispersion_flags: [],
  offer: { type: 'guest_retention', call_type: 'Diagnostic call', hook: 'Lets walk the chain together.' },
  confidence: 0.8,
  evidence_trail: [],
} as unknown as Diagnosis;

describe('resolveReportView on a genuinely pre-branch-shaped payload (CT-1)', () => {
  it('reports the payload as stale without ever calling fallbackProse or buildReportView', () => {
    let resolution: ReturnType<typeof resolveReportView> | undefined;
    expect(() => {
      resolution = resolveReportView(
        STALE_PAYLOAD,
        methodology,
        // If this thunk were ever invoked on a stale payload, it would throw exactly the
        // error the second test below pins — resolveReportView's whole job is to guarantee
        // it never is.
        () => fallbackProse(STALE_PAYLOAD, methodology),
        { audience: 'screen' },
      );
    }).not.toThrow();
    expect(resolution).toEqual({ stale: true });
  });

  it('documents the mechanism: fallbackProse itself throws on this exact payload shape', () => {
    // Not exercised through any route — this pins WHY resolveReportView's guard exists.
    // d.disagreement_flags[0] (lib/ai/fallback.ts) reads a key this payload never had; the
    // old shape only ever carried dispersion_flags. Reproduces, word for word, the error the
    // whole-branch reviewer got running a real 0.1.0-shaped payload through this function.
    expect(() => fallbackProse(STALE_PAYLOAD, methodology)).toThrow(
      /Cannot read propert(?:y|ies) of undefined/,
    );
  });
});
