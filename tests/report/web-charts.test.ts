import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WebChart } from '../../app/app/[churchId]/diagnosis/report/charts'
import { statGridModel, rankListModel, BAND_FILL, BAND_TEXT } from '@/lib/report/charts'
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

describe('the other two chart kinds are unchanged SVG', () => {
  it('rank list still renders as an SVG off the model', () => {
    const model = rankListModel(CAPACITY_FACTS)
    expect(model).not.toBeNull()
    const html = renderToStaticMarkup(createElement(WebChart, { model: model! }))
    expect(html).toContain('<svg')
    expect(html).toContain(`viewBox="0 0 ${model!.width} ${model!.height}"`)
  })
})
