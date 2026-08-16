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
import { CAPACITY_FACTS } from '../fixtures/facts'

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
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const countOf = (html: string, needle: string) =>
  (html.match(new RegExp(escapeRe(needle), 'g')) ?? []).length

describe('ReportSections openers (web mirror of the PDF openers)', () => {
  it('numbers the sections 01..NN in array order, in the caps label', () => {
    const html = render(sections, 'watch')
    const re = new RegExp(`<p class="${escapeRe(CAPS)}">(\\d\\d)</p>`, 'g')
    const numbers = [...html.matchAll(re)].map((m) => m[1])
    expect(numbers).toEqual(sections.map((_, i) => String(i + 1).padStart(2, '0')))
    expect(numbers.length).toBe(13)
  })

  it('renders <h1> for index 0 only and <h2> for the rest, both with the fluid opener size', () => {
    const html = render(sections, 'watch')
    expect((html.match(/<h1[\s>]/g) ?? []).length).toBe(1)
    expect((html.match(/<h2[\s>]/g) ?? []).length).toBe(sections.length - 1)
    expect(html.indexOf('<h1')).toBeLessThan(html.indexOf('<h2'))
    expect((html.match(/font-size:clamp\(1\.5rem, 4vw, 2\.125rem\)/g) ?? []).length).toBe(sections.length)
  })

  it('tints every opener with BAND_FILL[band] and textOnBand(band) — both textOnBand outcomes', () => {
    // SCOPED TO THE OPENER ELEMENT (its own class string), not a bare style-attribute count over
    // the whole page. Since Task 16 the section visuals render inside this markup too, and
    // several of them legitimately paint the same BAND_FILL/textOnBand pair from their OWN model
    // band — WebChainRail's stage ordinal chips are the concrete case (4 watch-banded stages in
    // CAPACITY_FACTS). Pairing the style with the opener div's class is strictly stronger than
    // the old count: it proves the tint is on the opener, not merely somewhere in the document.
    const OPENER_CLASS = '-mx-6 px-6 py-3 sm:mx-0 sm:px-4'
    for (const band of ['watch', 'holding'] as const) {
      const html = render(sections, band)
      const opener =
        `<div class="${OPENER_CLASS}" style="background-color:${BAND_FILL[band]};color:${textOnBand(band)}">`
      expect((html.match(new RegExp(escapeRe(opener), 'g')) ?? []).length, band).toBe(sections.length)
      // No opener may carry any OTHER tint: an opener that fell back to a different band would
      // keep the count above correct only if a second opener double-rendered, but this catches
      // the simpler regression of an opener rendered with the wrong band outright.
      const anyOpener = new RegExp(`${escapeRe(`<div class="${OPENER_CLASS}" style="`)}[^"]*"`, 'g')
      expect((html.match(anyOpener) ?? []).length, band).toBe(sections.length)
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
})

describe('WebVerdictBlock (rebuilt in HTML) + the WebStatGrid percentile line', () => {
  const s3 = sections.find((s) => s.id === 's3')
  const grid = s3?.charts.find((c): c is Extract<ChartModel, { kind: 'stat_grid' }> => c.kind === 'stat_grid')
  const verdict = s3?.charts.find(
    (c): c is Extract<ChartModel, { kind: 'verdict_block' }> => c.kind === 'verdict_block',
  )
  const PCTL_CAPS = 'mt-1 font-body text-[0.625rem] font-bold uppercase tracking-[0.1em] text-ink-soft'

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

  it('the null branch (no PCTL line, no empty frame, no "n/a") cannot be exercised by any current fixture — documented rather than fabricated', () => {
    // tests/fixtures/facts/index.ts:58 hard-codes `percentile: 40` inside the shared `cat()`
    // helper every fixture builds categories through (the same comment there flags this as a
    // known fix-round-1 gap: CategoryState 'watch' has the identical hole). ALL_FIXTURES
    // therefore never produces a null percentile, so the "entirely ABSENT" half of this
    // assertion has no real render path to exercise without either fabricating a synthetic
    // model or hand-breaking a FactsPack fixture — the same call the coordinator made for
    // phaseRail's unreachable 0-entry branch in task-9-report.md's "Conclusion". This test
    // documents that fact directly against the fixture source (not a fabricated one) so a
    // future fixture change that introduces a null percentile fails it and surfaces the gap.
    expect(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'facts', 'index.ts'), 'utf8')).toContain(
      'percentile: 40,',
    )
  })

  it('renders the hero score and tier caption as real text, hero colour from BAND_TEXT[model.hero.band]', () => {
    expect(verdict, 's3 must carry a verdict block').toBeDefined()
    const html = render(sections, 'holding')
    const hero = verdict!.hero
    expect(html).toContain(
      `<p class="font-display font-semibold leading-none" style="font-size:clamp(3.5rem, 12vw, 5.25rem);color:${BAND_TEXT[hero.band]}">${hero.score}</p>`,
    )
    expect(html).toContain(
      `<p class="font-body text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-ink-soft">${escapeHtml(`${hero.tierName} · Overall Health`.toUpperCase())}</p>`,
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
  const CONFIDENCE_HEAD = `<p class="${CAPS}" style="color:#5A5A54">Confidence</p>`
  // WebCapacityBars' first bar label.
  const CAPACITY_LABEL = `<span class="${CAPS}" style="color:#5A5A54">Capacity</span>`
  const STAT_GRID = 'aria-label="Area scores with health bands"'
  const RANK_LIST = 'aria-label="Weakest questions, ranked"'
  const THEME_SPLIT = `<p class="${CAPS}" style="color:#5A5A54">THEME OF THE WEAKEST INDICATORS</p>`
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
