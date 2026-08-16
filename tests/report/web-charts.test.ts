import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WebChart } from '../../app/app/[churchId]/diagnosis/report/charts'
import { statGridModel, BAND_FILL, BAND_TEXT, THEME_FILL } from '@/lib/report/charts'
import type { RankRow, RankListModel } from '@/lib/report/charts'
import { loadMethodology } from '@/lib/methodology/load'
import { CAPACITY_FACTS } from '../fixtures/facts'

const methodology = loadMethodology()
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')

describe('WebStatGrid (responsive HTML grid)', () => {
  const model = statGridModel(CAPACITY_FACTS, methodology)
  const html = renderToStaticMarkup(createElement(WebChart, { model }))

  it('is a 2-col grid that becomes 4-col from sm, one cell per model cell, no SVG', () => {
    expect(html).toContain('grid-cols-2')
    expect(html).toContain('sm:grid-cols-4')
    expect((html.match(/<li[\s>]/g) ?? []).length).toBe(model.cells.length)
    expect(html).not.toContain('<svg')
  })

  it('renders every score, caps label, band colour and mini-bar share off the model', () => {
    for (const cell of model.cells) {
      expect(html).toContain(`style="color:${BAND_TEXT[cell.band]}">${cell.score}</p>`)
      expect(html).toContain(`>${escapeHtml(cell.label)}</p>`)
      const inner = cell.w - 2 * (cell.bar.x - cell.x)
      expect(html).toContain(`style="width:${(cell.bar.w / inner) * 100}%;background-color:${BAND_FILL[cell.band]}"`)
    }
  })
})

// No fixture question is longer than 90 characters (the longest is 78), so for every real
// fixture row `row.text === row.fullText` — an assertion that the rendered HTML contains
// `row.fullText` would pass identically if the component wrongly read `row.text`. This model is
// built by hand so `text` (a truncated form) and `fullText` (the real, longer sentence) actually
// differ, which is the only way to prove the component reads the untruncated field.
const LONG_SENTENCE =
  "Members' small groups often stop meeting within the first ninety days after a leader transition, and almost nobody in the middle owns fixing that gap before it compounds."
const TRUNCATED_TEXT = `${LONG_SENTENCE.slice(0, 90).trimEnd()}...`

const syntheticRow = (
  itemId: string,
  rank: string,
  theme: RankRow['theme'],
  themeLabel: string,
  mean: number,
  text: string,
  fullText: string,
): RankRow => ({
  rank,
  itemId,
  text,
  fullText,
  mean,
  theme,
  themeLabel,
  y: 0,
  h: 64,
  scoreBlock: { x: 444, y: 0, w: 56, h: 64 },
})

const rankListSynthetic: RankListModel = {
  kind: 'rank_list',
  width: 500,
  height: 300,
  rows: [
    syntheticRow('r0', '01', 'systems', 'SYSTEMS', 38, TRUNCATED_TEXT, LONG_SENTENCE),
    syntheticRow('r1', '02', 'culture', 'CULTURE', 44, 'Second row question.', 'Second row question.'),
    syntheticRow('r2', '03', 'theology', 'THEOLOGY', 51, 'Third row question.', 'Third row question.'),
  ],
}

describe('WebRankList (rebuilt in HTML, Task 13)', () => {
  const html = renderToStaticMarkup(createElement(WebChart, { model: rankListSynthetic }))

  it('has no SVG left', () => {
    expect(html).not.toContain('<svg')
  })

  it('reads row.fullText, not row.text: the complete sentence is present, the truncated form is absent', () => {
    expect(html).toContain(escapeHtml(LONG_SENTENCE))
    expect(html).not.toContain(escapeHtml(TRUNCATED_TEXT))
  })

  it('renders the question in sentence case — never uppercased', () => {
    expect(html).toContain(escapeHtml(LONG_SENTENCE))
    expect(html).not.toContain(escapeHtml(LONG_SENTENCE.toUpperCase()))
  })

  it('renders inside an <ol role="list" aria-label="Weakest questions, ranked">', () => {
    expect(html).toContain('<ol role="list" class="flex flex-col" aria-label="Weakest questions, ranked">')
  })

  it('gives the first row no border-t and every later row a border-t (fails if the branch collapses either way)', () => {
    const liClasses = [...html.matchAll(/<li class="([^"]*)"/g)].map((m) => m[1])
    expect(liClasses.length).toBe(rankListSynthetic.rows.length)
    expect(liClasses[0]).not.toContain('border-t')
    expect(liClasses[1]).toContain('border-t')
    expect(liClasses[2]).toContain('border-t')
  })

  it('renders rows in model order', () => {
    const rankSpan = 'font-display text-[1.75rem] font-semibold leading-none text-ink-soft'
    const idx0 = html.indexOf(`<span class="${rankSpan}">01</span>`)
    const idx1 = html.indexOf(`<span class="${rankSpan}">02</span>`)
    const idx2 = html.indexOf(`<span class="${rankSpan}">03</span>`)
    expect(idx0).toBeGreaterThan(-1)
    expect(idx1).toBeGreaterThan(-1)
    expect(idx2).toBeGreaterThan(-1)
    expect(idx0).toBeLessThan(idx1)
    expect(idx1).toBeLessThan(idx2)
  })

  it('colours the theme label from THEME_FILL[row.theme]', () => {
    for (const row of rankListSynthetic.rows) {
      expect(html).toContain(`style="color:${THEME_FILL[row.theme]}">${escapeHtml(row.themeLabel)}</p>`)
    }
  })
})
