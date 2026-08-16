// `.ts` not `.tsx` (vitest include is tests/**/*.test.ts) — JSX as createElement, as in
// web-sections.test.ts.
//
// Closes the fixture-fidelity gap logged in tests/fixtures/facts/index.ts's cat(): CategoryState
// 'watch' (lib/report/view.ts:120's `if (state === 'watch') return 'watch'`) was dead in the test
// suite because categoriesFrom derived state from score alone, never from the cohort percentile
// categoryState (lib/engine/assemble.ts:29-43) also reads. This file proves three things: (1) no
// PRE-EXISTING fixture's state changed when categoriesFrom started mirroring production, (2) the
// new CATEGORY_WATCH_FACTS fixture genuinely produces state 'watch' via the percentile rule (not
// the score rule), and (3) that distinction is visible on the rendered page, scoped to the one
// stat-grid cell it belongs to.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ReportSections } from '../../app/app/[churchId]/diagnosis/report/sections'
import { assembleFallbackOnly } from '@/lib/report/compose'
import { loadMethodology } from '@/lib/methodology/load'
import { readingBand } from '@/lib/report/view'
import { BAND_NAME, BAND_TEXT } from '@/lib/report/charts'
import type { ChartModel } from '@/lib/report/charts'
import { webVisuals } from '@/lib/report/web-visuals'
import { ALL_FIXTURES, CATEGORY_WATCH_FACTS } from '../fixtures/facts'

const methodology = loadMethodology()

describe('CategoryState "watch" — categoriesFrom now mirrors categoryState\'s percentile rule', () => {
  it('is still absent from every PRE-EXISTING fixture (zero-churn proof)', () => {
    // Every fixture that predates this change sits at cat()'s default percentile:40, or (only
    // WATCH_FACTS's `sys`) percentile:null — both fail `percentile !== null && percentile < 25`,
    // so mirroring production's percentile rule cannot have changed any of their states. This
    // asserts that against the fixtures' OWN computed output, not merely by inspection: if a
    // future edit (to categoriesFrom, rules.yaml's thresholds, or any fixture's own scores /
    // percentiles) ever made 'watch' appear somewhere unintended, this fails.
    const preExisting = ALL_FIXTURES.filter((f) => f.name !== 'category-watch')
    for (const { name, facts } of preExisting) {
      const watchCats = facts.categories.filter((c) => c.state === 'watch').map((c) => c.id)
      expect(watchCats, name).toEqual([])
    }
  })

  it("CATEGORY_WATCH_FACTS's guest category reads state 'watch' from the percentile rule, not the score rule", () => {
    const guest = CATEGORY_WATCH_FACTS.categories.find((c) => c.id === 'guest')!
    expect(guest.score, 'fixture precondition: comfortably above thresholds.strong (70)').toBe(90)
    expect(guest.percentile, 'fixture precondition: bottom-quartile').toBe(12)
    expect(guest.state).toBe('watch')
    // No OTHER category in this fixture reads 'watch' — only guest carries a sub-25 percentile,
    // and every other category's score also clears its own break/gate threshold, so this also
    // proves the rule fired exactly where intended and nowhere else.
    const otherWatch = CATEGORY_WATCH_FACTS.categories.filter((c) => c.id !== 'guest' && c.state === 'watch')
    expect(otherWatch).toEqual([])
  })

  it("readingBand reads 'watch' for guest — a score-only regression would read 'holding' instead, a materially different band", () => {
    const guest = CATEGORY_WATCH_FACTS.categories.find((c) => c.id === 'guest')!
    const band = readingBand(guest.state as 'watch', guest.score, methodology.rules.thresholds)
    expect(band).toBe('watch')
    // Premise this fixture exists to prove: BAND_TEXT/BAND_NAME must actually differ between
    // 'watch' and 'holding', or the render-level test below would pass vacuously even with the
    // wrong band computed.
    expect(BAND_TEXT.watch, 'the premise this test exists to prove').not.toBe(BAND_TEXT.holding)
    expect(BAND_NAME.watch, 'the premise this test exists to prove').not.toBe(BAND_NAME.holding)
    // What a score-only categoriesFrom regression would produce instead: state stays 'ok'
    // (score 90 >= break 45), and readingBand('ok', 90, thresholds) reads 'holding' because
    // score >= thresholds.strong (70).
    expect(
      readingBand('ok', guest.score, methodology.rules.thresholds),
      'what a reverted, score-only categoriesFrom would have produced',
    ).toBe('holding')
  })

  it('renders the guest stat-grid cell in the watch color and "· WATCH" label, scoped to that cell alone', () => {
    const sections = assembleFallbackOnly({ facts: CATEGORY_WATCH_FACTS, methodology, reflections: [] })
    const visuals = webVisuals(CATEGORY_WATCH_FACTS, methodology)
    const s3 = sections.find((s) => s.id === 's3')!
    const grid = s3.charts.find((c): c is Extract<ChartModel, { kind: 'stat_grid' }> => c.kind === 'stat_grid')!
    const guestCell = grid.cells.find((c) => c.id === 'guest')!
    expect(guestCell.band, 'fixture precondition').toBe('watch')
    expect(guestCell.label, 'fixture precondition').toContain(BAND_NAME.watch.toUpperCase())

    const html = renderToStaticMarkup(createElement(ReportSections, { sections: [s3], band: 'watch', visuals }))

    // Scoped to the s3 stat grid's own <ul>...</ul>, exactly as web-sections.test.ts's
    // null-percentile test does: WebVerdictBlock's own context-stats <ul> shares the identical
    // <li> class string, so splitting the whole page (or even the whole s3 section) would
    // interleave the verdict block's stat cells with the stat grid's.
    const STAT_GRID_LI = '<li class="flex flex-col border-b border-r border-line p-3">'
    const ulStart = html.lastIndexOf('<ul', html.indexOf('aria-label="Area scores with health bands"'))
    const ulEnd = html.indexOf('</ul>', ulStart)
    const scoped = html.slice(ulStart, ulEnd)
    const chunks = scoped.split(STAT_GRID_LI).slice(1)
    expect(chunks.length).toBe(grid.cells.length)

    const guestIndex = grid.cells.findIndex((c) => c.id === 'guest')
    const chunk = chunks[guestIndex]!

    // Value + identifying color together, in one string, scoped to this one cell's own <p> — not
    // a bare "this value appears somewhere in the output" check.
    expect(chunk).toContain(
      `<p class="font-display text-2xl font-semibold leading-none" style="color:${BAND_TEXT.watch}">${guestCell.score}</p>`,
    )
    // The band-labeled caps line, also scoped to this cell, carries the spelled-out band name.
    expect(chunk).toContain(guestCell.label)

    // Negative check anchored to what a score-only regression would actually emit: the same
    // score under BAND_TEXT.holding's color, which this chunk must NOT contain.
    expect(chunk).not.toContain(
      `<p class="font-display text-2xl font-semibold leading-none" style="color:${BAND_TEXT.holding}">${guestCell.score}</p>`,
    )
    expect(chunk).not.toContain(BAND_NAME.holding.toUpperCase())
  })
})
