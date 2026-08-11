// Discovered consequence of the owner ruling (2026-08-08), not explicitly named in the brief but
// required by it: once app/app/[churchId]/answer/[categoryId]/page.tsx stops serving a pre-0.3.0
// run's members the 10 outreach items (see answer-page-effective-methodology.test.ts), such a
// member can NEVER answer those items through the normal wizard flow. The section-complete
// interstitial (app/app/[churchId]/answer/[categoryId]/complete/page.tsx) previously judged
// "did you finish this section" against `loadMethodology().questions.categories` — the CURRENT,
// unfiltered methodology. For any category that gained an item (all 8 did), a pre-0.3.0-run member
// who has answered every item they were ever shown would be measured against a bigger denominator
// they can structurally never reach, so sectionCompleteNav would return `finish-section` pointing
// right back at the section they just finished — a redirect loop the member cannot escape, and a
// strictly worse regression than the original bug (a vanishing reflection) this whole ruling exists
// to fix.
//
// Source-reading tripwire (node env, no DOM) for the wiring — the route is an async Server
// Component and cannot be rendered directly in vitest, matching this codebase's convention for this
// exact file (see tests/assessment/section-complete-route.test.ts) — plus behavioural tests
// exercising the REAL coverage()/sectionCompleteNav()/effectiveMethodologyForRun() to prove the
// consequence and the fix.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { coverage, type CoverageRow } from '@/lib/coverage/coverage'
import { sectionCompleteNav } from '@/lib/coverage/section-complete'
import { effectiveMethodologyForRun } from '@/lib/methodology/effective'
import type { Category } from '@/lib/methodology/schema'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const route = stripComments(
  fs.readFileSync(
    path.join(ROOT, 'app', 'app', '[churchId]', 'answer', '[categoryId]', 'complete', 'page.tsx'),
    'utf8',
  ),
)

describe('section-complete interstitial wiring: judges completion against the run\'s effective categories', () => {
  it('imports currentRun and effectiveMethodologyForRun', () => {
    // Mutation guard: catches either import being dropped, which would leave the route unable to
    // resolve anything but the current (unfiltered) methodology.
    expect(route).toContain("from '@/lib/runs/current-run'")
    expect(route).toContain("from '@/lib/methodology/effective'")
    expect(route).toContain('effectiveMethodologyForRun(')
  })

  it('no longer sources `categories` directly from the raw, unfiltered methodology', () => {
    // Mutation guard: catches the fix looking done (imports added) while `categories` still comes
    // straight off loadMethodology() unfiltered — the single most direct way this could regress.
    expect(route).not.toContain('const categories = loadMethodology().questions.categories')
  })

  it('threads the run version through with `?? null`, never a non-null default', () => {
    expect(route).toContain('run?.methodology_version ?? null')
    expect(route).not.toContain("methodology_version ?? '0.3.0'")
    expect(route).not.toContain('methodology_version ?? OUTREACH_VERSION')
  })

  it('keeps `coverage(rows, categories)` — the pinned call from section-complete-route.test.ts — now fed by the effective list', () => {
    expect(route).toContain('coverage(rows, categories)')
  })
})

describe('section-complete behaviour: a member who finished every OLD item reads covered, not bounced back', () => {
  // A 3-item current category where the 3rd item is a 0.3.0 addition — mirrors the real shape
  // (e.g. "guest" gaining G6/G7): a run-effective list of 2 items for a pre-0.3.0 run.
  const currentCategories: Category[] = [{
    id: 'guest', name: 'Guest Experience', kind: 'stage', position: 1,
    items: [
      { id: 'G1', text: 't', signal: 'belief', anchors: { lo: 'l', mid: 'm', hi: 'h' }, theme: 'systems' },
      { id: 'G2', text: 't', signal: 'belief', anchors: { lo: 'l', mid: 'm', hi: 'h' }, theme: 'systems' },
      { id: 'G3', text: 't', signal: 'belief', anchors: { lo: 'l', mid: 'm', hi: 'h' }, since: '0.3.0', theme: 'systems' },
    ],
  }]
  const rowsAllOldItemsAnswered: CoverageRow[] = [
    { category_id: 'guest', item_id: 'G1', response_count: 1, respondent_count: 1 },
    { category_id: 'guest', item_id: 'G2', response_count: 1, respondent_count: 1 },
  ]

  it('THE BUG this fix prevents: judged against the full current list, a pre-0.3.0-run member who answered both old items still reads partial and gets bounced back into the section they just finished', () => {
    // Documents the regression a straight revert (or a fix that forgets this file) reintroduces —
    // proving it's real, not hypothetical, before proving the fix below.
    const result = coverage(rowsAllOldItemsAnswered, currentCategories)
    expect(result.categories[0]!.status).toBe('partial')
    const nav = sectionCompleteNav({ completedId: 'guest', result, categories: currentCategories })
    expect(nav).toEqual({ action: 'finish-section', targetId: 'guest' })
  })

  it('THE FIX: judged against the run\'s effective (filtered) list, the same member reads covered', () => {
    // Mutation guard: catches `categories` in complete/page.tsx staying on the full/current list —
    // this is the exact fixture+flow the route wires together, just with the pure functions called
    // directly (the route itself can't be rendered — see the wiring pins above for that half).
    const effectiveCategories = effectiveMethodologyForRun(
      { questions: { version: '0.3.0', categories: currentCategories } } as unknown as Parameters<typeof effectiveMethodologyForRun>[0],
      '0.2.0',
    ).questions.categories
    const result = coverage(rowsAllOldItemsAnswered, effectiveCategories)
    expect(result.categories[0]!.status).toBe('covered')
    const nav = sectionCompleteNav({ completedId: 'guest', result, categories: effectiveCategories })
    // Only one category exists in this fixture and it's now covered -> 'done', never 'finish-section'.
    expect(nav.action).not.toBe('finish-section')
    expect(nav).toEqual({ action: 'done' })
  })

  it('a 0.3.0 run is unaffected: the effective list equals the current list, same result either way', () => {
    const effectiveCategories = effectiveMethodologyForRun(
      { questions: { version: '0.3.0', categories: currentCategories } } as unknown as Parameters<typeof effectiveMethodologyForRun>[0],
      '0.3.0',
    ).questions.categories
    expect(effectiveCategories).toBe(currentCategories) // reference equality: no-op for a current-edition run
  })
})
