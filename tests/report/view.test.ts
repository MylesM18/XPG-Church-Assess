import { describe, it, expect } from 'vitest';
import { buildReportView } from '@/lib/report/view';
import { loadMethodology } from '@/lib/methodology/load';
import type { Diagnosis } from '@/lib/engine/types';
import type { ReportBlocks } from '@/lib/ai/fallback';

const methodology = loadMethodology();

function diagnosis(over: Partial<Diagnosis> = {}): Diagnosis {
  return {
    methodology_version: methodology.questions.version,
    throughput: 55,
    capacity: 60,
    gap: 5,
    categories: [
      { category_id: 'guest_experience', kind: 'stage', score: 30, belief: null, evidence: null,
        gap: null, gap_class: null, cohort_percentile: null, state: 'broken', respondent_count: 2 },
      { category_id: 'connections', kind: 'stage', score: 70, belief: null, evidence: null,
        gap: null, gap_class: null, cohort_percentile: null, state: 'ok', respondent_count: 2 },
    ],
    primary_constraint: { category_id: 'guest_experience' },
    contributing: [],
    do_not_work_on: [],
    gating_conditions: [],
    generosity_mode: null,
    blind_spots: [],
    dispersion_flags: [],
    dependencies: [],
    correlations: [],
    offer: { call_type: 'Diagnostic call', hook: 'Lets walk the chain together.' },
    confidence: 0.8,
    evidence_trail: [
      { claim: 'primary_constraint:guest_experience',
        refs: [{ kind: 'item', ref: 'G1', value: 3 }] },
    ],
    ...over,
  } as Diagnosis;
}

function blocks(over: Partial<ReportBlocks> = {}): ReportBlocks {
  return {
    verdict: 'Guest Experience is the constraint. It scored 30 out of 100.',
    next_step: 'Start with the first weekend touchpoint.',
    benchmark_note: 'Benchmarks are provisional priors.',
    ...over,
  };
}

const WITH_DISPERSION = {
  dispersion_flags: [{
    category_id: 'guest_experience',
    respondents: [{ label: 'Dana Okafor', mean: 3.1 }, { label: 'Sam Reyes', mean: 7.4 }],
    spread: 2.2,
  }],
};

describe('buildReportView', () => {
  it('resolves the verdict, score, confidence and chain stages', () => {
    const v = buildReportView(diagnosis(), blocks(), methodology, { audience: 'screen' });
    expect(v.verdict).toContain('Guest Experience');
    expect(v.throughput).toBe(55);
    expect(v.capacity).toBe(60);
    expect(v.gap).toBe(5);
    expect(v.confidence).toBe(0.8);
    expect(v.stages.length).toBeGreaterThan(0);
  });

  it('attaches evidence refs from the primary-constraint receipt', () => {
    const v = buildReportView(diagnosis(), blocks({ evidence: 'Two of three guest items are low.' }),
      methodology, { audience: 'screen' });
    expect(v.evidence?.refs).toEqual([{ kind: 'item', ref: 'G1', value: 3 }]);
  });

  it('omits optional sections whose blocks are absent', () => {
    const v = buildReportView(diagnosis(), blocks(), methodology, { audience: 'screen' });
    expect(v.evidence).toBeUndefined();
    expect(v.blindSpot).toBeUndefined();
    expect(v.cost).toBeUndefined();
    expect(v.gating).toBeUndefined();
    expect(v.dispersion).toBeUndefined();
  });

  it('keeps respondent names for the screen audience', () => {
    const v = buildReportView(diagnosis(WITH_DISPERSION), blocks({ dispersion: 'Your leaders split.' }),
      methodology, { audience: 'screen' });
    expect(v.dispersion?.respondents.map((r) => r.label)).toEqual(['Dana Okafor', 'Sam Reyes']);
  });

  it('drops respondent names for the pdf audience but keeps the section', () => {
    const v = buildReportView(diagnosis(WITH_DISPERSION), blocks({ dispersion: 'Your leaders split.' }),
      methodology, { audience: 'pdf' });
    expect(v.dispersion).toBeDefined();
    expect(v.dispersion?.text).toBe('Your leaders split.');
    expect(v.dispersion?.respondents).toEqual([]);
  });

  it('produces no phantom sections when there is no structural constraint', () => {
    const v = buildReportView(
      diagnosis({ primary_constraint: null, evidence_trail: [] }), blocks(), methodology,
      { audience: 'pdf' },
    );
    expect(v.evidence).toBeUndefined();
    expect(v.verdict).toBeTruthy();
    expect(v.appendix.categories.length).toBe(2);
  });

  it('drops respondent names for the shared audience but keeps the section', () => {
    const v = buildReportView(diagnosis(WITH_DISPERSION), blocks({ dispersion: 'Your leaders split.' }),
      methodology, { audience: 'shared' });
    expect(v.dispersion).toBeDefined();
    expect(v.dispersion?.text).toBe('Your leaders split.');
    expect(v.dispersion?.respondents).toEqual([]);
  });

  it('drops the next-step CTA for the shared audience', () => {
    const v = buildReportView(diagnosis(), blocks(), methodology, { audience: 'shared' });
    expect(v.nextStep).toBeUndefined();
  });

  // Asserted separately from 'shared' on purpose: a future change to one audience must not
  // be able to silently redefine the other.
  it('keeps the next-step CTA for the pdf audience', () => {
    const v = buildReportView(diagnosis(), blocks(), methodology, { audience: 'pdf' });
    expect(v.nextStep?.text).toBe('Start with the first weekend touchpoint.');
  });

  it('keeps the next-step CTA for the screen audience', () => {
    const v = buildReportView(diagnosis(), blocks(), methodology, { audience: 'screen' });
    expect(v.nextStep?.text).toBe('Start with the first weekend touchpoint.');
  });
});
