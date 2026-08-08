// Owner ruling (2026-08-08): app/app/[churchId]/answer/[categoryId]/page.tsx must serve the run's
// EFFECTIVE methodology (effectiveMethodologyForRun), not the current one unconditionally.
// assessment_runs.methodology_version is written once at church creation and never updated (ADR
// 0001: exactly one run per church), so every church created before methodology 0.3.0 shipped is
// permanently on the 0.2.0 edition. effectiveMethodologyForRun already filters the 10 new outreach
// items out of any pre-0.3.0 run for SCORING (lib/report/derive.ts); this closes the matching gap
// on the SERVING side — a pre-0.3.0-run member must never be shown, and so never invited to write a
// reflection on, a question whose answer can never surface anywhere (components/anonymity-note.tsx
// promises reflections "appear in the report exactly as written").
//
// Source-reading tripwire (node env, no DOM) for the wiring — page.tsx is an async Server Component
// and cannot be rendered directly in vitest, matching this codebase's convention for this exact file
// (see tests/assessment/answer-anonymity-note.test.ts, answer-readonly-when-complete.test.ts,
// answer-page-reflection-prefill.test.ts) — plus behavioural tests exercising the REAL
// loadMethodology()/effectiveMethodologyForRun against the PRODUCTION questions.yaml, so the
// filtering is proven against real item ids, not just a fixture.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadMethodology } from '@/lib/methodology/load'
import { effectiveMethodologyForRun } from '@/lib/methodology/effective'
import { firstUnansweredStep } from '@/lib/answers/resume'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const rawPage = fs.readFileSync(
  path.join(ROOT, 'app', 'app', '[churchId]', 'answer', '[categoryId]', 'page.tsx'),
  'utf8',
)
const page = stripComments(rawPage)

describe('answer page wiring: serves the run\'s effective methodology, not the current one', () => {
  it('imports effectiveMethodologyForRun', () => {
    // Mutation guard: catches the import being dropped entirely, which would leave the page unable
    // to compute anything but the current (unfiltered) methodology.
    expect(page).toContain("from '@/lib/methodology/effective'")
    expect(page).toContain('effectiveMethodologyForRun(')
  })

  it('resolves the run BEFORE finding the category (so the category can come from the effective edition)', () => {
    // Mutation guard: catches the run fetch left where it used to be (after the category lookup),
    // which would make it impossible to filter `category.items` by the run's own version.
    const runAt = page.indexOf('currentRun(')
    const categoryAt = page.indexOf('.find((c) => c.id === categoryId)')
    expect(runAt).toBeGreaterThanOrEqual(0)
    expect(categoryAt).toBeGreaterThan(runAt)
  })

  it('threads the run version through with `?? null`, never a non-null default', () => {
    // Mutation guard: catches `run?.methodology_version ?? OUTREACH_VERSION` / `?? '0.3.0'` — either
    // of which would defeat predatesOutreach(null) === true for an unstamped run, silently serving
    // the outreach items to a run that was never scored against them.
    expect(page).toContain('run?.methodology_version ?? null')
    expect(page).not.toContain("methodology_version ?? '0.3.0'")
    expect(page).not.toContain('methodology_version ?? OUTREACH_VERSION')
  })

  it('finds `category` from the EFFECTIVE methodology, not the raw current one', () => {
    // Mutation guard: catches `methodology.questions.categories.find(...)` left in place instead of
    // being repointed at the effective edition's categories — the single most direct way this fix
    // could look done while doing nothing (category still comes from the unfiltered methodology).
    expect(page).toContain('.questions.categories.find((c) => c.id === categoryId)')
    expect(page).not.toContain('const category = methodology.questions.categories.find((c) => c.id === categoryId)')
  })

  it('keeps the existing items-map line byte-identical (Task 12\'s pinned reflection wiring)', () => {
    // This exact line is separately pinned by tests/assessment/answer-page-reflection-prefill.test.ts.
    // Repeated here as a cross-check specific to THIS fix: the filtering must happen at the `category`
    // lookup, not by rewriting how `items` is built from `category.items` — that keeps every existing
    // reflection-prefill assertion valid without touching them.
    expect(page).toContain(
      'const items = category.items.map((i) => ({ id: i.id, text: i.text, anchors: i.anchors, reflection: i.reflection }))',
    )
  })

  it('still passes the RAW methodology (not the effective one) to sectionNav', () => {
    // Categories themselves are invariant across editions (effectiveMethodologyForRun only ever
    // drops items, never categories — lib/methodology/effective.ts), so prev/next section
    // navigation is correct either way; this pins that the raw `methodology` variable — asserted by
    // tests/assessment/review-section-nav.test.ts — still exists and is still what's threaded
    // through, rather than being replaced or removed as part of this fix.
    expect(page).toContain('sectionNav(methodology.questions.categories, categoryId)')
  })

  it('renders exactly one items list, shared by both the writable form and the read-only review', () => {
    // Mutation guard: catches a second, independently-computed item list for the read-only branch
    // that could drift from the writable one — e.g. forgetting to filter it, silently reintroducing
    // the outreach items into the review for a closed-window member on an old run.
    expect(page.split('const items = ').length - 1).toBe(1)
  })
})

describe('answer page behaviour: a pre-0.3.0 run is not served the new items (real production data)', () => {
  const methodology = loadMethodology()

  it('a 0.2.0 run resolves "guest" to only the 5 pre-existing items — never G6/G7', () => {
    // Mutation guard: catches the filter being skipped, inverted, or applied to the wrong field.
    const eff = effectiveMethodologyForRun(methodology, '0.2.0')
    const guest = eff.questions.categories.find((c) => c.id === 'guest')!
    expect(guest.items.map((i) => i.id)).toEqual(['G1', 'G2', 'G3', 'G4', 'G5'])
    expect(guest.items.map((i) => i.id)).not.toContain('G6')
    expect(guest.items.map((i) => i.id)).not.toContain('G7')
  })

  it('a 0.2.0 run resolves "comm" to only the 5 pre-existing items — never COM6/COM7', () => {
    // Second category with 2 new items (not just 1) — catches an off-by-one that happens to work
    // for single-addition categories but mishandles a category that gained more than one item.
    const eff = effectiveMethodologyForRun(methodology, '0.2.0')
    const comm = eff.questions.categories.find((c) => c.id === 'comm')!
    expect(comm.items.map((i) => i.id)).toEqual(['COM1', 'COM2', 'COM3', 'COM4', 'COM5'])
  })

  it('a null (unstamped) run is treated exactly like a pre-0.3.0 run', () => {
    // Mutation guard: catches a null-run special case that accidentally serves the CURRENT
    // (unfiltered) methodology instead of falling through to the same filtering path as '0.2.0'.
    const eff = effectiveMethodologyForRun(methodology, null)
    const guest = eff.questions.categories.find((c) => c.id === 'guest')!
    expect(guest.items.map((i) => i.id)).toEqual(['G1', 'G2', 'G3', 'G4', 'G5'])
  })

  it('a 0.3.0 run is still served every item, including the outreach ones', () => {
    // Mutation guard: catches an over-eager filter that drops `since`-tagged items regardless of
    // the run version, which would silently regress every NEW church's assessment too.
    const eff = effectiveMethodologyForRun(methodology, '0.3.0')
    const guest = eff.questions.categories.find((c) => c.id === 'guest')!
    expect(guest.items.map((i) => i.id)).toEqual(['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'])
  })

  it('every one of the 8 categories loses at least its own new item(s) on a pre-0.3.0 run', () => {
    // Whole-methodology sweep (not just guest/comm): proves the fix is category-agnostic. Mutation
    // guard: catches a fix hardcoded to one category id instead of applying uniformly via `since`.
    const eff = effectiveMethodologyForRun(methodology, '0.2.0')
    const currentIds = new Set(
      methodology.questions.categories.flatMap((c) => c.items.filter((i) => i.since != null).map((i) => i.id)),
    )
    const effectiveIds = new Set(eff.questions.categories.flatMap((c) => c.items.map((i) => i.id)))
    for (const id of currentIds) {
      expect(effectiveIds.has(id), `${id} should not be served on a pre-0.3.0 run`).toBe(false)
    }
    expect(currentIds.size).toBe(10)
  })
})

describe('resume/completion works against the filtered list (a stray row for a filtered-out item does not break resume)', () => {
  it('firstUnansweredStep returns 0 (review/Take-Again) once every EFFECTIVE item is answered, ignoring an extra saved value for an item no longer in the list', () => {
    // Simulates exactly the scenario the brief calls out: an old run somehow has a stored answer to
    // a new item (servable since Task 3, before this ruling) alongside all 5 old items answered.
    // Mutation guard: catches firstUnansweredStep (or its caller) being confused by the extra key
    // into either crashing or reporting an unanswered step that doesn't actually exist in the list.
    const filteredItemIds = ['G1', 'G2', 'G3', 'G4', 'G5']
    const valuesWithStrayNewItemAnswer = { G1: 3, G2: 4, G3: 5, G4: 6, G5: 7, G6: 9 }
    expect(firstUnansweredStep(filteredItemIds, valuesWithStrayNewItemAnswer)).toBe(0)
  })

  it('firstUnansweredStep still finds the real gap among the filtered items when a stray new-item answer is also present', () => {
    const filteredItemIds = ['G1', 'G2', 'G3', 'G4', 'G5']
    const valuesWithGapAndStrayAnswer = { G1: 3, G2: 4, G6: 9 } // G3 is the first real gap; G6 is inert
    expect(firstUnansweredStep(filteredItemIds, valuesWithGapAndStrayAnswer)).toBe(2)
  })
})
