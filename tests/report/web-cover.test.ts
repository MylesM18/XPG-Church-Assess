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

  it('draws the 4-segment strip and the ink marker straight off cover.strip', () => {
    const html = render(null)
    expect(html).toContain(`viewBox="0 0 ${cover.strip.width} 44"`)
    expect(cover.strip.segments).toHaveLength(4)
    for (const seg of cover.strip.segments) {
      expect(html).toContain(`<rect x="${seg.x}" y="8" width="${seg.w}" height="14" fill="${BAND_FILL[seg.band]}"`)
      expect(html).toContain(`>${seg.name.toUpperCase()}</text>`)
    }
    const markerX = Math.max(1, Math.min(cover.strip.marker.x, cover.strip.width - 1)) - 1
    expect(html).toContain(`<rect x="${markerX}" y="0" width="2" height="30" fill="#1A1A18"`)
    // 4 segment rects + 1 marker, nothing recomputed or added.
    expect((html.match(/<rect /g) ?? []).length).toBe(5)
  })
})
