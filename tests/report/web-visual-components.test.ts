// `.ts` not `.tsx` (vitest.config.ts includes tests/**/*.test.ts only) — JSX as createElement.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  WebCapacityBars,
  WebConstraintCallout,
  WebDumbbells,
} from '../../app/app/[churchId]/diagnosis/report/web-visuals'
import { BAND_FILL, textOnBand } from '@/lib/report/charts'
import type {
  CapacityBarsModel,
  ConstraintCalloutModel,
  DumbbellsModel,
} from '@/lib/report/web-visuals'

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')

describe('WebCapacityBars', () => {
  // capacityPct/throughputPct deliberately differ from capacity/throughput so a
  // component that reads the raw score for bar width (instead of the pre-clamped
  // pct) cannot pass by coincidence.
  const baseModel: CapacityBarsModel = {
    band: 'watch',
    capacity: 62,
    throughput: 41,
    capacityPct: 58,
    throughputPct: 35,
    gap: 21,
    gapLabel: '21 POINTS LOST',
  }

  it('renders the gap chip with its text when gapLabel is non-null', () => {
    const html = renderToStaticMarkup(createElement(WebCapacityBars, { model: baseModel }))
    expect(html).toContain(escapeHtml('21 POINTS LOST'))
  })

  it('renders no chip at all — no empty element, no placeholder — when gapLabel is null', () => {
    const model: CapacityBarsModel = { ...baseModel, gap: 0, gapLabel: null }
    const html = renderToStaticMarkup(createElement(WebCapacityBars, { model }))
    // The gap chip is the component's only <p>. Its absence (not an empty <p>)
    // is what "never an empty frame" requires; a bug that renders an empty
    // chip, or inverts the null check, changes this count.
    expect((html.match(/<p /g) ?? []).length).toBe(0)
  })

  it('both bars carry the SAME band hex and differ only by opacity 1 vs 0.45 — never a second colour for throughput', () => {
    // gapLabel: null keeps the chip (which also uses BAND_FILL) out of the
    // markup, so the count below isolates the two bars.
    const model: CapacityBarsModel = { ...baseModel, gap: 0, gapLabel: null }
    const html = renderToStaticMarkup(createElement(WebCapacityBars, { model }))
    const fill = BAND_FILL[model.band]
    // Regression this catches: throughput rendered with a different hex (e.g.
    // BAND_TEXT, a hardcoded grey, or any colour other than the capacity fill)
    // — the opacity:0.45 bar's style string would then not contain `fill`.
    expect(html).toContain(`style="width:${model.capacityPct}%;background-color:${fill};opacity:1"`)
    expect(html).toContain(`style="width:${model.throughputPct}%;background-color:${fill};opacity:0.45"`)
    // Both bar fills resolve to the identical hex string, not two different ones.
    const fillOccurrences = html.split(`background-color:${fill}`).length - 1
    expect(fillOccurrences).toBe(2)
  })

  it('both bar widths come from the model pre-clamped percentages, not the raw scores', () => {
    const model: CapacityBarsModel = {
      band: 'holding',
      capacity: 88,
      throughput: 55,
      capacityPct: 73,
      throughputPct: 30,
      gap: 33,
      gapLabel: '33 POINTS LOST',
    }
    const html = renderToStaticMarkup(createElement(WebCapacityBars, { model }))
    expect(html).toContain('width:73%')
    expect(html).toContain('width:30%')
    expect(html).not.toContain('width:88%')
    expect(html).not.toContain('width:55%')
  })
})

describe('WebConstraintCallout', () => {
  const rowWithNote = { id: 'r1', name: 'Volunteer Pipeline', score: 34, note: 'Only 12% of members serve regularly.' }
  const rowWithoutNote = { id: 'r2', name: 'Discipleship Pathway', score: 41, note: null }
  const model: ConstraintCalloutModel = { eyebrow: 'GATING ENABLER', band: 'broken', rows: [rowWithNote, rowWithoutNote] }
  const html = renderToStaticMarkup(createElement(WebConstraintCallout, { model }))
  const noteParagraphClass = 'font-body text-[0.8125rem] leading-[1.5]'

  it('renders the eyebrow text', () => {
    expect(html).toContain(
      `<p class="font-body text-[0.6875rem] font-bold uppercase tracking-[0.1em]">${escapeHtml(model.eyebrow)}</p>`,
    )
  })

  it('renders the note paragraph, with its text, for the row whose note is non-null', () => {
    expect(html).toContain(`<p class="${noteParagraphClass}">${escapeHtml(rowWithNote.note)}</p>`)
  })

  it('renders no note paragraph at all — not an empty one — for the row whose note is null', () => {
    // Two rows, one note. A count of exactly 1 proves BOTH directions: r1's note
    // paragraph exists, and r2's is entirely absent (not rendered empty).
    const noteParagraphCount = (html.match(new RegExp(`<p class="${noteParagraphClass.replace(/[[\]().]/g, '\\$&')}">`, 'g')) ?? []).length
    expect(noteParagraphCount).toBe(1)
  })

  it('grounds the panel in BAND_FILL[model.band] with textOnBand(model.band) as the foreground', () => {
    // Regression this catches: panel ground reading a different band field
    // (e.g. BAND_TEXT instead of BAND_FILL) or the foreground/background swapped.
    expect(html).toContain(`style="background-color:${BAND_FILL[model.band]};color:${textOnBand(model.band)}"`)
  })
})

describe('WebDumbbells', () => {
  // Two rows, opposite orderings, so a component with min/max backwards cannot
  // pass both: it can at best match a naive (unswapped) assignment on one row.
  const beliefAboveEvidence = {
    id: 'r1',
    name: 'Community Trust',
    evidence: 30,
    belief: 70,
    gap: 40,
    band: 'broken' as const,
    evidencePct: 30,
    beliefPct: 70,
  }
  const evidenceAboveBelief = {
    id: 'r2',
    name: 'Leadership Alignment',
    evidence: 80,
    belief: 25,
    gap: 55,
    band: 'holding' as const,
    evidencePct: 80,
    beliefPct: 25,
  }
  const model: DumbbellsModel = { rows: [beliefAboveEvidence, evidenceAboveBelief] }
  const html = renderToStaticMarkup(createElement(WebDumbbells, { model }))

  it('draws the connecting segment at left=min, width=(max-min) when belief > evidence', () => {
    const fill = BAND_FILL[beliefAboveEvidence.band]
    // left = min(30, 70) = 30 (evidencePct); width = 70 - 30 = 40. An
    // inverted min/max would put left at 70 and/or produce a negative width.
    expect(html).toContain(`style="left:30%;width:40%;background-color:${fill}"`)
  })

  it('draws the connecting segment at left=min, width=(max-min) when evidence > belief', () => {
    const fill = BAND_FILL[evidenceAboveBelief.band]
    // left = min(80, 25) = 25 (beliefPct); width = 80 - 25 = 55. A component
    // that always used evidencePct as `left` (never actually taking the min)
    // would pass the row above but fail this one.
    expect(html).toContain(`style="left:25%;width:55%;background-color:${fill}"`)
  })

  it('prints "Evidence X · Belief Y" as real text for every row — the mandatory, non-decorative line', () => {
    // Without this line the two dot positions would be the only carrier of
    // these two values, which the brief rules out explicitly.
    expect(html).toContain(escapeHtml('Evidence 30 · Belief 70'))
    expect(html).toContain(escapeHtml('Evidence 80 · Belief 25'))
  })
})
