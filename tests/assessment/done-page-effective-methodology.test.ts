// Discovered consequence of the owner ruling (2026-08-08), the same class of bug as
// section-complete-effective-methodology.test.ts, in the OTHER completion guard:
// app/app/[churchId]/done/page.tsx previously judged "has this member finished the WHOLE
// assessment" against `loadMethodology().questions.categories` — the CURRENT, unfiltered
// methodology. Once the answer page stops serving a pre-0.3.0 run's members the 10 outreach items,
// such a member can never reach `coveredCount === categories.length` against the full list for any
// category that gained an item (all 8 did) — /done would redirect them to the dashboard FOREVER,
// even after they've answered every question they were ever shown. That's a strictly worse
// regression (a member who can never finish the assessment) than the bug this whole ruling exists
// to fix (a vanishing reflection).
//
// Source-reading tripwire (node env, no DOM) for the wiring — /done is an async Server Component
// and cannot be rendered directly in vitest, matching this codebase's convention for this exact
// file (see tests/assessment/completion-screen.test.ts) — plus behavioural tests exercising the
// REAL coverage()/effectiveMethodologyForRun() to prove the consequence and the fix.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { coverage, type CoverageRow } from '@/lib/coverage/coverage'
import { effectiveMethodologyForRun } from '@/lib/methodology/effective'
import type { Category } from '@/lib/methodology/schema'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const done = stripComments(
  fs.readFileSync(path.join(ROOT, 'app', 'app', '[churchId]', 'done', 'page.tsx'), 'utf8'),
)

describe('/done wiring: the completion guard is judged against the run\'s effective categories', () => {
  it('imports currentRun and effectiveMethodologyForRun', () => {
    // Mutation guard: catches either import being dropped, leaving the guard on the unfiltered list.
    expect(done).toContain("from '@/lib/runs/current-run'")
    expect(done).toContain("from '@/lib/methodology/effective'")
    expect(done).toContain('effectiveMethodologyForRun(')
  })

  it('no longer sources `categories` directly from the raw, unfiltered methodology', () => {
    expect(done).not.toContain('const categories = loadMethodology().questions.categories')
  })

  it('threads the run version through with `?? null`, never a non-null default', () => {
    expect(done).toContain('run?.methodology_version ?? null')
    expect(done).not.toContain("methodology_version ?? '0.3.0'")
    expect(done).not.toContain('methodology_version ?? OUTREACH_VERSION')
  })

  it('keeps the pinned completeness guard shape from completion-screen.test.ts, now fed by the effective list', () => {
    expect(done).toContain('coverage(rows, categories)')
    expect(done).toMatch(/coveredCount\s*!==\s*categories\.length/)
  })
})

describe('/done behaviour: a member who finished every OLD item across every category is NOT bounced back to the dashboard', () => {
  // Two categories, each gaining one 0.3.0 item — mirrors the real shape where every one of the 8
  // categories gained at least one outreach item.
  const currentCategories: Category[] = [
    {
      id: 'guest', name: 'Guest Experience', kind: 'stage', position: 1,
      items: [
        { id: 'G1', text: 't', signal: 'belief', anchors: { lo: 'l', mid: 'm', hi: 'h' }, theme: 'systems' },
        { id: 'G2', text: 't', signal: 'belief', anchors: { lo: 'l', mid: 'm', hi: 'h' }, since: '0.3.0', theme: 'systems' },
      ],
    },
    {
      id: 'conn', name: 'Connection', kind: 'stage', position: 2,
      items: [
        { id: 'C1', text: 't', signal: 'belief', anchors: { lo: 'l', mid: 'm', hi: 'h' }, theme: 'systems' },
        { id: 'C2', text: 't', signal: 'belief', anchors: { lo: 'l', mid: 'm', hi: 'h' }, since: '0.3.0', theme: 'systems' },
      ],
    },
  ]
  const rowsAllOldItemsAnswered: CoverageRow[] = [
    { category_id: 'guest', item_id: 'G1', response_count: 1, respondent_count: 1 },
    { category_id: 'conn', item_id: 'C1', response_count: 1, respondent_count: 1 },
  ]

  it('THE BUG this fix prevents: judged against the full current list, the member never reaches coveredCount === categories.length', () => {
    const result = coverage(rowsAllOldItemsAnswered, currentCategories)
    expect(result.coveredCount).toBe(0) // both categories read 'partial' (1 of 2 items each)
    expect(result.coveredCount).not.toBe(currentCategories.length)
  })

  it('THE FIX: judged against the run\'s effective (filtered) list, the member reaches full coverage', () => {
    const effectiveCategories = effectiveMethodologyForRun(
      { questions: { version: '0.3.0', categories: currentCategories } } as unknown as Parameters<typeof effectiveMethodologyForRun>[0],
      '0.2.0',
    ).questions.categories
    const result = coverage(rowsAllOldItemsAnswered, effectiveCategories)
    expect(result.coveredCount).toBe(effectiveCategories.length)
    expect(result.coveredCount).toBe(2)
  })

  it('a 0.3.0 run is unaffected: the effective list equals the current list, same result either way', () => {
    const effectiveCategories = effectiveMethodologyForRun(
      { questions: { version: '0.3.0', categories: currentCategories } } as unknown as Parameters<typeof effectiveMethodologyForRun>[0],
      '0.3.0',
    ).questions.categories
    expect(effectiveCategories).toBe(currentCategories) // reference equality: no-op for a current-edition run
  })
})
