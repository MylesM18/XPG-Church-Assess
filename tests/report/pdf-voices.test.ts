import { describe, it, expect } from 'vitest';
import { PDFParse } from 'pdf-parse';
import { renderReportDocument } from '@/lib/report/pdf/render';
import { buildReportView } from '@/lib/report/view';
import { loadMethodology } from '@/lib/methodology/load';
import { fallbackProse } from '@/lib/ai/fallback';
import type { Diagnosis } from '@/lib/engine/types';

const methodology = loadMethodology();

const SENTINEL = 'Zzyzx Quimby';

/**
 * Verbatim copy of tests/report/pdf-document.test.ts's fixture builder. Not exported from that
 * file (test modules don't export symbols for import by siblings), so duplicated here rather
 * than reached into — kept byte-identical to avoid a second, drifting definition of "the suite's
 * standard fixture". category_ids ('guest_experience'/'connections') deliberately don't match
 * the methodology's real chain/enabler ids ('guest'/'conn'/...), which is why buildAreas falls
 * every area back to score 0 / n 0 except the two named here — irrelevant to this file, which
 * only cares about view.areas[0]/[1]'s fixed identity (always 'guest'/'conn' regardless of what
 * this fixture's own category_ids are), not their scores.
 */
function diagnosis(): Diagnosis {
  return {
    methodology_version: methodology.questions.version,
    throughput: 55,
    capacity: 70,
    gap: 15,
    categories: [
      { category_id: 'guest_experience', kind: 'stage', score: 30, belief: null, evidence: null,
        gap: null, gap_class: null, cohort_percentile: null, state: 'broken', respondent_count: 2, excluded_partial: 0, questionEffects: [] },
      { category_id: 'connections', kind: 'stage', score: 70, belief: null, evidence: null,
        gap: null, gap_class: null, cohort_percentile: null, state: 'ok', respondent_count: 2, excluded_partial: 0, questionEffects: [] },
    ],
    primary_constraint: { category_id: 'guest_experience' },
    contributing: [],
    do_not_work_on: [],
    gating_conditions: [],
    generosity_mode: null,
    blind_spots: [],
    disagreement_flags: [{
      category_id: 'guest_experience',
      respondents: [{ label: SENTINEL, mean: 3.1 }, { label: 'Sam Reyes', mean: 7.4 }],
      spread: 2.2,
    }],
    calibration: { people: [], spread: 0 },
    dependencies: [],
    correlations: [],
    offer: { type: 'guest_retention', call_type: 'Diagnostic call', hook: 'Lets walk the chain together.' },
    confidence: 0.8,
    evidence_trail: [
      { claim: 'primary_constraint:guest_experience', refs: [{ kind: 'item', ref: 'G1', value: 3 }] },
    ],
  } as Diagnosis;
}

/**
 * Verbatim copy of tests/report/pdf-document.test.ts's text-extraction helper — same rationale
 * as diagnosis() above. Real pdfjs-based extraction (not a raw buffer.includes()), which is what
 * actually defeats react-pdf's content-stream compression.
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

// The fixture's other renderReportDocument args, exactly as pdf-document.test.ts's renderText()
// helper supplies them.
const DOC_ARGS = {
  churchName: 'Grace Church',
  brandColor: '#3A4A6B',
  monogram: 'GC',
  generatedAt: new Date('2026-07-18T00:00:00Z'),
};

describe('ReportDocument — outreach voices', () => {
  // The heading renders via s.voicesLabel, which (matching s.fieldLabel's existing convention —
  // see the brief) carries textTransform: 'uppercase'. Confirmed by rendering and inspecting the
  // actual extracted text, not assumed: @react-pdf/renderer applies textTransform to the actual
  // glyphs it lays out, so pdf-parse extracts "VOICES ON OUTREACH", not the JSX literal's mixed
  // case — the exact same effect this file's s.coverLabel comment already documents for "Overall
  // church health" → "OVERALL CHURCH HEALTH". The prompt/entry text below has no such style, so it
  // extracts unchanged.
  //
  // Mutation this catches: the voices.length > 0 gate (or the whole sibling <View>) deleted or
  // inverted so an area's group never renders at all; or the group rendering the heading/prompt
  // but dropping the entries map. Checks the ACTUAL injected prompt/entry strings, not just "some
  // text appeared" — a test that only checked for the presence of ANY new text would pass even if
  // document.tsx printed the wrong prompt or the wrong entry.
  it('prints outreach voices when an area carries them', async () => {
    const d = diagnosis();
    const blocks = fallbackProse(d, methodology);
    const view = buildReportView(d, blocks, methodology, { audience: 'pdf' });
    view.areas[0]!.outreachVoices = [
      { itemId: 'G6', reflectionPrompt: 'Tell us about one person.', entries: ['She came back.'] },
    ];
    const buffer = await renderReportDocument({ view, ...DOC_ARGS });
    const text = await extractText(buffer);

    expect(text).toContain('VOICES ON OUTREACH');
    expect(text).toContain('Tell us about one person.');
    expect(text).toContain('She came back.');
  }, 30_000);

  // Same query as the positive test above ('VOICES ON OUTREACH', case-matched to how s.voicesLabel's
  // textTransform: 'uppercase' actually extracts — see the comment above) — a negative test that
  // checked for different text would pass vacuously regardless of whether the gate actually worked.
  // This fixture is untouched: every area's outreachVoices key is absent (Task 14's contract), not
  // an empty array, so this also proves the absent-key case renders exactly like the pre-Task-17
  // document — no stray heading, no empty section.
  it('prints no voices section when no area carries them', async () => {
    const d = diagnosis();
    const blocks = fallbackProse(d, methodology);
    const view = buildReportView(d, blocks, methodology, { audience: 'pdf' });
    const buffer = await renderReportDocument({ view, ...DOC_ARGS });
    const text = await extractText(buffer);

    expect(text).not.toContain('VOICES ON OUTREACH');
  }, 30_000);

  // Task 15's review found this exact gap on the screen renderer: order is an anonymity property
  // (buildOutreachVoices sorts entries with a plain lexicographic compare specifically so ordering
  // carries no information about who said what), so document.tsx must render exactly the sequence
  // it was handed, never re-derive one of its own. Entries below are deliberately NOT alphabetical
  // ('First' < 'Second' < 'Third' lexicographically) so a render-time .sort() or .reverse() would
  // be caught — using already-sorted entries here would let that exact mutation slip through.
  it('preserves entry order exactly as handed in, never re-sorting at render time', async () => {
    const d = diagnosis();
    const blocks = fallbackProse(d, methodology);
    const view = buildReportView(d, blocks, methodology, { audience: 'pdf' });
    view.areas[0]!.outreachVoices = [
      {
        itemId: 'G6',
        reflectionPrompt: 'Order check.',
        entries: ['Third entry text.', 'First entry text.', 'Second entry text.'],
      },
    ];
    const buffer = await renderReportDocument({ view, ...DOC_ARGS });
    const text = await extractText(buffer);

    const thirdAt = text.indexOf('Third entry text.');
    const firstAt = text.indexOf('First entry text.');
    const secondAt = text.indexOf('Second entry text.');
    expect(thirdAt, 'expected the first-given entry in the PDF').toBeGreaterThan(-1);
    expect(firstAt, 'expected the second-given entry after the first-given one').toBeGreaterThan(thirdAt);
    expect(secondAt, 'expected the third-given entry after the second-given one').toBeGreaterThan(firstAt);
  }, 30_000);

  // OutreachVoicesGroup carries no per-person field, so this mostly documents the contract — but
  // it fails hard against a regression that adds a per-entry label ("Member 1", "Respondent A") or
  // an ordinal prefix ("1. ") alongside a quote, which is the exact failure mode the fail-closed
  // guard in render.ts exists to make unreachable. Region-isolated to the voices block itself
  // (between its own heading — 'VOICES ON OUTREACH', see the case note on the first test above —
  // and the next area's dossier header) so unrelated text elsewhere in an 8-area, multi-layer
  // document cannot mask a real leak.
  it('attributes no respondent name, label, or ordinal to a voice entry', async () => {
    const d = diagnosis();
    const blocks = fallbackProse(d, methodology);
    const view = buildReportView(d, blocks, methodology, { audience: 'pdf' });
    view.areas[0]!.outreachVoices = [
      { itemId: 'G6', reflectionPrompt: 'Tell us about one person.', entries: ['He stayed.', 'She came back.'] },
    ];
    const buffer = await renderReportDocument({ view, ...DOC_ARGS });
    const text = await extractText(buffer);

    const start = text.indexOf('VOICES ON OUTREACH');
    const end = text.indexOf(view.areas[1]!.name, start);
    expect(start, 'expected "VOICES ON OUTREACH" in the PDF').toBeGreaterThan(-1);
    expect(end, 'expected the next area\'s dossier header to follow the voices block').toBeGreaterThan(start);
    const voicesText = text.slice(start, end);

    expect(voicesText).not.toContain(SENTINEL);
    expect(voicesText).not.toContain('Sam Reyes');
    expect(voicesText).not.toMatch(/member\s*\d|respondent\s*[a-z\d]/i);
    expect(voicesText).not.toMatch(/\d+[.):]\s*(He stayed|She came back)/);
  }, 30_000);
});
