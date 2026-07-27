import { describe, it, expect } from 'vitest';
import { PDFParse } from 'pdf-parse';
import { renderReportDocument } from '@/lib/report/pdf/render';
import { buildReportView } from '@/lib/report/view';
import { loadMethodology } from '@/lib/methodology/load';
import { fallbackProse } from '@/lib/ai/fallback';
import type { Diagnosis } from '@/lib/engine/types';

const methodology = loadMethodology();

const SENTINEL = 'Zzyzx Quimby';

function diagnosis(): Diagnosis {
  return {
    methodology_version: methodology.questions.version,
    overall_score: 55,
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
    dispersion_flags: [{
      category_id: 'guest_experience',
      respondents: [{ label: SENTINEL, mean: 3.1 }, { label: 'Sam Reyes', mean: 7.4 }],
      spread: 2.2,
    }],
    calibration: { people: [], spread: 0 },
    offer: { type: 'guest_retention', call_type: 'Diagnostic call', hook: 'Lets walk the chain together.' },
    confidence: 0.8,
    evidence_trail: [
      { claim: 'primary_constraint:guest_experience', refs: [{ kind: 'item', ref: 'G1', value: 3 }] },
    ],
  } as Diagnosis;
}

/**
 * pdf-parse@2.4.5 is a v2 rewrite of the classic package: it exports the
 * `PDFParse` class only (no default-exported parse function). We extract
 * text via the real pdfjs-based parser it wraps, which is what actually
 * defeats react-pdf's content-stream compression — a raw buffer.includes()
 * search would pass even when text is visibly rendered.
 */
async function extractText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

// Narrowed to 'pdf': every call site renders for the pdf audience, and a
// 'screen' audience view is expected to throw (see the guard test below)
// before renderToBuffer ever produces something extractText could read.
// Widening this back to 'screen' | 'pdf' would silently re-open the trap a
// reviewer flagged — a future test passing 'screen' here would throw with the
// confidentiality guard's message instead of whatever it meant to exercise.
async function renderText(audience: 'pdf'): Promise<string> {
  const d = diagnosis();
  const blocks = fallbackProse(d, methodology);
  const view = buildReportView(d, blocks, methodology, { audience });
  const buffer = await renderReportDocument({
    view,
    churchName: 'Grace Church',
    brandColor: '#3A4A6B',
    monogram: 'GC',
    generatedAt: new Date('2026-07-18T00:00:00Z'),
  });
  return extractText(buffer);
}

describe('ReportDocument', () => {
  it('renders the church name and the verdict', async () => {
    const text = await renderText('pdf');
    expect(text).toContain('Grace Church');
    expect(text).toContain('Guest Experience');
  }, 30_000);

  it('NEVER prints a respondent name in the pdf audience', async () => {
    const text = await renderText('pdf');
    expect(text).not.toContain(SENTINEL);
    expect(text).not.toContain('Sam Reyes');
  }, 30_000);

  it('still renders the disagreement narrative without the names', async () => {
    const text = await renderText('pdf');
    expect(text.toLowerCase()).toContain('disagree');
  }, 30_000);

  it('renders with no AI prose (prime directive 1)', async () => {
    const text = await renderText('pdf');
    expect(text).toContain('Benchmarks');
    expect(text.length).toBeGreaterThan(200);
  }, 30_000);

  // The 'pdf' audience rendering successfully (and the sibling tests above
  // proving no respondent name is present in that output) is already covered
  // by the tests above, so it isn't repeated here. This test proves the
  // opposite side: the fail-closed guard in render.ts actually fires.
  it('throws when a screen-audience view carrying respondent names reaches the renderer', async () => {
    const d = diagnosis();
    const blocks = fallbackProse(d, methodology);
    // Built directly (bypassing renderText) because the render is expected to
    // reject before renderToBuffer ever runs, so there is no buffer for
    // renderText's extractText step to read.
    const view = buildReportView(d, blocks, methodology, { audience: 'screen' });

    // Sanity check: this test only proves the guard is reachable if the
    // fixture actually carries respondent names for the screen audience. If a
    // future edit to diagnosis() or view.ts silently emptied this, the
    // .rejects assertion below would fail to reject too — but assert it
    // directly here so a break in this precondition is diagnosed immediately.
    expect(view.dispersion?.respondents.length).toBeGreaterThan(0);

    // renderReportDocument is declared as a plain (non-async) function, so its
    // guard throws synchronously rather than returning a rejected promise.
    // Calling it directly as expect(renderReportDocument(...)) would let that
    // throw escape before .rejects ever attaches to it. Wrapping the call in
    // an async closure defers evaluation until the closure runs, so the throw
    // becomes a rejection .rejects can observe — the same reason renderText's
    // own `await renderReportDocument(...)` above is safe.
    await expect(
      (async () =>
        renderReportDocument({
          view,
          churchName: 'Grace Church',
          brandColor: '#3A4A6B',
          monogram: 'GC',
          generatedAt: new Date('2026-07-18T00:00:00Z'),
        }))(),
    ).rejects.toThrow('view carries respondent names');
  });
});
