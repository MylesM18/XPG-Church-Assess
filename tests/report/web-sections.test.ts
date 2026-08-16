// `.ts` not `.tsx` (vitest include is tests/**/*.test.ts) — JSX as createElement, as in
// sections-dispatch.test.ts.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ReportSections } from '../../app/app/[churchId]/diagnosis/report/sections'
import { assembleFallbackOnly } from '@/lib/report/compose'
import type { AssembledSection } from '@/lib/report/compose'
import { loadMethodology } from '@/lib/methodology/load'
import { areaIndexFrom, BAND_FILL, BAND_NAME, BAND_TEXT, textOnBand } from '@/lib/report/charts'
import type { BandKey, ChartModel } from '@/lib/report/charts'
import { bookingCta } from '@/lib/report/cta'
import { webVisuals } from '@/lib/report/web-visuals'
import { CAPACITY_FACTS, HOLDING_FACTS, WATCH_FACTS } from '../fixtures/facts'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const methodology = loadMethodology()
const sections = assembleFallbackOnly({ facts: CAPACITY_FACTS, methodology, reflections: [] })
const visuals = webVisuals(CAPACITY_FACTS, methodology)

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')

const render = (secs: AssembledSection[], band: BandKey) =>
  renderToStaticMarkup(createElement(ReportSections, { sections: secs, band, visuals }))

// The class constants sections.tsx uses (kept in sync by hand; a drift fails these tests loudly).
const CAPS = 'font-body text-[0.6875rem] font-bold uppercase tracking-[0.1em]'
const BODY = 'font-body text-base leading-[1.6] text-ink'
const SUBHEAD = 'font-display text-[1.0625rem] font-semibold text-ink'
const LIST = 'list-disc space-y-1 pl-5 font-body text-base leading-[1.6] text-ink'
// The opener eyebrow's, each s6 beat label's and every web visual's caps-label class (Task 17):
// CAPS plus text-ink-soft.
const CAPS_SOFT = `${CAPS} text-ink-soft`
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const countOf = (html: string, needle: string) =>
  (html.match(new RegExp(escapeRe(needle), 'g')) ?? []).length

describe('ReportSections openers (web mirror of the PDF openers)', () => {
  it('numbers the sections 01..NN in array order, in the NN / TOTAL eyebrow', () => {
    // Was: '<p class="CAPS">(\d\d)</p>', asserting a bare 01..13 caps label. Task 17 replaces the
    // label's content with 'NN / TOTAL' and its class with CAPS_SOFT — this proves the same
    // array-order guarantee for the new text, AND that the '/ TOTAL' half is sections.length on
    // every single eyebrow, not just the first (a regression this would catch: a hard-coded
    // '/ 13' surviving a shorter section list).
    const html = render(sections, 'watch')
    const re = new RegExp(`<p class="${escapeRe(CAPS_SOFT)}">(\\d\\d) / (\\d+)</p>`, 'g')
    const matches = [...html.matchAll(re)]
    expect(matches.map((m) => m[1])).toEqual(sections.map((_, i) => String(i + 1).padStart(2, '0')))
    expect(matches.every((m) => m[2] === String(sections.length))).toBe(true)
    expect(matches.length).toBe(13)
  })

  it('renders <h1> for index 0 only and <h2> for the rest, both with the fluid opener size', () => {
    const html = render(sections, 'watch')
    expect((html.match(/<h1[\s>]/g) ?? []).length).toBe(1)
    expect((html.match(/<h2[\s>]/g) ?? []).length).toBe(sections.length - 1)
    expect(html.indexOf('<h1')).toBeLessThan(html.indexOf('<h2'))
    expect((html.match(/font-size:clamp\(1\.5rem, 4vw, 2\.125rem\)/g) ?? []).length).toBe(sections.length)
  })

  it('gives every opener a 3px BAND_FILL[band] tick and a 2px ink rule — the full-slab tint is gone', () => {
    // REPLACES the old opener-slab tint test (deleted, not weakened): that test proved every
    // section's opener <div> carried the FULL-SLAB background-color:BAND_FILL[band];color:
    // textOnBand(band) pair, exactly once per section, and that no opener carried any OTHER
    // tint (by matching "any styled opener" and requiring that count to equal the
    // correctly-styled count — no room left for a wrongly-banded one). Task 17 deletes that slab
    // entirely; the band survives only as a 3px tick. This test proves the SAME two guarantees
    // for the tick — exactly one correctly BAND_FILL[band]-coloured tick per section, and no
    // tick of any other colour — plus the new 2px INK rule, which is band-independent and so is
    // checked once per section regardless of which band is passed in. The rule now carries its
    // colour as the `bg-ink` @theme utility rather than an inline PDF hex, so its anchor is the
    // full element string with no style attribute at all — same exactness, same count equality.
    //
    // SCOPED TO THE ELEMENT'S OWN class string, not a bare style-attribute count over the whole
    // page, for the same reason as the old test: several section visuals (e.g. WebChainRail's
    // stage ordinal chips) legitimately paint BAND_FILL/textOnBand pairs from their OWN model
    // band elsewhere in the same render.
    const TICK_CLASS = 'h-[22px] w-[3px] shrink-0'
    const RULE_CLASS = 'h-[2px] w-full bg-ink'
    for (const band of ['watch', 'holding'] as const) {
      const html = render(sections, band)
      const tick = `<span aria-hidden="true" class="${TICK_CLASS}" style="background-color:${BAND_FILL[band]}"></span>`
      expect((html.match(new RegExp(escapeRe(tick), 'g')) ?? []).length, band).toBe(sections.length)
      // No tick may carry any OTHER colour: the "any styled tick" count must equal the
      // correctly-coloured count above, exactly as the old opener test proved for the slab.
      const anyTick = new RegExp(
        `${escapeRe(`<span aria-hidden="true" class="${TICK_CLASS}" style="`)}[^"]*"${escapeRe('></span>')}`,
        'g',
      )
      expect((html.match(anyTick) ?? []).length, band).toBe(sections.length)
      // The 2px ink rule renders once per section, independent of band.
      const rule = `<span aria-hidden="true" class="${RULE_CLASS}"></span>`
      expect((html.match(new RegExp(escapeRe(rule), 'g')) ?? []).length, band).toBe(sections.length)
    }
  })

  it('renders the booking CTA exactly once, immediately after s12 and before the appendix', () => {
    const html = render(sections, 'holding')
    // Anchor on the CTA's own sub-head element, not the bare phrase (fallback prose could echo it).
    const ctaHead = `<p class="${SUBHEAD}">${escapeHtml(bookingCta.heading)}</p>`
    expect((html.match(new RegExp(escapeRe(ctaHead), 'g')) ?? []).length).toBe(1)
    const s12Title = escapeHtml(sections.find((s) => s.id === 's12')!.fallback.title)
    const appendixTitle = escapeHtml(sections.find((s) => s.id === 'appendix')!.fallback.title)
    const cta = html.indexOf(ctaHead)
    expect(html.indexOf(`>${s12Title}</h2>`)).toBeGreaterThan(-1)
    expect(html.indexOf(`>${appendixTitle}</h2>`)).toBeGreaterThan(-1)
    expect(cta).toBeGreaterThan(html.indexOf(`>${s12Title}</h2>`))
    expect(cta).toBeLessThan(html.indexOf(`>${appendixTitle}</h2>`))
    expect(html).toContain(`href="${bookingCta.url}"`)
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    // The button label carries the arrow glyph from lib/report/cta.ts at RUNTIME only —
    // sections.tsx's own source stays glyph-free (see the source guard below).
    expect(html).toContain(escapeHtml(bookingCta.buttonLabel))
  })

  it('renders no CTA when there is no s12 section', () => {
    const html = render(sections.filter((s) => s.id !== 's12'), 'holding')
    expect(html).not.toContain(`<p class="${SUBHEAD}">${escapeHtml(bookingCta.heading)}</p>`)
    expect(html).not.toContain(`href="${bookingCta.url}"`)
  })

  it('sets body copy in ink, never the old ink-soft body class', () => {
    const html = render(sections, 'holding')
    expect(html).toContain(`class="${BODY}"`)
    // The pre-re-skin body/list class. (Chart caps labels legitimately stay ink-soft, so this is
    // an exact-class check, not a substring ban.)
    expect(html).not.toContain('class="font-body text-ink-soft"')
  })
})

describe('web s6 dossier heads (parity with the PDF)', () => {
  const s3 = sections.find((s) => s.id === 's3')
  const grid = s3?.charts.find((c): c is Extract<ChartModel, { kind: 'stat_grid' }> => c.kind === 'stat_grid')
  const cell = grid!.cells[0]!
  const withAiS6 = sections.map((sec) =>
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
  )

  it('shows band tab, area name and score from areaIndexFrom, in the band colours', () => {
    expect(grid, 's3 must carry a stat grid').toBeDefined()
    expect(areaIndexFrom(withAiS6).get(cell.id)).toEqual({ name: cell.name, score: cell.score, band: cell.band })
    const html = render(withAiS6, 'holding')
    const head = new RegExp(
      `<span[^>]*style="background-color:${escapeRe(BAND_FILL[cell.band])};color:${escapeRe(textOnBand(cell.band))}">` +
        `${escapeRe(BAND_NAME[cell.band].toUpperCase())}</span>` +
        `<p[^>]*>${escapeRe(escapeHtml(cell.name))}</p>` +
        `<p[^>]*style="color:${escapeRe(BAND_TEXT[cell.band])}">${cell.score}</p>`,
    )
    expect(html).toMatch(head)
    expect(html).toContain('Volunteer culture is holding.')
    // Control: the same sections with s6 as fallback render NO dossier head.
    expect(render(sections, 'holding')).not.toMatch(head)
  })

  it('renders the six beats without a head when the area is not in the index', () => {
    const noGrid = withAiS6.map((sec) => (sec.id === 's3' ? { ...sec, charts: [] } : sec))
    const html = render(noGrid, 'holding')
    expect(html).toContain('Volunteer culture is holding.')
    expect(html).not.toContain(`>${BAND_NAME[cell.band].toUpperCase()}</span>`)
  })

  it('labels all six s6 beats, in the brief order, each label paired with its own unchanged paragraph', () => {
    // New coverage (Task 17): tests/report/sections-dispatch.test.ts already guards that the six
    // beats' PROSE renders in order (affirm, pivot, evidence, not_statement, reframe,
    // trajectory) — that test is untouched and still passes, proving the prose didn't move. What
    // it does not check is the new LABEL chrome at all. This test proves: all six labels render,
    // in the brief's order; each is paired with its OWN paragraph (label immediately followed by
    // its beat's text, not merely present somewhere on the page); and the six paragraph texts
    // are the exact same fixture strings `withAiS6` above already declares — i.e. unchanged.
    const html = render(withAiS6, 'holding')
    const beats = [
      ["What's working", 'Volunteer culture is holding.'],
      ['Where it turns', 'Shift from recruiting to retaining.'],
      ['The evidence', 'Scores stayed above seventy.'],
      ['What this is not', 'This is not a burnout story.'],
      ['Another way to see it', 'Treat volunteers as the engine.'],
      ['If nothing changes', 'Watch the next two quarters.'],
    ] as const
    for (const [label, text] of beats) {
      const pair = `<p class="${CAPS_SOFT}">${escapeHtml(label)}</p><p class="${BODY}">${escapeHtml(text)}</p>`
      expect(html, label).toContain(pair)
      expect(countOf(html, pair), label).toBe(1)
    }
    const positions = beats.map(([label]) => html.indexOf(`<p class="${CAPS_SOFT}">${escapeHtml(label)}</p>`))
    expect(positions.every((p) => p > -1)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })
})

describe('WebVerdictBlock (rebuilt in HTML) + the WebStatGrid percentile line', () => {
  const s3 = sections.find((s) => s.id === 's3')
  const grid = s3?.charts.find((c): c is Extract<ChartModel, { kind: 'stat_grid' }> => c.kind === 'stat_grid')
  const verdict = s3?.charts.find(
    (c): c is Extract<ChartModel, { kind: 'verdict_block' }> => c.kind === 'verdict_block',
  )
  const PCTL_CAPS = 'mt-1 font-body text-[0.625rem] font-bold uppercase tracking-[0.1em] text-ink-soft'
  // Shared by both stat-grid <ul>s on the page (this fixture's s3 grid AND the verdict block's
  // own context-stats <ul>) — always used scoped to one <ul>...</ul>, never over the whole page.
  const STAT_GRID_LI = '<li class="flex flex-col border-b border-r border-line p-3">'

  // WATCH_FACTS / HOLDING_FACTS (tests/fixtures/facts/index.ts) are the only two fixtures whose
  // capacity clears 70 — every other fixture tops out around capacity 60 — so they are the only
  // source for the 'watch'/'holding' hero bands and, on WATCH_FACTS, the null-percentile branch.
  const watchSections = assembleFallbackOnly({ facts: WATCH_FACTS, methodology, reflections: [] })
  const watchGrid = watchSections
    .find((s) => s.id === 's3')!
    .charts.find((c): c is Extract<ChartModel, { kind: 'stat_grid' }> => c.kind === 'stat_grid')!
  const watchVerdict = watchSections
    .find((s) => s.id === 's3')!
    .charts.find((c): c is Extract<ChartModel, { kind: 'verdict_block' }> => c.kind === 'verdict_block')!
  const holdingSections = assembleFallbackOnly({ facts: HOLDING_FACTS, methodology, reflections: [] })
  const holdingVerdict = holdingSections
    .find((s) => s.id === 's3')!
    .charts.find((c): c is Extract<ChartModel, { kind: 'verdict_block' }> => c.kind === 'verdict_block')!

  it('renders the percentile line as real text for every cell whose percentile is non-null (the only direction this fixture can exercise — see the dedicated test below)', () => {
    expect(grid, 's3 must carry a stat grid').toBeDefined()
    const html = render(sections, 'holding')
    const nonNull = grid!.cells.filter((c) => c.percentile !== null)
    expect(nonNull.length, 'this fixture pins percentile:40 on every category').toBe(grid!.cells.length)
    for (const c of nonNull) {
      expect(html, c.id).toContain(`<p class="${PCTL_CAPS}">${c.percentile}TH PCTL</p>`)
    }
    // Occurrence-count equality, not a presence check: fails if a cell's line goes missing AND
    // if a stray extra line appears.
    const count = (html.match(new RegExp(escapeRe(`<p class="${PCTL_CAPS}">`), 'g')) ?? []).length
    expect(count).toBe(nonNull.length)
  })

  it('renders the TH PCTL line for a non-null percentile and omits it entirely — no empty element, no placeholder — for a null one, scoped per stat cell', () => {
    // REPLACES the old guard test, which only asserted the literal string 'percentile: 40,'
    // existed in tests/fixtures/facts/index.ts — a source-text check with no render path at
    // all: it would not have failed if charts.tsx's `cell.percentile === null ? null : (<p>
    // ...</p>)` were replaced with an unconditional render. cat() now takes an optional
    // percentile (defaulting to the same 40 every other fixture still gets) and WATCH_FACTS's
    // categoriesFrom call overrides it to null for `sys` only — the first fixture that produces
    // a null percentile at all — so this is the first real render coverage of that branch in
    // either direction.
    const nullCells = watchGrid.cells.filter((c) => c.percentile === null)
    const nonNullCells = watchGrid.cells.filter((c) => c.percentile !== null)
    expect(nullCells.map((c) => c.id), 'fixture must exercise the null branch').toEqual(['sys'])
    expect(nonNullCells.length, 'fixture must also exercise the non-null branch').toBe(watchGrid.cells.length - 1)

    const html = render(watchSections, 'watch')
    // Scoped to the s3 stat grid's own <ul>...</ul>: WebVerdictBlock's stats <li> shares the
    // exact same class string (STAT_GRID_LI), so splitting the whole page would interleave
    // cells from both grids.
    const ulStart = html.lastIndexOf('<ul', html.indexOf('aria-label="Area scores with health bands"'))
    const ulEnd = html.indexOf('</ul>', ulStart)
    const scoped = html.slice(ulStart, ulEnd)
    const chunks = scoped.split(STAT_GRID_LI).slice(1)
    expect(chunks.length).toBe(watchGrid.cells.length)
    watchGrid.cells.forEach((cell, i) => {
      const chunk = chunks[i]!
      if (cell.percentile === null) {
        expect(chunk, cell.id).not.toContain(PCTL_CAPS)
      } else {
        expect(chunk, cell.id).toContain(`<p class="${PCTL_CAPS}">${cell.percentile}TH PCTL</p>`)
      }
    })
  })

  it("renders the hero score and tier caption as real text, hero colour from BAND_TEXT[model.hero.band] — proven non-vacuous against 'watch', the one band where BAND_TEXT and BAND_FILL diverge", () => {
    // REPLACES the old assertion, which rendered CAPACITY_FACTS — tier 'strained' -> hero band
    // 'broken', where BAND_TEXT.broken === BAND_FILL.broken are the literal same hex — so it
    // would have passed identically had sections.tsx read BAND_FILL instead of BAND_TEXT.
    // WATCH_FACTS is 'healthy_stretched' -> hero band 'watch', where BAND_TEXT.watch '#906722'
    // and BAND_FILL.watch '#C08A2E' differ, so a BAND_FILL swap in the source actually fails
    // this test (verified by mutation — see the task report).
    expect(WATCH_FACTS.overall.tier.id, 'fixture precondition').toBe('healthy_stretched')
    expect(watchVerdict.hero.band, 'fixture precondition').toBe('watch')
    expect(BAND_TEXT.watch, 'the premise this fixture exists to prove').not.toBe(BAND_FILL.watch)
    const html = render(watchSections, 'watch')
    const hero = watchVerdict.hero
    expect(html).toContain(
      `<p class="font-display font-semibold leading-none" style="font-size:clamp(3.5rem, 12vw, 5.25rem);color:${BAND_TEXT[hero.band]}">${hero.score}</p>`,
    )
    expect(html).toContain(
      `<p class="font-body text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-ink-soft">${escapeHtml(`${hero.tierName} · Overall Health`.toUpperCase())}</p>`,
    )
  })

  it("also renders the holding fixture's hero in BAND_TEXT.holding, confirming both new fixtures land in the tier they were built for", () => {
    expect(WATCH_FACTS.overall.tier.id).toBe('healthy_stretched')
    expect(HOLDING_FACTS.overall.tier.id).toBe('healthy_ready')
    expect(holdingVerdict.hero.band, 'fixture precondition').toBe('holding')
    const html = render(holdingSections, 'holding')
    expect(html).toContain(
      `<p class="font-display font-semibold leading-none" style="font-size:clamp(3.5rem, 12vw, 5.25rem);color:${BAND_TEXT.holding}">${holdingVerdict.hero.score}</p>`,
    )
  })

  it('renders exactly one <li> per model.stats entry, each with value and label as real text, inside role="list" aria-label="Context statistics"', () => {
    const html = render(sections, 'holding')
    const ulOpen = '<ul role="list" class="grid grid-cols-2 border-l border-t border-line" aria-label="Context statistics">'
    const ulStart = html.indexOf(ulOpen)
    expect(ulStart, 'the verdict block <ul> was not found').toBeGreaterThan(-1)
    // Scoped to this <ul>...</ul> only: WebStatGrid's cells share the identical <li> class string,
    // so counting over the whole page would double-count with the sibling stat grid below it.
    const ulEnd = html.indexOf('</ul>', ulStart)
    const scoped = html.slice(ulStart, ulEnd)
    const liOpen = '<li class="flex flex-col border-b border-r border-line p-3">'
    const liCount = (scoped.match(new RegExp(escapeRe(liOpen), 'g')) ?? []).length
    expect(liCount).toBe(verdict!.stats.length)
    for (const stat of verdict!.stats) {
      const li =
        `${liOpen}<p class="font-display text-2xl font-semibold leading-none text-ink">${stat.value}</p>` +
        `<p class="mt-1 font-body text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-ink-soft">${escapeHtml(stat.label.toUpperCase())}</p></li>`
      expect(scoped, stat.label).toContain(li)
    }
  })
})

/**
 * Task 16: SectionVisualsAbove / SectionVisualsBelow decide WHAT renders WHERE, so placement
 * and ordering ARE the behaviour under test here — not mere presence. Every anchor below is a
 * full element string (class and/or aria-label together with the value), never a bare phrase:
 * a substring like 'Confidence' or a score also occurs in ordinary report prose, so an
 * unscoped check would pass even with the dispatcher deleted.
 */
describe('per-section visual placement (Task 16 dispatchers)', () => {
  // WebConfidence's own eyebrow element. Deliberately NOT the bare word 'Confidence' — the
  // appendix's fallback bullets literally include 'Confidence: 0.85.', which would make a
  // substring check pass with the meter entirely absent.
  const CONFIDENCE_HEAD = `<p class="${CAPS_SOFT}">Confidence</p>`
  // WebCapacityBars' first bar label.
  const CAPACITY_LABEL = `<span class="${CAPS_SOFT}">Capacity</span>`
  const STAT_GRID = 'aria-label="Area scores with health bands"'
  const RANK_LIST = 'aria-label="Weakest questions, ranked"'
  const THEME_SPLIT = `<p class="${CAPS_SOFT}">THEME OF THE WEAKEST INDICATORS</p>`
  const only = (id: string) => sections.filter((s) => s.id === id)
  const bodyOf = (id: string) =>
    `<p class="${BODY}">${escapeHtml(sections.find((s) => s.id === id)!.fallback.body)}</p>`

  it('renders the confidence meter EXACTLY ONCE, on the appendix section, below its prose', () => {
    // Two regressions in one count. 2 => Task 10's temporary
    // `{section.id === 'appendix' ? <WebConfidence .../> : null}` line survived alongside the
    // dispatcher (double render). 0 => SectionVisualsBelow was pasted with the brief's
    // `case 's13'`, which no runtime SectionId ever equals (SectionId is s1..s12 | 'appendix'),
    // so BELOW_IDS.includes('appendix') is false and the meter silently vanishes.
    expect(countOf(render(sections, 'holding'), CONFIDENCE_HEAD)).toBe(1)

    // ...and it is the appendix that carries it, not some other section.
    expect(countOf(render(only('appendix'), 'holding'), CONFIDENCE_HEAD)).toBe(1)
    expect(countOf(render(sections.filter((s) => s.id !== 'appendix'), 'holding'), CONFIDENCE_HEAD)).toBe(0)

    // BELOW means below: the meter follows the appendix's own body paragraph.
    const html = render(only('appendix'), 'holding')
    expect(html.indexOf(bodyOf('appendix'))).toBeGreaterThan(-1)
    expect(html.indexOf(CONFIDENCE_HEAD)).toBeGreaterThan(html.indexOf(bodyOf('appendix')))
  })

  it("moves s7's rank list BELOW the section prose, with the theme split above it", () => {
    const html = render(only('s7'), 'holding')
    const at = [THEME_SPLIT, bodyOf('s7'), RANK_LIST].map((needle) => html.indexOf(needle))
    // Presence first: an indexOf-ordering assertion over absent needles degenerates to
    // [-1, -1, -1], which is trivially sorted and would pass with nothing rendered at all.
    expect(at, 'theme split / s7 body / rank list must all render').not.toContain(-1)
    expect(at).toEqual([...at].sort((a, b) => a - b))
    // The pre-Task-16 blind `section.charts.map` rendered the rank list ABOVE the body; that
    // regression flips the last two indexes and fails the sort above. This count additionally
    // fails if the chart is rendered in BOTH slots.
    expect(countOf(render(sections, 'holding'), RANK_LIST)).toBe(1)
  })

  it('interleaves s3 as verdict block, then capacity bars, then stat grid', () => {
    const html = render(only('s3'), 'holding')
    const verdict = sections
      .find((s) => s.id === 's3')!
      .charts.find((c): c is Extract<ChartModel, { kind: 'verdict_block' }> => c.kind === 'verdict_block')!
    const hero =
      `<p class="font-display font-semibold leading-none" ` +
      `style="font-size:clamp(3.5rem, 12vw, 5.25rem);color:${BAND_TEXT[verdict.hero.band]}">${verdict.hero.score}</p>`
    const at = [hero, CAPACITY_LABEL, STAT_GRID].map((needle) => html.indexOf(needle))
    expect(at, 'verdict hero / capacity bars / stat grid must all render').not.toContain(-1)
    // The interleave IS the requirement: the blind map rendered both charts adjacent
    // (verdict, stat grid) with nothing between them, which fails this ordering.
    expect(at).toEqual([...at].sort((a, b) => a - b))
    for (const needle of [hero, CAPACITY_LABEL, STAT_GRID]) expect(countOf(html, needle), needle).toBe(1)
  })

  it('replaces the s10 bullet list with the phase rail while its body paragraph survives', () => {
    const rail = visuals.s10.phaseRail
    expect(rail, 's10 phase rail must be modelled for this fixture').not.toBeNull()
    const html = render(only('s10'), 'holding')

    // The paragraph SectionBodyView would have rendered still reaches the page, verbatim.
    expect(html).toContain(bodyOf('s10'))
    // Every phase block renders its text in the rail's own paragraph element.
    for (const block of rail!.blocks) {
      expect(html, block.dayLabel).toContain(
        `<p class="font-body text-[0.9375rem] leading-[1.6]">${escapeHtml(block.text)}</p>`,
      )
    }
    expect(html.indexOf(bodyOf('s10'))).toBeLessThan(html.indexOf(rail!.blocks[0]!.text))

    // Every bullet the rail supersedes is gone as a <li>, and with this fixture the bullets are
    // EXACTLY the superseded set, so the <ul> disappears entirely rather than rendering empty.
    for (const bullet of rail!.supersedes) {
      expect(html, bullet).not.toContain(`<li>${escapeHtml(bullet)}</li>`)
    }
    const s10Bullets = sections.find((s) => s.id === 's10')!.fallback.bullets
    expect(s10Bullets, 'fixture precondition: every s10 bullet is superseded').toEqual(rail!.supersedes)
    expect(html).not.toContain(`<ul class="${LIST}">`)
    // Control: the pre-Task-16 render put those bullets on the page as an ordinary list.
    expect(render(sections.filter((s) => s.id === 's9'), 'holding')).toContain(`<ul class="${LIST}">`)
  })

  it('leaves every unplaced section rendering its prose with no visual bolted on', () => {
    // s1/s2/s5/s6/s11/s12 are in neither ABOVE_IDS nor BELOW_IDS and carry no charts, so the
    // dispatchers must contribute nothing at all to them. Fails if an id is added to either
    // list without a model, or if a dispatcher stops early-returning.
    for (const id of ['s1', 's2', 's5', 's6', 's11', 's12']) {
      const html = render(only(id), 'holding')
      expect(html, id).toContain(bodyOf(id))
      for (const needle of [CONFIDENCE_HEAD, CAPACITY_LABEL, STAT_GRID, RANK_LIST, THEME_SPLIT]) {
        expect(html, `${id} must not render ${needle}`).not.toContain(needle)
      }
      // Contiguity, not just absence. The five checks above pass even when the dispatcher emits
      // a STRAY TEXT NODE, which is exactly what a fall-through produces: the `never` arm
      // returns section.id and React renders it as visible text (verified by mutation — adding
      // an id to ABOVE_IDS with no matching case emits a bare `s5` right here, and every
      // absence check above still passed). Asserting the opener's closing </div> is immediately
      // followed by the body paragraph closes that hole for all six unplaced sections.
      expect(html, `${id} emits something between its opener and its body`).toContain(
        `</div>${bodyOf(id)}`,
      )
    }
  })
})

describe('source-read guard: web report files are glyph-clean; the PDF keeps one title read', () => {
  const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')
  const webFiles = ['sections.tsx', 'report-cover.tsx', 'toolbar.tsx']

  it('sections.tsx (and its siblings) contain no bullet, arrow or ellipsis glyphs', () => {
    for (const file of webFiles) {
      let src = ''
      try {
        src = read('app', 'app', '[churchId]', 'diagnosis', 'report', file)
      } catch {
        // toolbar.tsx lands in T4; skip until it exists.
        continue
      }
      expect(src, `${file} contains U+2022`).not.toContain('\u2022')
      expect(src, `${file} contains U+2192`).not.toContain('\u2192')
      expect(src, `${file} contains U+2026`).not.toContain('\u2026')
    }
  })

  it('sections.tsx never imports the PDF module', () => {
    const src = read('app', 'app', '[churchId]', 'diagnosis', 'report', 'sections.tsx')
    expect(src).not.toContain('pdf/document')
    expect(src).not.toContain('@react-pdf')
  })

  it('document.tsx still reads section.fallback.title exactly once', () => {
    const src = read('lib', 'report', 'pdf', 'document.tsx')
    expect(src.match(/section\.fallback\.title/g)?.length).toBe(1)
  })
})
