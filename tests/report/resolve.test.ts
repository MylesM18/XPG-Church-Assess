import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolveReportSections } from '@/lib/report/resolve'
import { loadMethodology } from '@/lib/methodology/load'
import type { PersistedReportLookup } from '@/lib/data/reports'
import type { Diagnosis, DiagnosisCategory } from '@/lib/engine/types'
import type { ChartModel } from '@/lib/report/charts'

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
    audience: 'screen' as const,
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
    // Cross-check: cover and s3's verdict block are both built from the same post-revalidated
    // `facts` variable inside resolveReportSections, so their scores must agree.
    const s3 = r.sections.find((sec) => sec.id === 's3')
    const verdict = s3?.charts.find((c): c is Extract<ChartModel, { kind: 'verdict_block' }> => c.kind === 'verdict_block')
    expect(r.cover.strip.segments).toHaveLength(4)
    expect(typeof r.cover.headline).toBe('string')
    expect(verdict?.hero.score).toBe(r.cover.score)
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
    // Isolates the support_count check specifically: every OTHER ThemeClusterFact field is
    // valid here, so this case only fails if isThemeClusterFact's support_count check is doing
    // real work. The "wrong shape" case above does NOT exercise that check in isolation — it's
    // also missing gloss/item_ids/verbatims, so it would still be rejected even with the
    // support_count check deleted.
    ['a theme missing support_count', {
      themes: [{ label: 'Belonging', gloss: 'people feel known', item_ids: ['q1'], verbatims: ['we know each other'] }],
    }],
  ])('drops persisted themes on %s', async (_label, facts) => {
    const r = await resolveReportSections({ ...baseArgs(), readPersisted: lookupWith(facts) })
    const s8 = r.sections.find((s) => s.id === 's8')
    // Non-vacuous: with reflections: [] in baseArgs and audience 'screen', s8Bullets
    // (fallback-sections.ts) renders themes plus voices lines — and baseArgs carries neither,
    // so the private no-reflections branch yields the single copy.s8_no_reflections line
    // (buildOutreachVoices drops every item with no matching entries). A bullets array other
    // than that single neutral line here is only possible if the malformed themes above were
    // wrongly accepted by isThemeClusterFact and reached buildFacts — this is the discriminator
    // a bare `.fallback).toBeDefined()` could never provide, since fallbackSections always
    // returns a defined SectionBody regardless of which branch ran.
    expect(s8?.fallback.bullets).toEqual([methodology.copy.s8_no_reflections])
    expect(r.stale).toBe(false)
  })

  it('accepts themes that revalidate on a fresh row', async () => {
    const r = await resolveReportSections({
      ...baseArgs(),
      readPersisted: lookupWith({ themes: [THEME] }),
    })
    expect(r.stale).toBe(false)
    // Non-vacuous: proves the accepted theme actually reached facts.themes and s8Bullets used
    // it — the exact bullet text s8Bullets emits (fallback-sections.ts:107) is
    // `${label}: ${gloss} (${support_count} people).`, so this fails if revalidatedThemes
    // dropped THEME (bullets would be [], the reflections-fallback result) or if any field was
    // read from the wrong key.
    const s8 = r.sections.find((s) => s.id === 's8')
    expect(s8?.fallback.bullets).toEqual(['Belonging: people feel known (4 people).'])
  })

  // H7 (2026-08-18): once a run is complete, the page only offered `regenerateReport` when
  // `stale` — i.e. when a row exists at a DIFFERENT hash. Two states dead-ended with no
  // affordance and no model call, no matter what PROSE_MODE/OPENAI_* were later set to:
  //   H7-A — no row at all (diagnosis completed while PROSE_MODE was unset);
  //   H7-B — a row at the LIVE hash that is 100 % fallback (generation persists all-fallback
  //          rows; the I9 self-heal only runs inside first generation, which cannot re-run).
  // `needsGeneration` collapses both into one signal computed from the ASSEMBLED sections, so it
  // needs no new column read and the module stays Supabase-free (D-P5-3). `stale` is untouched.
  describe('needsGeneration — no AI section is usable for the live inputs', () => {
    // Deliberately keeps the two fields S2Schema DROPPED on 2026-08-19: this is the shape of a
    // legacy persisted row, and safeParse must strip the extras and keep source 'ai' rather
    // than fall back — the resolve-path half of the legacy test in sections-dispatch.test.ts.
    const S2_AI = {
      summary: 'Overall health is steady.',
      what_this_is_not: 'This is not a verdict on anyone.',
      context_bullets: [],
    }

    it('is true when the run has never been generated (H7-A) — and stale stays false', async () => {
      const r = await resolveReportSections({
        ...baseArgs(),
        readPersisted: async (): Promise<PersistedReportLookup> => ({ matched: null, anyExists: false }),
      })
      expect(r.needsGeneration).toBe(true)
      expect(r.stale).toBe(false)
    })

    it('is true when the live-hash row is 100 % fallback (H7-B) — and stale stays false', async () => {
      const r = await resolveReportSections({
        ...baseArgs(),
        readPersisted: async (hash): Promise<PersistedReportLookup> => ({
          matched: { inputs_hash: hash, sections: {}, facts: {} },
          anyExists: true,
        }),
      })
      expect(r.needsGeneration).toBe(true)
      expect(r.stale).toBe(false)
      expect(r.sections.every((s) => s.source === 'fallback')).toBe(true)
    })

    it('is false as soon as one AI section on the live-hash row revalidates', async () => {
      const r = await resolveReportSections({
        ...baseArgs(),
        readPersisted: async (hash): Promise<PersistedReportLookup> => ({
          matched: { inputs_hash: hash, sections: { s2: S2_AI }, facts: {} },
          anyExists: true,
        }),
      })
      // Non-vacuous: proves the faked section actually reached the assembled output as 'ai' —
      // if it had been rejected, needsGeneration would be true for the wrong reason.
      expect(r.sections.find((s) => s.id === 's2')?.source).toBe('ai')
      expect(r.needsGeneration).toBe(false)
      expect(r.stale).toBe(false)
    })

    it('is true when the only row is at another hash — but `stale` is the signal the page acts on there', async () => {
      const r = await resolveReportSections({
        ...baseArgs(),
        readPersisted: async (): Promise<PersistedReportLookup> => ({
          matched: null,
          anyExists: true,
        }),
      })
      expect(r.stale).toBe(true)
      expect(r.needsGeneration).toBe(true)
    })
  })
})

describe('the seam has exactly two call sites', () => {
  const page = readFileSync('app/app/[churchId]/diagnosis/page.tsx', 'utf8')

  it('the diagnosis page calls resolveReportSections once', () => {
    expect(page.match(/resolveReportSections\(/g)?.length).toBe(1)
  })

  it('the diagnosis page no longer calls buildFacts directly', () => {
    // buildFacts moved behind the seam. A surviving call here is a second, drifting pipeline.
    expect(page.match(/buildFacts\(/g)?.length ?? 0).toBe(0)
  })

  it('the diagnosis page calls knownLabels exactly once', () => {
    // Was twice (:188 and :222). One label source per request, threaded through — a guard
    // checking a different label list than the facts pack was built from fails open.
    expect(page.match(/knownLabels\(/g)?.length).toBe(1)
  })

  it('the diagnosis page no longer inlines the reports query', () => {
    expect(page).not.toContain("from('reports')")
  })

  it('revalidatedThemes moved out of the page', () => {
    expect(page).not.toContain('function revalidatedThemes')
    expect(page).not.toContain('function isThemeClusterFact')
  })
})

// `stale` (resolveReportSections's third return field) is assigned in the scoreable branch but,
// per the Task 3 brief, is "unused until Task 8". eslint's @typescript-eslint/no-unused-vars
// flags an assigned-but-never-read `let` as a problem (`npx eslint .` reported it as a warning,
// which still counts against the repo's "0 problems" gate) — so Task 8's D-P5-8 stale-notice
// copy is pulled forward here rather than silenced with a disable comment or deleted. The
// regenerate CONTROL half of Task 8 stays out: it posts to `regenerateReport`
// (app/app/[churchId]/actions.ts), a Task 7 server action that now exists — but wiring the form
// control that submits to it is still Task 8's own piece of work, not this task's.
describe('the stale notice is pulled forward from Task 8 (eslint flagged `stale` as unused)', () => {
  const page = readFileSync('app/app/[churchId]/diagnosis/page.tsx', 'utf8')

  it('renders the D-P5-8 stale-notice copy exactly once, gated on `stale`', () => {
    // Occurrence-count equality, NOT presence. Task 8's brief instructs adding a
    // `{stale && (…)}` block carrying this SAME drafted copy, in this SAME slot — immediately
    // before <ReportSections>. A verbatim Task 8 transcription on top of this pulled-forward
    // notice would render it TWICE; a bare `toMatch` is satisfied by either occurrence alone and
    // cannot see the duplicate.
    expect(
      page.match(/This report predates your latest settings change\./g)?.length,
    ).toBe(1)
    // Still pins that the one occurrence is gated behind `stale &&`, not unconditional.
    expect(page).toMatch(/\{stale\s*&&[\s\S]{0,200}This report predates your latest settings change\./)
  })
})

describe('the PDF route is the second and last seam call site', () => {
  const route = readFileSync('app/api/report/[runId]/pdf/route.ts', 'utf8')
  const page = readFileSync('app/app/[churchId]/diagnosis/page.tsx', 'utf8')

  it('the route calls resolveReportSections exactly once', () => {
    expect(route.match(/resolveReportSections\(/g)?.length).toBe(1)
  })

  it('resolveReportSections has exactly two call sites in total', () => {
    const total =
      (route.match(/resolveReportSections\(/g)?.length ?? 0) +
      (page.match(/resolveReportSections\(/g)?.length ?? 0)
    // The seam's whole purpose is that exactly two surfaces share one pipeline. A bare
    // presence check would be satisfied by one site and survive a regression at the other.
    expect(total).toBe(2)
  })

  it('neither caller calls buildFacts directly', () => {
    expect(route.match(/buildFacts\(/g)?.length ?? 0).toBe(0)
    expect(page.match(/buildFacts\(/g)?.length ?? 0).toBe(0)
  })

  it('the route calls knownLabels exactly once', () => {
    expect(route.match(/knownLabels\(/g)?.length).toBe(1)
  })

  it('the route no longer uses the dying view model', () => {
    expect(route).not.toContain('resolveReportView')
    expect(route).not.toContain('fallbackProse')
    expect(route).not.toContain('ReportBlocks')
  })
})

// Task 8's regenerate control. `regenerateReport` (app/app/[churchId]/actions.ts:302) reads
// `String(formData.get('churchId') ?? '')` and returns early — silently — when it's empty. A
// `<form action={regenerateReport}>` that omits the hidden churchId input compiles clean, renders
// clean, and is a permanent no-op: clicking "Regenerate report" would do nothing, with every gate
// green. Source-text pinning is the only way to catch that, since there is no persisted-report
// fixture wired up in this file's test harness to click through in an integration test.
describe('the regenerate control (Task 8)', () => {
  const page = readFileSync('app/app/[churchId]/diagnosis/page.tsx', 'utf8')

  it('gates <form action={regenerateReport}> on `stale`, with the hidden churchId input inside that form, before <ReportSections>', () => {
    // Captures everything between the `{stale &&` gate and the <ReportSections> call that must
    // immediately follow it (per the brief's Step 1 slot) — so a form placed outside the gate,
    // or after <ReportSections>, cannot satisfy this.
    const staleGateMatch = page.match(/\{stale\s*&&([\s\S]*?)<ReportSections/)
    expect(staleGateMatch).not.toBeNull()
    const staleBlock = staleGateMatch![1]!

    expect(staleBlock).toContain('<form action={regenerateReport}>')

    const formMatch = staleBlock.match(/<form action=\{regenerateReport\}>([\s\S]*?)<\/form>/)
    expect(formMatch).not.toBeNull()
    // The hidden input must be INSIDE the form's own body, not merely somewhere on the page —
    // a stray hidden input elsewhere would never actually submit with this form.
    expect(formMatch![1]).toContain('<input type="hidden" name="churchId" value={churchId} />')
  })

  it('imports regenerateReport from the sibling actions module (../actions), never from ./actions', () => {
    // '../actions' is app/app/[churchId]/actions.ts (Task 7's module, exports regenerateReport
    // at :302). './actions' is app/app/[churchId]/diagnosis/actions.ts — a DIFFERENT module that
    // only exports ShareResult/shareReport/revokeShare and has no regenerateReport at all.
    expect(page).toMatch(/import\s*\{[^}]*\bregenerateReport\b[^}]*\}\s*from\s*'\.\.\/actions'/)
    expect(page).not.toMatch(/import\s*\{[^}]*\bregenerateReport\b[^}]*\}\s*from\s*'\.\/actions'/)
  })
})
