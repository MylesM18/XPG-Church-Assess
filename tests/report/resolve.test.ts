import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolveReportSections } from '@/lib/report/resolve'
import { loadMethodology } from '@/lib/methodology/load'
import type { PersistedReportLookup } from '@/lib/data/reports'
import type { Diagnosis, DiagnosisCategory } from '@/lib/engine/types'

describe('lib/data/reports.ts — the hash-addressed reports seam', () => {
  const src = readFileSync('lib/data/reports.ts', 'utf8')

  it('addresses the row by inputs_hash, not by generated_at ordering (D-P5-5)', () => {
    expect(src).toContain(".eq('inputs_hash', inputsHash)")
    // The pre-D-P5-5 read. Its survival anywhere in this module means the seam kept
    // the latest-row semantics that make the spec's revert scenario lose R1 forever.
    expect(src).not.toContain("order('generated_at'")
  })

  it('selects the two jsonb columns the resolver reads back', () => {
    expect(src).toContain('inputs_hash, sections, facts')
  })

  it('holds the reports query text exactly once — one place, so it cannot drift', () => {
    expect(src.match(/from\('reports'\)/g)?.length).toBe(2)
  })
})

// Fixture kit copied verbatim from tests/report/inputs-hash-parity.test.ts (itself copied from
// tests/report/facts.test.ts:7-70,103-111, the canonical copy per fallback-sections.test.ts:10's
// own comment) — per inputs-hash-parity.test.ts's own comment, there is no shared/exported
// fixture module in tests/report/ (every consumer keeps its own local, non-exported
// makeDiagnosis/makeCategory kit), so inline duplication here matches the existing convention
// rather than hand-writing a fresh Diagnosis literal that would drift from the type.
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
    throughput: 52.4,
    capacity: 63.9,
    gap: 11.5,
    categories: CAT_IDS.map((id, i) => makeCategory(id, [72, 44, 61, 58, 66, 70, 55, 68][i]!)),
    primary_constraint: { category_id: 'conn' },
    contributing: [],
    do_not_work_on: [],
    gating_conditions: [],
    generosity_mode: 'breadth',
    blind_spots: [],
    disagreement_flags: [],
    calibration: { spread: 1.1 } as Diagnosis['calibration'],
    dependencies: [],
    correlations: [],
    offer: { call_type: 'call', hook: 'h' } as Diagnosis['offer'],
    confidence: 0.85,
    evidence_trail: [],
    ...over,
  }
}

const DIAGNOSIS_FIXTURE = makeDiagnosis()

describe('resolveReportSections', () => {
  // Minimal real inputs: the resolver is pure apart from the injected read, so a run with no
  // responses still exercises hash → read → revalidate → assemble end to end.
  const methodology = loadMethodology()
  const baseArgs = () => ({
    diagnosis: DIAGNOSIS_FIXTURE,
    methodology,
    responses: [],
    // Brief defect: the brief's own fixture read `church: { name: 'Test Church' } as never`,
    // which supplies only `name`. `as never` suppresses tsc's structural check, but at runtime
    // the object genuinely lacks the other 11 ChurchFacts fields, and the shipped
    // `putIfSet` (lib/report/facts.ts:174-177) unconditionally calls `.length` on each one —
    // `undefined.length` throws before any assertion below runs. Fixed here by supplying a
    // real, fully-populated ChurchFacts value instead of weakening any assertion.
    church: {
      name: 'Test Church',
      denomination: null,
      context: null,
      attendance_band: null,
      adults_band: null,
      staff_fte_band: null,
      budget_band: null,
      church_age_band: null,
      growth_trajectory: null,
      campuses_band: null,
      facility_status: null,
      leadership_history: null,
      consultant_notes: null,
    },
    completedAt: '2026-01-01T00:00:00.000Z',
    labelSource: { kind: 'known' as const, labels: [] },
    responseHash: 'rh-1',
    reflections: [],
    hashReflections: [],
  })

  it('calls readPersisted with the LIVE inputs hash (pins D-P5-5)', async () => {
    let seen: string | null = null
    const result = await resolveReportSections({
      ...baseArgs(),
      readPersisted: async (hash) => {
        seen = hash
        return { matched: null, anyExists: false }
      },
    })
    expect(seen).not.toBeNull()
    // The hash handed to the read is the hash the resolver reports back — a read addressed
    // with anything else would silently never match.
    expect(seen).toBe(result.inputsHash)
  })

  it('is not stale when the run has never been generated', async () => {
    const r = await resolveReportSections({
      ...baseArgs(),
      readPersisted: async (): Promise<PersistedReportLookup> => ({ matched: null, anyExists: false }),
    })
    expect(r.stale).toBe(false)
    expect(r.sections.every((s) => s.source === 'fallback')).toBe(true)
  })

  it('is stale when a report exists but not for these inputs', async () => {
    const r = await resolveReportSections({
      ...baseArgs(),
      readPersisted: async (): Promise<PersistedReportLookup> => ({ matched: null, anyExists: true }),
    })
    expect(r.stale).toBe(true)
    expect(r.sections.every((s) => s.source === 'fallback')).toBe(true)
  })

  // D-P5-3: revalidatedThemes finally gets real coverage, which is only possible because the
  // read is injected. Each case must land on themes === null, i.e. facts.themes stays [].
  const THEME = {
    label: 'Belonging', gloss: 'people feel known', support_count: 4,
    item_ids: ['q1'], verbatims: ['we know each other'],
  }
  const lookupWith = (facts: unknown, hashMatches = true) =>
    async (hash: string): Promise<PersistedReportLookup> => ({
      matched: { inputs_hash: hashMatches ? hash : 'a-different-hash', sections: {}, facts },
      anyExists: true,
    })

  it.each([
    ['a missing themes key', { archetype: 'x' }],
    ['themes of the wrong shape', { themes: [{ label: 'Belonging' }] }],
    ['themes that are not an array', { themes: 'Belonging' }],
    ['a null facts blob', null],
  ])('drops persisted themes on %s', async (_label, facts) => {
    const r = await resolveReportSections({ ...baseArgs(), readPersisted: lookupWith(facts) })
    expect(r.sections.find((s) => s.id === 's8')?.fallback).toBeDefined()
    expect(r.stale).toBe(false)
  })

  it('accepts themes that revalidate on a fresh row', async () => {
    const r = await resolveReportSections({
      ...baseArgs(),
      readPersisted: lookupWith({ themes: [THEME] }),
    })
    expect(r.stale).toBe(false)
  })
})
