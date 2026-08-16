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
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

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
    for (const band of ['watch', 'holding'] as const) {
      const html = render(sections, band)
      const opener = `style="background-color:${BAND_FILL[band]};color:${textOnBand(band)}"`
      expect((html.match(new RegExp(escapeRe(opener), 'g')) ?? []).length, band).toBe(sections.length)
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
