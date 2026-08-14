import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadMethodology } from '@/lib/methodology/load'
import { assembleFallbackOnly } from '@/lib/report/compose'
import type { AssembledSection } from '@/lib/report/compose'
import { renderReportDocument } from '@/lib/report/pdf/render'
import { buildFacts, type ChurchFacts, type FactsPack } from '@/lib/report/facts'
import type { Diagnosis, DiagnosisCategory, Response } from '@/lib/engine/types'

const methodology = loadMethodology()

// --- FACTS_FIXTURE: the exact capacity-archetype fixture idiom
// tests/report/assemble-fallback-only.test.ts (its FIXTURE_FACTS, :20-107) already builds
// locally (makeCategory / makeDiagnosis / CHURCH / RESPONSES / buildFacts) — reproduced here
// rather than hand-rolled, since none of those helpers are exported for direct import.

const CAT_IDS = ['guest', 'conn', 'disc', 'vol', 'gen', 'gov', 'comm', 'sys'] as const

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
  }
}

function makeDiagnosis(over: Partial<Diagnosis> = {}): Diagnosis {
  return {
    methodology_version: '0.3.0',
    throughput: 60,
    capacity: 70,
    gap: 10,
    categories: CAT_IDS.map((id, i) => makeCategory(id, [72, 68, 66, 61, 58, 70, 55, 64][i]!)),
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
  }
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
}

function resp(item_id: string, category_id: string, value: number, who: string): Response {
  return { category_id, item_id, value, respondent_label: who, respondent_id: who }
}

const RESPONSES: Response[] = [
  resp('G1', 'guest', 7, 'a'),
  resp('G1', 'guest', 8, 'b'),
  resp('C1', 'conn', 7, 'a'),
  resp('D1', 'disc', 6, 'b'),
  resp('V1', 'vol', 6, 'c'),
  resp('GEN1', 'gen', 6, 'a'),
]

// capacity archetype (archetypeFor: no primary_constraint, no gating_conditions) — identical
// shape to assemble-fallback-only.test.ts's FIXTURE_FACTS fixture.
const FACTS_FIXTURE: FactsPack = buildFacts({
  methodology,
  responses: RESPONSES,
  church: CHURCH,
  completedAt: '2026-08-10T00:00:00Z',
  labelSource: { kind: 'known', labels: [] },
  diagnosis: makeDiagnosis({ primary_constraint: null, gating_conditions: [], generosity_mode: null }),
})

/** Deterministic 13-section input: assembleFallbackOnly returns report.yaml order by construction. */
function fallbackSectionsFixture(): AssembledSection[] {
  return assembleFallbackOnly({ facts: FACTS_FIXTURE, methodology, reflections: [] })
}

const baseProps = () => ({
  sections: fallbackSectionsFixture(),
  churchName: 'Test Church',
  brandColor: '#8E2B3E',
  monogram: 'TC',
  generatedAt: new Date('2026-01-01T00:00:00.000Z'),
  labels: [] as string[],
  stale: false,
})

describe('the PDF document renders the 13 assembled sections', () => {
  const src = readFileSync('lib/report/pdf/document.tsx', 'utf8')

  it('renders every section in report.yaml order and never re-sorts', () => {
    // The renderer maps over the array as given. A .sort( anywhere in this file means the
    // PDF can disagree with the web page about section order.
    expect(src).not.toContain('.sort(')
    expect(src).toContain('sections.map(')
  })

  it('takes the heading from fallback.title only — one title source', () => {
    expect(src.match(/fallback\.title/g)?.length).toBe(1)
  })

  it('keeps the exhaustiveness arm that makes tsc catch an eighth AI section', () => {
    expect(src).toContain('const _exhaustive: never = id')
  })

  it('has a renderer case for each of the seven AI section ids', () => {
    for (const id of ['s2', 's4', 's5', 's6', 's7', 's9', 's12']) {
      expect(src).toContain(`case '${id}':`)
    }
  })

  it('no longer imports the dying ReportView model', () => {
    expect(src).not.toContain('ReportView')
    expect(src).not.toContain('SystemView')
    expect(src).not.toContain('AreaDossierView')
  })

  it('renders to a real PDF buffer', async () => {
    const buffer = await renderReportDocument(baseProps())
    expect(buffer.length).toBeGreaterThan(0)
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })

  it('falls back for a section whose AI payload is malformed', async () => {
    const sections = fallbackSectionsFixture().map((s) =>
      s.id === 's2' ? { ...s, source: 'ai' as const, ai: { nonsense: true } } : s,
    )
    // safeParse rejects → that section renders its own fallback → still a valid PDF, no throw.
    const buffer = await renderReportDocument({ ...baseProps(), sections })
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })
})

describe('the re-homed fail-closed anonymity guard', () => {
  // renderReportDocument is declared as a plain (non-async) function (lib/report/pdf/render.ts),
  // so the guard's `throw` runs synchronously during the call itself — `renderReportDocument(...)`
  // throws before ever producing a Promise for `expect(...).rejects` to observe. Wrapping the call
  // in an async closure defers evaluation until the closure runs, turning the throw into a
  // rejection `.rejects` can catch. Same technique tests/report/pdf-document.test.ts's pre-Task-5
  // guard tests used for the same reason (its own inline comment documents it). Brief's Step 1
  // snippet omitted this wrapper — a brief defect confirmed by watching these three fail with an
  // uncaught synchronous exception instead of the expected rejection.
  it('throws when a respondent label appears in a fallback body', async () => {
    const sections = fallbackSectionsFixture().map((s, i) =>
      i === 0 ? { ...s, fallback: { ...s.fallback, body: 'Marcus said the welcome is warm.' } } : s,
    )
    await expect(
      (async () => renderReportDocument({ ...baseProps(), sections, labels: ['Marcus'] }))(),
    ).rejects.toThrow(/respondent/i)
  })

  it('throws when a respondent label appears in a bullet', async () => {
    const sections = fallbackSectionsFixture().map((s, i) =>
      i === 0 ? { ...s, fallback: { ...s.fallback, bullets: ['Marcus mentioned parking'] } } : s,
    )
    await expect(
      (async () => renderReportDocument({ ...baseProps(), sections, labels: ['Marcus'] }))(),
    ).rejects.toThrow(/respondent/i)
  })

  it('throws when a respondent label appears in an AI payload string', async () => {
    const sections = fallbackSectionsFixture().map((s) =>
      s.id === 's4'
        ? { ...s, source: 'ai' as const, ai: { thesis_word: 'Trust', narrative: 'Marcus put it plainly.' } }
        : s,
    )
    await expect(
      (async () => renderReportDocument({ ...baseProps(), sections, labels: ['Marcus'] }))(),
    ).rejects.toThrow(/respondent/i)
  })

  // Task 12 fix 3: section.charts (lib/report/charts.ts's ChartModel[]) reaches the PDF renderer
  // too, and until now the guard's scan list (lib/report/pdf/render.ts) never walked it. Chart
  // strings are always methodology-derived in production (category names, item text, theme keys,
  // tier names) and never respondent-supplied — but this test proves the SCAN itself covers that
  // shape, by forcing a label into a chart bar's name the way the guard would only ever see one if
  // its own invariant were violated. Fails (silently — no throw, no rejection) if `...
  // collectStrings(section.charts)` is ever removed from render.ts's texts array again.
  it('throws when a respondent label appears inside a chart model', async () => {
    const sections = fallbackSectionsFixture().map((s, i) =>
      i === 0
        ? {
            ...s,
            charts: [
              {
                kind: 'area_bars' as const,
                bars: [
                  { id: 'guest', name: 'Marcus mentioned parking', score: 50, band: 'watch' as const, x: 0, y: 0, w: 0, h: 0 },
                ],
                ticks: [],
                labelWidth: 0,
                w: 0,
                h: 0,
              },
            ],
          }
        : s,
    )
    await expect(
      (async () => renderReportDocument({ ...baseProps(), sections, labels: ['Marcus'] }))(),
    ).rejects.toThrow(/respondent/i)
  })

  it('does not throw when no label is present', async () => {
    const buffer = await renderReportDocument({ ...baseProps(), labels: ['Marcus'] })
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })

  // The brief's own instruction (not one of its Step 1 test snippets): "Check fallback.body,
  // fallback.bullets, and the string fields of the AI payload — not fallback.title." Titles come
  // from report.yaml, never respondent data, and a label that happens to be a common word
  // appearing in a title would 500 every export — fail-closed in the wrong direction. None of the
  // brief's five Step-1 tests actually exercises this; this closes that gap directly.
  it('does not throw when a label appears only in a section title (titles are exempt)', async () => {
    const sections = fallbackSectionsFixture().map((s, i) =>
      i === 0 ? { ...s, fallback: { ...s.fallback, title: 'Marcus Ministries Overview' } } : s,
    )
    const buffer = await renderReportDocument({ ...baseProps(), sections, labels: ['Marcus'] })
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })

  it('does not throw on an empty label list', async () => {
    // containsRespondentLabel skips empty needles, so [] is a no-op, not a match-everything.
    const buffer = await renderReportDocument({ ...baseProps(), labels: [] })
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })
})
