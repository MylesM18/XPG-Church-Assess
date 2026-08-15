import { describe, it, expect } from 'vitest';
import { PDFParse } from 'pdf-parse';
import { Page } from '@react-pdf/renderer';
import { renderReportDocument } from '@/lib/report/pdf/render';
import { ReportDocument, PAGE_GROUPS, areaIndexFrom } from '@/lib/report/pdf/document';
import { assembleFallbackOnly } from '@/lib/report/compose';
import type { AssembledSection } from '@/lib/report/compose';
import { buildFacts, type ChurchFacts, type FactsPack } from '@/lib/report/facts';
import { loadMethodology } from '@/lib/methodology/load';
import { coverModel, statGridModel, type ChartModel } from '@/lib/report/charts';
import { CAPACITY_FACTS } from '../fixtures/facts';
import type { Diagnosis, DiagnosisCategory, Response } from '@/lib/engine/types';

const methodology = loadMethodology();

type AnyEl = { type?: unknown; props?: { children?: unknown } };

/** Flattens react-pdf's JSX children tree (arrays, nulls, booleans) into a
 *  flat list of element-like nodes, for structural assertions (e.g. finding
 *  every <Page>). Reused by Tasks 12-13.
 *
 *  react-pdf's own primitives (Document/Page/Text/View/Svg/...) are STRING
 *  type tags, never functions — verified directly against the imported
 *  components (`typeof Page === 'string'`), so `el.type === Page` filtering
 *  below is unaffected. A node whose `type` IS a function is one of our own
 *  custom components (SectionContent, S6View, PdfChart, ...); it is invoked
 *  directly and its own returned tree is flattened in its place, so content
 *  nested inside a custom component is reachable without a full react-pdf
 *  render (Task 13 fix-round-1: keeps production call sites as ordinary JSX
 *  — see document.tsx — by fixing the test helper instead). */
function flatChildren(node: unknown): AnyEl[] {
  if (node == null || typeof node === 'boolean') return [];
  if (Array.isArray(node)) return node.flatMap(flatChildren);
  const el = node as AnyEl;
  if (typeof el.type === 'function') return flatChildren((el.type as (props: unknown) => unknown)(el.props));
  return [el];
}

/** Recursively collects every string/number leaf under a react-pdf JSX tree,
 *  in document order — the rendered text content. Reused by Tasks 12-13.
 *  Descends into custom function components the same way flatChildren does
 *  (see above), for the same reason. */
function collectTexts(node: unknown): string[] {
  if (node == null || typeof node === 'boolean') return [];
  if (typeof node === 'string') return [node];
  if (typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectTexts);
  const el = node as AnyEl;
  if (typeof el.type === 'function') return collectTexts((el.type as (props: unknown) => unknown)(el.props));
  return collectTexts(el.props?.children);
}

/**
 * Task 5 (re-home the fail-closed anonymity guard): this file predates the Task 4 rewrite of
 * document.tsx off the old ReportView/buildReportView/AreaDossierView model onto
 * AssembledSection[] (lib/report/compose.ts). Its former assertions targeted structure that no
 * longer exists on the PDF surface — a "The eight areas" dossier table with Band/Percentile
 * columns, a bare cover throughput %, a respondent-N column, a dual `dispersion` /
 * `system.disagreement` guard field pair. None of that survives in the new 13-section renderer
 * (lib/report/pdf/document.tsx), so those tests are replaced below with behavioural tests of what
 * the new renderer actually does, using the same capacity-archetype fixture idiom
 * tests/report/pdf-sections.test.ts and tests/report/assemble-fallback-only.test.ts already use
 * (those helpers aren't exported for direct import, hence duplicated here rather than shared —
 * the established convention in this suite; see pdf-voices.test.ts's own header comment for the
 * same rationale applied to its diagnosis()/extractText() duplicates).
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

/** Builds the facts pack for a capacity archetype (no primary_constraint, no gating), same shape
 *  as pdf-sections.test.ts's FACTS_FIXTURE, with the category set overridable per test. */
function factsFor(diagnosisOverride: Partial<Diagnosis> = {}): FactsPack {
  return buildFacts({
    methodology,
    responses: RESPONSES,
    church: CHURCH,
    completedAt: '2026-08-10T00:00:00Z',
    labelSource: { kind: 'known', labels: [] },
    diagnosis: makeDiagnosis({
      primary_constraint: null,
      gating_conditions: [],
      generosity_mode: null,
      ...diagnosisOverride,
    }),
  });
}

function sectionsFor(
  diagnosisOverride: Partial<Diagnosis> = {},
  reflections: ReadonlyArray<{ item_id: string; reflection: string | null }> = [],
): AssembledSection[] {
  return assembleFallbackOnly({ facts: factsFor(diagnosisOverride), methodology, reflections: [...reflections] });
}

const DOC_ARGS = {
  churchName: 'Grace Chapel',
  brandColor: '#3A4A6B',
  monogram: 'GC',
  generatedAt: new Date('2026-07-18T00:00:00Z'),
  labels: [] as string[],
  stale: false,
  cover: coverModel(factsFor(), methodology),
};

describe('ReportDocument', () => {
  it('renders a cover page before the content pages', () => {
    const doc = ReportDocument({ sections: sectionsFor(), ...DOC_ARGS });
    const pages = flatChildren(doc.props.children).filter((el) => el.type === Page);
    expect(pages.length).toBeGreaterThanOrEqual(2);
    const coverTexts = collectTexts(pages[0]);
    expect(coverTexts).toContain('July 2026');
    expect(coverTexts).toContain(DOC_ARGS.cover.headline);
    expect(coverTexts.some((t) => t.includes('of 100'))).toBe(true);
  });

  // Replaces the old "renders the church name and the verdict" + "renders all eight area
  // dossiers, in the fixed chain-then-enabler order" tests. The new renderer has no per-area
  // dossier table, so the closest still-true property is: the church name appears, and every one
  // of the 13 report.yaml section headings appears, in report.yaml order — real pdfjs-extracted
  // text, not a source grep (pdf-sections.test.ts's order test only proves absence of `.sort(` in
  // the source; this proves the actual rendered output is in order).
  it('renders the church name and every section heading, in report.yaml order', async () => {
    const buffer = await renderReportDocument({ sections: sectionsFor(), ...DOC_ARGS });
    const text = await extractText(buffer);
    expect(text).toContain('Grace Chapel');

    const ids = Object.keys(methodology.report.sections) as Array<keyof typeof methodology.report.sections>;
    const titles = ids.map((id) => methodology.report.sections[id].title);
    expect(titles.length).toBe(13);

    const positions = titles.map((title) => text.indexOf(title));
    const missing = titles.filter((_, i) => positions[i] === -1);
    expect(missing, `expected every section heading in the PDF; missing: ${missing.join(', ')}`).toEqual([]);
    for (let i = 1; i < positions.length; i++) {
      expect(
        positions[i]!,
        `expected "${titles[i]}" to follow "${titles[i - 1]}" (report.yaml order)`,
      ).toBeGreaterThan(positions[i - 1]!);
    }
  }, 30_000);

  // Replaces "labels a healthy area Strong, not Holding" + "shows the state-aware reading band
  // (Watch)...aligned with the dossier". Those tested a cover AreaTable that no longer exists;
  // the surviving equivalent is fallback-sections.ts's bandRead(), which still drives an s6
  // ("Areas requiring investment") bullet per category from the same methodology.copy.dossier.
  // reading table. 'gen' is a chain (stage) category that lands in s6's bottom-5 slice under this
  // fixture's scores (sorted desc: guest 72, gov 70, conn 68, disc 66, sys 64, vol 61, gen 58,
  // comm 55 — gen is index 6, inside facts.categories.slice(3)).
  it('shows the state-aware reading band text for a watch-state area', async () => {
    const buffer = await renderReportDocument({
      sections: sectionsFor({
        categories: CAT_IDS.map((id, i) => makeCategory(id, SCORES[i]!, id === 'gen' ? { state: 'watch' } : {})),
      }),
      ...DOC_ARGS,
    });
    const text = await extractText(buffer);
    expect(text).toContain(methodology.copy.dossier.reading.stage.watch);
  }, 30_000);

  // Replaces "NEVER prints a respondent name in the pdf audience" + "does not display the
  // respondent N column or N= meta". The N-column concept is gone (no per-category N is ever
  // printed by the new renderer); the name-leak property survives and is worth the deeper
  // real-pdf-text check on top of pdf-sections.test.ts's magic-bytes-only assertion for the same
  // "labels present but unmatched" case.
  it('never prints a respondent label anywhere in the extracted PDF text when none is present in content', async () => {
    // 'Marcus' only — not RESPONSES's own single-letter respondent_labels ('a'/'b'/'c'), which
    // would trivially substring-match ordinary prose (any word containing the letter "a") and
    // make this test fail for the wrong reason.
    const buffer = await renderReportDocument({ sections: sectionsFor(), ...DOC_ARGS, labels: ['Marcus'] });
    const text = await extractText(buffer);
    expect(text).not.toContain('Marcus');
  }, 30_000);

  // Replaces "throws when a view carrying respondent names reaches the renderer" and "throws when
  // only system.disagreement (not dispersion) carries respondent names" — both probed the old
  // dual-field (`dispersion` / `system.disagreement`) guard, which died with ReportView. Rather
  // than duplicate pdf-sections.test.ts's synthetic per-field mutation tests (which hand-edit
  // fallback.body/bullets/ai directly), this proves the guard fires through the REAL composer
  // pipeline: a reflection whose free text happens to contain the respondent's own label reaches
  // s8 ("What leaders are saying") via fallbackSections' buildOutreachVoices path, and the guard
  // must still catch it there — end-to-end coverage pdf-sections.test.ts's unit-level tests don't
  // provide.
  it('throws when a real reflection routed through the composer carries a respondent label', async () => {
    const sections = sectionsFor({}, [{ item_id: 'G6', reflection: 'Marcus said the welcome felt warm.' }]);
    await expect(
      (async () => renderReportDocument({ sections, ...DOC_ARGS, labels: ['Marcus'] }))(),
    ).rejects.toThrow(/respondent/i);
  }, 30_000);

  // Replaces "renders the dependency disclosure note in the appendix" + "renders Area/Role/Score/
  // Percentile columns..." (that table is gone) + "renders with no AI prose (prime directive 1)"
  // (trivially true by construction for assembleFallbackOnly — every section source is
  // 'fallback' — so not worth asserting). The appendix's actual fallback content
  // (appendixBullets in lib/report/fallback-sections.ts) still carries the benchmark/dependency
  // disclosure notes, a confidence line, and — for this fixture's 3 distinct respondents — a
  // small-sample caveat; this checks all four survive to the rendered PDF, region-isolated to the
  // appendix heading onward.
  it('renders the appendix disclosures: benchmark note, dependency note, confidence, small sample', async () => {
    const buffer = await renderReportDocument({ sections: sectionsFor(), ...DOC_ARGS });
    const text = await extractText(buffer);
    const start = text.indexOf(methodology.report.sections.appendix.title);
    expect(start, 'expected the appendix heading in the PDF').toBeGreaterThan(-1);
    const appendix = text.slice(start);
    expect(appendix).toContain(methodology.copy.inserts.benchmark_note);
    expect(appendix).toContain(methodology.copy.inserts.dependency_note);
    expect(appendix).toContain('Confidence: 0.85.');
    expect(appendix).toContain('Small sample: 3 respondents.');
  }, 30_000);

  it('renders one page per populated group plus the cover, with the new furniture', () => {
    const secs = sectionsFor();
    const doc = ReportDocument({ sections: secs, ...DOC_ARGS });
    const pages = flatChildren(doc.props.children).filter((el) => el.type === Page);
    const ids = new Set(secs.map((sec) => sec.id));
    const grouped = PAGE_GROUPS.filter((g) => g.some((id) => ids.has(id))).length;
    const leftovers = secs.filter((sec) => !PAGE_GROUPS.flat().includes(sec.id)).length;
    expect(pages).toHaveLength(1 + grouped + leftovers);
    const texts = collectTexts(doc);
    expect(texts.join(' ')).not.toContain('Internal leadership document');
    expect(texts.join(' ')).not.toContain('2026-07-18');
    expect(texts).toContain('CONFIDENTIAL');
  });
});

describe('areaIndexFrom', () => {
  it('indexes every stat grid cell by category id', () => {
    const grid = statGridModel(CAPACITY_FACTS, methodology);
    const sections: AssembledSection[] = [
      {
        id: 's3' as const,
        source: 'fallback' as const,
        ai: null,
        fallback: { title: 'Health dashboard', body: '', bullets: [] },
        charts: [grid],
      },
    ];
    const index = areaIndexFrom(sections);
    expect(index.size).toBe(grid.cells.length);
    const first = grid.cells[0]!;
    expect(index.get(first.id)).toEqual({ name: first.name, score: first.score, band: first.band });
  });

  it('is empty when no s3 stat grid exists', () => {
    expect(areaIndexFrom([]).size).toBe(0);
  });
});

describe('dossier tabs', () => {
  it('renders band tab metadata on ai dossiers', () => {
    const secs = sectionsFor();
    const s3 = secs.find((sec) => sec.id === 's3');
    const grid = s3?.charts.find((c): c is Extract<ChartModel, { kind: 'stat_grid' }> => c.kind === 'stat_grid');
    expect(grid).toBeDefined();
    if (!grid) return;
    const cell = grid.cells[0]!;
    const withAiS6 = secs.map((sec) =>
      sec.id === 's6'
        ? {
            ...sec,
            source: 'ai' as const,
            ai: {
              areas: [
                {
                  category_id: cell.id,
                  affirm: 'Volunteer culture is holding.',
                  pivot: 'Shift from recruiting to retaining.',
                  evidence: 'Scores stayed above seventy.',
                  not_statement: 'This is not a burnout story.',
                  reframe: 'Treat volunteers as the engine.',
                  trajectory: 'Watch the next two quarters.',
                },
              ],
            },
          }
        : sec,
    );
    const doc = ReportDocument({ sections: withAiS6, ...DOC_ARGS });
    const texts = collectTexts(doc);
    expect(texts).toContain(String(cell.score));
    expect(texts).toContain(cell.name);
  });
});

// --- Booking CTA ---------------------------------------------------------------------------
//
// The booking call-to-action renders on all three surfaces from one shared constant
// (lib/report/cta.ts, spec §5). In the PDF it is a react-pdf <Link src={url}>: pdf-parse's
// getText() surfaces the link's visible TEXT (heading + button label), but the target URL is a
// PDF annotation (a /URI action), not text content — so it is asserted against the raw rendered
// buffer, where the annotation URI is written verbatim. Unchanged from before Task 4/5 except for
// the props shape.
describe('booking CTA', () => {
  it('renders the booking link — label in the text, URL in the annotation', async () => {
    const { bookingCta } = await import('@/lib/report/cta');
    const buffer = await renderReportDocument({ sections: sectionsFor(), ...DOC_ARGS });
    const text = await extractText(buffer);
    expect(text).toContain(bookingCta.heading);
    // Confirmed by rendering and inspecting the actual extracted text, not assumed: the trailing
    // '→' (U+2192) in bookingCta.buttonLabel decodes through pdf-parse's pdfjs-based extraction
    // as '’' (U+2019) — an embedded-font ToUnicode CMap artifact unrelated to Task 4/5's changes
    // (same FONT_DISPLAY, same button style, predates this task). Asserting on the arrow itself
    // would fail on a text-extraction quirk, not a real rendering defect, so this checks the
    // label text up to the arrow instead.
    expect(bookingCta.buttonLabel.endsWith('→'), 'expected buttonLabel to end in the known-quirky arrow').toBe(true);
    expect(text).toContain(bookingCta.buttonLabel.slice(0, -1).trimEnd());
    expect(buffer.toString('latin1')).toContain(bookingCta.url);
  }, 30_000);
});
