// `.ts` not `.tsx` (vitest.config.ts includes tests/**/*.test.ts only) — JSX as createElement.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ReportCover } from '../../app/app/[churchId]/diagnosis/report/report-cover'
import { coverModel, BAND_FILL, BAND_TEXT, textOnBand } from '@/lib/report/charts'
import { loadMethodology } from '@/lib/methodology/load'
import { CAPACITY_FACTS } from '../fixtures/facts'

const methodology = loadMethodology()
const cover = coverModel(CAPACITY_FACTS, methodology)

/** renderToStaticMarkup escapes text the same way React does — mirror it for content asserts. */
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')

const render = (dateLabel: string | null) =>
  renderToStaticMarkup(
    createElement(ReportCover, {
      cover,
      churchName: 'Grace Chapel',
      brandColor: '#8E2B3E',
      monogram: 'GC',
      dateLabel,
    }),
  )

describe('ReportCover', () => {
  it('renders the score, the tier caption, and the headline in the band colours', () => {
    const html = render('January 2026')
    expect(html).toContain(`>${cover.score}<`)
    expect(html).toContain(`color:${BAND_TEXT[cover.band]}`)
    expect(html).toContain('font-size:clamp(3.5rem, 14vw, 7rem)')
    expect(html).toContain(escapeHtml(`${cover.caption.tierName} · ${cover.caption.score} of 100`))
    expect(html).toContain(escapeHtml(cover.headline))
    expect(html).toContain(`background-color:${BAND_FILL[cover.band]}`)
    expect(html).toContain(`color:${textOnBand(cover.band)}`)
  })

  it('renders the monogram, church name (as a <p>, never a heading), kicker, date and runline', () => {
    const html = render('January 2026')
    expect(html).toContain('>GC<')
    expect(html).toContain('background-color:#8E2B3E')
    expect(html).toContain('>Grace Chapel</p>')
    expect(html).not.toMatch(/<h[1-6][\s>]/)
    expect(html).toContain('CHURCH HEALTH ASSESSMENT')
    expect(html).toContain('>January 2026<')
    expect(html).toContain('XPG · CHURCH HEALTH ASSESSMENT')
  })

  it('omits the date line when dateLabel is null (the public share page)', () => {
    const html = render(null)
    expect(html).not.toContain('January 2026')
    expect(html).toContain('>Grace Chapel</p>')
  })

  it('draws the four-step tier ladder off cover.ladder: order, active-row branching, and a11y wiring', () => {
    const html = render(null)
    expect(cover.ladder).toHaveLength(4)

    // role="list" + the aria-label live on the <ul>.
    expect(html).toContain('role="list"')
    expect(html).toContain('aria-label="Health tiers, lowest to highest"')

    // All four rows render, worst -> best, each name as real text.
    for (const row of cover.ladder) {
      expect(html).toContain(`>${escapeHtml(row.name)}</span>`)
    }
    const orderPattern = new RegExp(cover.ladder.map((row) => escapeHtml(row.name)).join('[\\s\\S]*'))
    expect(html).toMatch(orderPattern)

    // Exactly one row carries aria-current — the active tier, and no other.
    expect((html.match(/aria-current="true"/g) ?? []).length).toBe(1)
    expect(cover.ladder.filter((row) => row.active)).toHaveLength(1)

    // The active row's fill is solid (opacity 1); an inactive row's is washed (opacity 0.18) —
    // 0.18 is a design decision, hard-coded here so a silent change fails loudly.
    const activeRow = cover.ladder.find((row) => row.active)!
    const inactiveRow = cover.ladder.find((row) => !row.active)!
    expect(html).toContain(`background-color:${BAND_FILL[activeRow.band]};opacity:1`)
    expect(html).toContain(`background-color:${BAND_FILL[inactiveRow.band]};opacity:0.18`)

    // The active row is not distinguished by colour alone — it is also physically larger. Tie the
    // padding classes to aria-current itself (rather than checking presence anywhere in the page)
    // so the assertion fails whichever way the branch collapses, including a straight inversion.
    expect(html).toContain('<li aria-current="true" class="relative -mx-1 flex items-center px-4 py-2.5">')
    expect(html).toContain('<li class="relative flex items-center px-3 py-2">')

    // Exactly 4 <li> elements — an injected or duplicated row would slip past the order/substring
    // checks above unnoticed.
    expect((html.match(/<li/g) ?? []).length).toBe(4)
  })
})
