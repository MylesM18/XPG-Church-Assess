import { describe, it, expect } from 'vitest';
import { isValidElement } from 'react';
import { buildReportView, type ReportAudience } from '@/lib/report/view';
import { loadMethodology } from '@/lib/methodology/load';
import { fallbackProse } from '@/lib/ai/fallback';
import type { Diagnosis } from '@/lib/engine/types';
import { VerdictHeader } from '@/app/app/[churchId]/diagnosis/report/cover';

/** Same tiny walker tests/report/components.test.ts uses locally to read a plain-function
 *  component's output without a DOM (it's file-local there, not exported, hence duplicated). */
function textOf(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  if (isValidElement(node)) return textOf((node.props as { children?: unknown }).children);
  return '';
}

const methodology = loadMethodology();

function diagnosis(): Diagnosis {
  return {
    methodology_version: methodology.questions.version,
    throughput: 55,
    capacity: 70,
    gap: 15,
    categories: [
      { category_id: 'guest', kind: 'stage', score: 30, belief: null, evidence: null,
        gap: null, gap_class: null, cohort_percentile: null, state: 'broken', respondent_count: 2, excluded_partial: 0, questionEffects: [] },
      { category_id: 'conn', kind: 'stage', score: 70, belief: null, evidence: null,
        gap: null, gap_class: null, cohort_percentile: null, state: 'ok', respondent_count: 2, excluded_partial: 0, questionEffects: [] },
    ],
    primary_constraint: { category_id: 'guest' },
    contributing: [],
    do_not_work_on: [],
    gating_conditions: [],
    generosity_mode: null,
    blind_spots: [],
    disagreement_flags: [],
    calibration: { people: [], spread: 0 },
    dependencies: [],
    correlations: [],
    offer: { type: 'guest_retention', call_type: 'Diagnostic call', hook: 'Lets walk the chain together.' },
    confidence: 0.8,
    evidence_trail: [],
  } as Diagnosis;
}

const d = diagnosis();
const blocks = fallbackProse(d, methodology);

/**
 * Task 16, Step 3. Content and ordering cannot drift across screen/pdf/shared because all
 * three surfaces consume buildReportView (spec §7.4) — this pins that shared source directly.
 *
 * IMPORTANT SCOPE NOTE (Task 16 Resolution 3): this only proves the VIEW BUILDER is
 * audience-stable, which was never seriously in doubt — buildAreas() (lib/report/view.ts)
 * doesn't even take an `audience` parameter, so `.areas` structurally cannot differ by
 * audience today. It does NOT prove either renderer (lib/report/pdf/document.tsx,
 * app/r/[shareToken]/page.tsx) actually respects that order when it paints pixels/text. A
 * document.tsx that rendered the eight dossiers reversed, or dropped one, would pass this
 * file untouched. See the renderer-level ordering test in tests/report/pdf-document.test.ts
 * for the check that closes that gap.
 */
describe('report view audience parity (Task 16 drift guard)', () => {
  it('all three audiences produce the same eight areas in the same order', () => {
    const ids = (audience: ReportAudience) =>
      buildReportView(d, blocks, methodology, { audience }).areas.map((a) => a.category_id);
    expect(ids('pdf')).toEqual(ids('screen'));
    expect(ids('shared')).toEqual(ids('screen'));
  });

  it('all three audiences produce the same cover numbers', () => {
    for (const audience of ['screen', 'pdf', 'shared'] as const) {
      const v = buildReportView(d, blocks, methodology, { audience });
      expect(v.cover.throughput).toBe(d.throughput);
      expect(v.cover.capacity).toBe(d.capacity);
    }
  });
});

/**
 * FIX ROUND 1 (Task 4 review, Finding F3). Task 4 deleted `lib/report/pdf/document.tsx`'s own
 * confidenceBand() along with the ReportView-era PDF verdict block, and — correctly — de-imported
 * it here. But the describe block that went with it also covered cover.tsx's `VerdictHeader`,
 * whose own private confidenceBand() is the live 0.75/0.5 threshold logic still shown on the
 * authenticated diagnosis page (app/app/[churchId]/diagnosis/report/cover.tsx:12-16) until Tasks
 * 8/9 retire that page. Deleting that half too left the thresholds with zero surviving coverage.
 *
 * This restores ONLY the screen-side half: VerdictHeader called directly as a plain function (no
 * DOM/renderer needed — same pattern tests/report/components.test.ts uses), no comparison against
 * any PDF-side value. `lib/report/pdf/document.tsx` no longer has a confidenceBand of its own to
 * compare against.
 */
describe('VerdictHeader confidence bands (cover.tsx)', () => {
  it('labels confidence High/Moderate/Low on both sides of the 0.75 and 0.5 thresholds', () => {
    const cases: Array<{ confidence: number; label: string }> = [
      { confidence: 0.75, label: 'High' },
      { confidence: 0.74, label: 'Moderate' },
      { confidence: 0.5, label: 'Moderate' },
      { confidence: 0.49, label: 'Low' },
    ];
    for (const { confidence, label } of cases) {
      const screenText = textOf(VerdictHeader({ verdict: 'irrelevant for this test', confidence }));
      expect(screenText, `VerdictHeader at confidence=${confidence}`).toContain(`Confidence: ${label}`);
    }
  });
});
