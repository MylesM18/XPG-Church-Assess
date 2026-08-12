// The anti-drift boundary. reportInputs is called from two places — generation
// (app/app/[churchId]/actions.ts) and render (app/app/[churchId]/diagnosis/page.tsx).
// A duplicated hash formula does not fail loudly: it pins every report to "stale"
// forever, with no error and no log, and the page still renders — just always from
// fallback. This file is what catches that.
import { describe, expect, it } from 'vitest'
import { churchFactsFrom, reflectionRowsFor, reportInputs } from '../../lib/report/inputs-hash'
import type { ReflectionSourceRow } from '../../lib/report/inputs-hash'
import { loadMethodology } from '../../lib/methodology/load'
import type { Diagnosis, DiagnosisCategory, Response } from '../../lib/engine/types'
import type { ChurchProfile } from '../../lib/data/churches'

// Fixture kit copied verbatim from tests/report/facts.test.ts:7-70,103-111 (the canonical
// copy per fallback-sections.test.ts:10's own comment) — R8 in the plan-3 composer tests
// established that there is no shared/exported fixture module in tests/report/ (every
// consumer — facts.test.ts, fallback-sections.test.ts, compose.test.ts — keeps its own
// local, non-exported makeDiagnosis/makeCategory/CHURCH/RESPONSES kit), so inline
// duplication here matches the existing convention rather than inventing a new shape.
const FIXTURE_METHODOLOGY = loadMethodology()
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

const FIXTURE_DIAGNOSIS = makeDiagnosis()

function resp(item_id: string, category_id: string, value: number, who: string): Response {
  return { category_id, item_id, value, respondent_label: who, respondent_id: who }
}

const FIXTURE_RESPONSES: Response[] = [
  resp('G1', 'guest', 2, 'a'),
  resp('G1', 'guest', 3, 'b'),
  resp('C1', 'conn', 3, 'b'),
  resp('D1', 'disc', 4, 'a'),
  resp('V1', 'vol', 5, 'b'),
  resp('GEN1', 'gen', 6, 'c'),
]

const FIXTURE_PROFILE: ChurchProfile = {
  id: 'church-1',
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

describe('reflectionRowsFor', () => {
  const rows: ReflectionSourceRow[] = [
    { item_id: 'i1', respondent_label: 'Ada L', respondent_user_id: 'u1', reflection: '  keep me  ' },
    { item_id: 'i2', respondent_label: 'Ada L', respondent_user_id: 'u1', reflection: null },
    { item_id: 'i3', respondent_label: 'Bo M', respondent_user_id: 'u2', reflection: '   ' },
    { item_id: 'i4', respondent_label: 'Cy N', respondent_user_id: null, reflection: 'no user id' },
  ]

  it('drops null and whitespace-only reflections and trims the rest', () => {
    expect(reflectionRowsFor(rows)).toEqual([
      { item_id: 'i1', respondent_key: 'u1', text: 'keep me' },
      { item_id: 'i4', respondent_key: 'Cy N', text: 'no user id' },
    ])
  })

  it('keys on respondent_user_id ?? respondent_label', () => {
    const keys = reflectionRowsFor(rows).map((r) => r.respondent_key)
    expect(keys).toEqual(['u1', 'Cy N'])
  })

  it('returns an empty array for an empty input', () => {
    expect(reflectionRowsFor([])).toEqual([])
  })
})

describe('churchFactsFrom', () => {
  const profile = {
    id: 'church-1',
    name: 'Grace Chapel',
    denomination: 'Baptist',
    context: 'suburban',
    attendance_band: '200-499',
    adults_band: null,
    staff_fte_band: null,
    budget_band: null,
    church_age_band: null,
    growth_trajectory: null,
    campuses_band: null,
    facility_status: null,
    leadership_history: null,
    consultant_notes: null,
  }

  it('drops id and keeps every profile column', () => {
    const facts = churchFactsFrom(profile, '')
    expect(facts).not.toHaveProperty('id')
    expect(facts.name).toBe('Grace Chapel')
    expect(facts.denomination).toBe('Baptist')
    expect(facts.attendance_band).toBe('200-499')
    expect(facts.consultant_notes).toBeNull()
  })

  it('falls back to the supplied name and nulls every column when the profile is null', () => {
    // Generation passes '' (bit-identity with the pre-plan-4 `church?.name ?? ''`);
    // the diagnosis page passes the real church name from loadChurchForMember.
    expect(churchFactsFrom(null, '')).toEqual({
      name: '',
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
    })
    expect(churchFactsFrom(null, 'Grace Chapel').name).toBe('Grace Chapel')
  })

  it('is the same object for the same profile regardless of fallbackName', () => {
    // fallbackName is NOT in the hash (reportInputsHash takes `profile`, never `cover`),
    // so the two call sites may legitimately pass different fallbacks.
    expect(churchFactsFrom(profile, '')).toEqual(churchFactsFrom(profile, 'Other Name'))
  })
})

describe('reportInputs', () => {
  // The two call sites differ ONLY in fallbackName and completedAt. Neither is in the
  // hash, so the same run must hash identically from generation and from render.
  const shared = {
    diagnosis: FIXTURE_DIAGNOSIS,
    methodology: FIXTURE_METHODOLOGY,
    responses: FIXTURE_RESPONSES,
    labelSource: { kind: 'known' as const, labels: ['Ada L'] },
    responseHash: 'response-hash-abc',
    reflections: [{ item_id: 'i1', respondent_key: 'u1', text: 'keep me' }],
  }

  it('produces the same inputsHash from generation-shaped and page-shaped arguments', () => {
    const generation = reportInputs({
      ...shared,
      church: churchFactsFrom(FIXTURE_PROFILE, ''),
      completedAt: new Date('2026-01-02T03:04:05.000Z').toISOString(),
    })
    const page = reportInputs({
      ...shared,
      church: churchFactsFrom(FIXTURE_PROFILE, 'Grace Chapel'),
      completedAt: null,
    })
    expect(page.inputsHash).toBe(generation.inputsHash)
  })

  it('changes the hash when a hashed component changes', () => {
    // Non-vacuity: proves the assertion above is not passing because the hash ignores
    // everything. A different profile MUST produce a different hash.
    const base = reportInputs({ ...shared, church: churchFactsFrom(FIXTURE_PROFILE, ''), completedAt: null })
    const other = reportInputs({
      ...shared,
      church: churchFactsFrom({ ...FIXTURE_PROFILE, denomination: 'Methodist' }, ''),
      completedAt: null,
    })
    expect(other.inputsHash).not.toBe(base.inputsHash)
  })

  it('returns baseFacts so neither caller rebuilds it', () => {
    const { baseFacts } = reportInputs({
      ...shared,
      church: churchFactsFrom(FIXTURE_PROFILE, 'Grace Chapel'),
      completedAt: null,
    })
    expect(baseFacts.cover.church_name).toBe('Grace Chapel')
    expect(baseFacts.profile).toBeDefined()
  })
})
