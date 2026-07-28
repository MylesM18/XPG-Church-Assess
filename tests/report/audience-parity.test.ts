import { describe, it, expect } from 'vitest';
import { isValidElement } from 'react';
import { buildReportView, type ReportAudience } from '@/lib/report/view';
import { loadMethodology } from '@/lib/methodology/load';
import { fallbackProse } from '@/lib/ai/fallback';
import type { Diagnosis } from '@/lib/engine/types';
import { VerdictHeader } from '@/app/app/[churchId]/diagnosis/report/cover';
import { confidenceBand as pdfConfidenceBand } from '@/lib/report/pdf/document';

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
 * Task 16 review round 2, Finding 1. lib/report/pdf/document.tsx hand-duplicates
 * app/app/[churchId]/diagnosis/report/cover.tsx's private confidenceBand() (react-pdf cannot
 * render cover.tsx's DOM output, so only the pure band logic can travel, copied by hand — see
 * document.tsx's comment on its own confidenceBand for why). This test is what makes that
 * comment true: it pins the 0.75/0.5 thresholds by checking both implementations agree at each
 * boundary and just below it — cover.tsx's real behavior via its exported VerdictHeader
 * component (called directly as a plain function, no DOM/renderer needed — same pattern
 * tests/report/components.test.ts uses), document.tsx's via its own exported confidenceBand.
 */
describe('confidence band parity: cover.tsx (screen/shared) vs document.tsx (pdf)', () => {
  it('pins the 0.75 and 0.5 thresholds so both hand-duplicated confidenceBand() copies must agree', () => {
    const cases: Array<{ confidence: number; label: string }> = [
      { confidence: 0.75, label: 'High' },
      { confidence: 0.74, label: 'Moderate' },
      { confidence: 0.5, label: 'Moderate' },
      { confidence: 0.49, label: 'Low' },
    ];
    for (const { confidence, label } of cases) {
      const screenText = textOf(VerdictHeader({ verdict: 'irrelevant for this test', confidence }));
      expect(screenText, `screen VerdictHeader at confidence=${confidence}`).toContain(`Confidence: ${label}`);
      expect(pdfConfidenceBand(confidence).label, `pdf confidenceBand at confidence=${confidence}`).toBe(label);
    }
  });
});
