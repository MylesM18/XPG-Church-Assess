import { describe, it, expect } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import type { DocumentProps } from '@react-pdf/renderer';
import { PDFParse } from 'pdf-parse';
import { ReportDocument } from '@/lib/report/pdf/document';
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

async function renderText(audience: 'screen' | 'pdf'): Promise<string> {
  const d = diagnosis();
  const blocks = fallbackProse(d, methodology);
  const view = buildReportView(d, blocks, methodology, { audience });
  // renderToBuffer's type expects a ReactElement<DocumentProps> — i.e. a
  // literal <Document>. ReportDocument is a wrapper component that renders
  // one, so the element shape at runtime is correct but the prop types
  // (ReportDocumentProps vs DocumentProps) don't structurally overlap.
  const element = createElement(ReportDocument, {
    view,
    churchName: 'Grace Church',
    brandColor: '#3A4A6B',
    monogram: 'GC',
    generatedAt: new Date('2026-07-18T00:00:00Z'),
  }) as unknown as ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(element);
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
});
