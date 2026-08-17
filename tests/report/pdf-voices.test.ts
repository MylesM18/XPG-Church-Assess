import { describe, it, expect } from 'vitest';
import { PDFParse } from 'pdf-parse';
import { renderReportDocument } from '@/lib/report/pdf/render';
import { assembleFallbackOnly } from '@/lib/report/compose';
import type { AssembledSection } from '@/lib/report/compose';
import { buildFacts, type ChurchFacts, type FactsPack } from '@/lib/report/facts';
import { loadMethodology } from '@/lib/methodology/load';
import { coverModel } from '@/lib/report/charts';
import type { Diagnosis, DiagnosisCategory, Response } from '@/lib/engine/types';

const methodology = loadMethodology();

/**
 * Task 5 (re-home the fail-closed anonymity guard): pre-Task-4 this file tested a distinct
 * "outreach voices" UI grouping (heading 'VOICES ON OUTREACH', per-area outreachVoices[]) that
 * lived on the old ReportView/AreaDossierView model. That grouping does not survive the Task 4
 * rewrite of document.tsx onto AssembledSection[] — the equivalent content (buildOutreachVoices'
 * reflection-derived lines) is now folded into s8 ("What leaders are saying")'s plain
 * fallback.bullets, same as every other section, per lib/report/fallback-sections.ts's
 * s8Bullets(). The four tests below are re-pointed onto that: same properties (voices render,
 * absent when there are none, order preserved, no attribution leaks), new mechanism.
 *
 * Fixture idiom duplicated from tests/report/pdf-document.test.ts (that file's own header
 * explains why: not exported, and this suite's established convention is to duplicate rather than
 * share fixture builders across sibling test files — see the ORIGINAL version of this comment,
 * kept here for the same reason, now pointed at the current fixture instead of the retired
 * diagnosis()/buildReportView() one).
 */

const CAT_IDS = ['guest', 'conn', 'disc', 'vol', 'gen', 'gov', 'comm', 'sys'] as const;
const SCORES = [72, 68, 66, 61, 58, 70, 55, 64];

function makeCategory(id: string, score: number, over: Partial<DiagnosisCategory> = {}): DiagnosisCategory {
  return {
    category_id: id,
    kind: (['gov', 'comm', 'sys'].includes(id) ? 'enabler' : 'stage') as DiagnosisCategory['kind'],
    score,
    belief: null,
    evidence: null,
    gap: null,
    gap_class: null,
    cohort_percentile: 40,
    state: 'ok',
    respondent_count: 3,
    excluded_partial: 0,
    questionEffects: [],
    ...over,
  };
}

function makeDiagnosis(over: Partial<Diagnosis> = {}): Diagnosis {
  return {
    methodology_version: '0.3.0',
    throughput: 60,
    capacity: 70,
    gap: 10,
    categories: CAT_IDS.map((id, i) => makeCategory(id, SCORES[i]!)),
    primary_constraint: null,
    contributing: [],
    do_not_work_on: [],
    gating_conditions: [],
    generosity_mode: 'both',
    blind_spots: [],
    disagreement_flags: [],
    calibration: { people: [], spread: 1.1 },
    dependencies: [],
    correlations: [],
    offer: { type: 'x', call_type: 'call', hook: 'h' },
    confidence: 0.85,
    evidence_trail: [],
    ...over,
  };
}

const CHURCH: ChurchFacts = {
  name: 'Grace Chapel',
  denomination: 'Independent',
  context: 'suburban',
  attendance_band: '250_499',
  adults_band: '310',
  staff_fte_band: '4.5',
  budget_band: '$750k',
  church_age_band: '42 years',
  growth_trajectory: 'plateaued',
  campuses_band: '2',
  facility_status: 'owned',
  leadership_history: 'Senior pastor since 2014.',
  consultant_notes: 'No major changes since the last assessment.',
};

function resp(item_id: string, category_id: string, value: number, who: string): Response {
  return { category_id, item_id, value, respondent_label: who, respondent_id: who };
}

const RESPONSES: Response[] = [
  resp('G1', 'guest', 7, 'a'),
  resp('G1', 'guest', 8, 'b'),
  resp('C1', 'conn', 7, 'a'),
  resp('D1', 'disc', 6, 'b'),
  resp('V1', 'vol', 6, 'c'),
  resp('GEN1', 'gen', 6, 'a'),
];

/**
 * Verbatim-in-spirit copy of tests/report/pdf-document.test.ts's text-extraction helper — same
 * rationale as that file's own comment on it. Real pdfjs-based extraction (not a raw
 * buffer.includes()), which is what actually defeats react-pdf's content-stream compression.
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

function factsFor(reflections: ReadonlyArray<{ item_id: string; reflection: string | null }> = []): {
  facts: FactsPack;
  reflections: ReadonlyArray<{ item_id: string; reflection: string | null }>;
} {
  const facts = buildFacts({
    methodology,
    responses: RESPONSES,
    church: CHURCH,
    completedAt: '2026-08-10T00:00:00Z',
    labelSource: { kind: 'known', labels: [] },
    diagnosis: makeDiagnosis({ primary_constraint: null, gating_conditions: [], generosity_mode: null }),
  });
  return { facts, reflections };
}

function sectionsFor(reflections: ReadonlyArray<{ item_id: string; reflection: string | null }> = []): AssembledSection[] {
  const { facts } = factsFor(reflections);
  return assembleFallbackOnly({ facts, methodology, reflections: [...reflections] });
}

const DOC_ARGS = {
  churchName: 'Grace Chapel',
  brandColor: '#3A4A6B',
  monogram: 'GC',
  generatedAt: new Date('2026-07-18T00:00:00Z'),
  labels: [] as string[],
  stale: false,
  cover: coverModel(factsFor().facts, methodology),
};

const S8_TITLE = 'What leaders are saying'; // methodology.report.sections.s8.title
const S9_TITLE = 'Strategic direction'; // methodology.report.sections.s9.title — s8's region boundary

/**
 * @react-pdf/renderer wraps long bullet text at the page width, inserting a newline mid-sentence
 * — confirmed by rendering and inspecting the actual extracted text, not assumed ("She came back
 * the next week." extracted as "She came back\nthe next week."). Collapsing whitespace before a
 * `toContain` check on a full sentence makes the assertion robust to wrap position without
 * weakening what it proves — the words and their order are unchanged either way.
 */
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('ReportDocument — outreach voices (folded into s8 "What leaders are saying")', () => {
  // Replaces "prints outreach voices when an area carries them". G6 ('guest' category) is the
  // same reflection-bearing item id the retired version of this test used; its methodology
  // `reflection` prompt is unchanged by Task 4 (buildOutreachVoices, view.ts, is still the
  // function fallback-sections.ts's s8Bullets calls). Checks the actual injected prompt/entry
  // strings, not just "some new text appeared" — a test that only checked for ANY new text would
  // pass even if the wrong prompt or the wrong entry rendered.
  it('prints reflection-derived content in "What leaders are saying" when a reflection exists', async () => {
    const sections = sectionsFor([{ item_id: 'G6', reflection: 'She came back the next week.' }]);
    const buffer = await renderReportDocument({ sections, ...DOC_ARGS });
    const text = await extractText(buffer);

    expect(text).toContain(S8_TITLE);
    const start = text.indexOf(S8_TITLE);
    const end = text.indexOf(S9_TITLE, start);
    expect(end, 'expected s9 to follow s8').toBeGreaterThan(start);
    const s8Text = norm(text.slice(start, end));
    expect(s8Text).toContain('Tell about one person who first met your church outside its walls');
    expect(s8Text).toContain('She came back the next week.');
  }, 30_000);

  // Replaces "prints no voices section when no area carries them". With no reflections and no
  // themes (this fixture never sets FactsPack.themes), s8Bullets() falls back to an empty
  // buildOutreachVoices() map, so s8 still renders (heading + body — every section always does,
  // per compose.ts's "always renders complete" invariant) but carries none of the
  // reflection-derived lines.
  it('prints no reflection-derived content in s8 when there are no reflections', async () => {
    const sections = sectionsFor([]);
    const buffer = await renderReportDocument({ sections, ...DOC_ARGS });
    const text = await extractText(buffer);

    expect(text).toContain(S8_TITLE);
    const start = text.indexOf(S8_TITLE);
    const end = text.indexOf(S9_TITLE, start);
    const s8Text = norm(text.slice(start, end));
    expect(s8Text).not.toContain('Tell about one person');
    expect(s8Text).not.toContain('She came back');
  }, 30_000);

  // Replaces "preserves entry order exactly as handed in, never re-sorting at render time". The
  // old test injected a pre-built AreaDossierView.outreachVoices array directly, bypassing
  // buildOutreachVoices' own alphabetical entry sort, specifically to isolate whether document.tsx
  // itself ever re-sorts. The same injection point survives: AssembledSection.fallback.bullets is
  // a plain string[] that document.tsx's SectionBodyView (lib/report/pdf/document.tsx) maps over
  // with no sort — this builds a section directly (bypassing fallbackSections()) with
  // deliberately non-alphabetical bullets ('Third' < 'First' < 'Second' lexicographically is
  // false) so a render-time .sort()/.reverse() would be caught.
  it('preserves bullet order exactly as composed, never re-sorting at render time', async () => {
    const sections = sectionsFor([]).map((s) =>
      s.id === 's8'
        ? { ...s, fallback: { ...s.fallback, bullets: ['Third entry text.', 'First entry text.', 'Second entry text.'] } }
        : s,
    );
    const buffer = await renderReportDocument({ sections, ...DOC_ARGS });
    const text = await extractText(buffer);

    const thirdAt = text.indexOf('Third entry text.');
    const firstAt = text.indexOf('First entry text.');
    const secondAt = text.indexOf('Second entry text.');
    expect(thirdAt, 'expected the first-given entry in the PDF').toBeGreaterThan(-1);
    expect(firstAt, 'expected the second-given entry after the first-given one').toBeGreaterThan(thirdAt);
    expect(secondAt, 'expected the third-given entry after the second-given one').toBeGreaterThan(firstAt);
  }, 30_000);

  // Replaces "attributes no respondent name, label, or ordinal to a voice entry". s8Bullets()
  // (fallback-sections.ts) builds each line as `${reflectionPrompt}: ${entry}` — no per-person
  // field, no ordinal — so this mostly documents the contract, but fails hard against a
  // regression that adds a per-entry label ("Member 1", "Respondent A") or an ordinal prefix
  // ("1. ") alongside a quote. Two reflections on the same item so the entries array has more
  // than one element, region-isolated to s8 itself.
  it('attributes no respondent name, label, or ordinal to a reflection-derived line', async () => {
    const sections = sectionsFor([
      { item_id: 'G6', reflection: 'He stayed after the service.' },
      { item_id: 'G6', reflection: 'She came back the next week.' },
    ]);
    const buffer = await renderReportDocument({ sections, ...DOC_ARGS });
    const text = await extractText(buffer);

    const start = text.indexOf(S8_TITLE);
    const end = text.indexOf(S9_TITLE, start);
    const s8Text = norm(text.slice(start, end));

    // Positive exact-match pin anchored to the bullet marker, not just a negative regex:
    // SectionBodyView (lib/report/pdf/document.tsx) renders each bullet as EXACTLY
    // `•  ${bullet}` (bullet glyph, two spaces, then s8Bullets()' `${reflectionPrompt}: ${entry}`
    // — lib/report/fallback-sections.ts). Anchoring to "•  " catches a prefix prepended INSIDE
    // the bullet string (an ordinal like "1. ", a label like "Member 1: ") that a bare
    // `toContain(prompt + ': ' + entry)` would miss — that substring still appears even with a
    // prefix in front of it, which is exactly the gap a first version of this assertion had:
    // verified by mutation (s8Bullets prepending "${i+1}. " still satisfied the unanchored
    // check). Anchoring to the bullet marker makes prefix pollution break the match.
    // s8Text is already whitespace-normalized (norm(), above), which collapses the bullet
    // marker's literal "•  " (two spaces) down to "• " (one) — match against the normalized form.
    const prompt = 'Tell about one person who first met your church outside its walls. What happened next?';
    expect(s8Text).toContain(`• ${prompt}: He stayed after the service.`);
    expect(s8Text).toContain(`• ${prompt}: She came back the next week.`);

    expect(s8Text).not.toMatch(/member\s*\d|respondent\s*[a-z\d]/i);
    expect(s8Text).not.toMatch(/\d+[.):]\s*(He stayed|She came back)/);
  }, 30_000);
});
