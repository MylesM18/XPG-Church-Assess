// `.ts` not `.tsx` (vitest.config.ts includes tests/**/*.test.ts only) — JSX as createElement.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  WebCapacityBars,
  WebChainRail,
  WebConstraintCallout,
  WebDumbbells,
  WebPhaseRail,
  WebSpread,
  WebThemeSplit,
} from '../../app/app/[churchId]/diagnosis/report/web-visuals'
import { BAND_FILL, BAND_TEXT, THEME_FILL, textOnBand } from '@/lib/report/charts'
import type {
  CapacityBarsModel,
  ChainModel,
  ConstraintCalloutModel,
  DumbbellsModel,
  PhaseRailModel,
  SpreadModel,
  ThemeSplitModel,
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

describe('WebThemeSplit', () => {
  // theology: zero-count row. systems: non-zero row. Both must render — a
  // dropped zero row would hide the finding that a theme never appeared.
  const model: ThemeSplitModel = {
    rows: [
      { theme: 'theology', label: 'THEOLOGY', count: 0, pct: 0 },
      { theme: 'systems', label: 'SYSTEMS', count: 5, pct: 100 },
    ],
    total: 5,
    label: 'THEME OF THE WEAKEST INDICATORS',
  }
  const html = renderToStaticMarkup(createElement(WebThemeSplit, { model }))

  it('renders a zero-count row: label present, track present (even at 0% width), themed like any other row', () => {
    // Regression this catches: the zero row being filtered out of `rows` before
    // render (e.g. a `.filter(r => r.count > 0)` sneaking in) — both the label
    // and the (empty) track would vanish along with it.
    expect(html).toContain(`style="color:${THEME_FILL.theology}">THEOLOGY<`)
    expect(html).toContain(`style="width:0%;background-color:${THEME_FILL.theology}"`)
  })

  it('colors a zero-count row\'s number INK_SOFT, not the theme colour', () => {
    // Regression this catches: `row.count === 0 ? INK_SOFT : THEME_FILL[row.theme]`
    // inverted or dropped — the 0 would render in THEME_FILL.theology instead.
    expect(html).toContain('style="color:#5A5A54">0<')
    expect(html).not.toContain(`style="color:${THEME_FILL.theology}">0<`)
  })

  it('colors a non-zero row\'s number THEME_FILL[row.theme], not INK_SOFT', () => {
    // Regression this catches: the ternary always picking INK_SOFT (or the
    // branches swapped) — the 5 would render grey instead of themed.
    expect(html).toContain(`style="color:${THEME_FILL.systems}">5<`)
    expect(html).not.toContain('style="color:#5A5A54">5<')
  })
})

describe('WebSpread', () => {
  // Two rows share id 'gov' on purpose: category_id is not guaranteed unique
  // across dispersion rows, and the list key includes the index specifically
  // so neither row is silently dropped.
  const model: SpreadModel = {
    rows: [
      { id: 'gov', name: 'Governance Cadence', spread: 3.2, pct: 64, band: 'watch' },
      { id: 'gov', name: 'Communication Rhythm', spread: 4.5, pct: 90, band: 'severe' },
    ],
    axisMax: 5,
    axisMaxLabel: '5',
    threshold: 2.1,
    thresholdPct: 42,
    thresholdLabel: 'THRESHOLD 2.1',
  }
  const html = renderToStaticMarkup(createElement(WebSpread, { model }))

  it('places the threshold marker at left:model.thresholdPct%', () => {
    // Regression this catches: the marker reading row.pct or model.axisMax
    // instead of model.thresholdPct — the dashed line would drift to the wrong
    // spot on the axis whenever thresholdPct differs from those other values.
    expect(html).toContain(`style="left:${model.thresholdPct}%;border-color:#5A5A54"`)
  })

  it('renders BOTH rows even though they share the same id — nothing is dropped, and each row keeps its OWN name bound to its OWN spread', () => {
    // Regression this catches: keying the list on `row.id` alone (e.g. a
    // `<li key={row.id}>` instead of `${row.id}-${i}`) would not, by itself,
    // break renderToStaticMarkup output — but a de-dup written against that
    // assumption (e.g. building a Map<id, row> before rendering) would silently
    // drop the second 'gov' row. This proves both names and both spread values
    // are present in one render.
    expect(html).toContain(escapeHtml('Governance Cadence'))
    expect(html).toContain(escapeHtml('Communication Rhythm'))
    expect(html).toContain('>3.2<')
    expect(html).toContain('>4.5<')
    // The four checks above only prove each value is present SOMEWHERE — they
    // would still pass if row 1's name were rendered next to row 2's spread (a
    // mispairing bug), since every value would still appear once in total.
    // Splitting on `<li` isolates each row's own markup so name and spread are
    // checked bound together, per row — a cross-row mispairing fails this.
    const [, row1Chunk, row2Chunk] = html.split('<li')
    expect(row1Chunk).toBeDefined()
    expect(row2Chunk).toBeDefined()
    expect(row1Chunk).toContain(escapeHtml('Governance Cadence'))
    expect(row1Chunk).toContain('>3.2<')
    expect(row1Chunk).not.toContain(escapeHtml('Communication Rhythm'))
    expect(row1Chunk).not.toContain('>4.5<')
    expect(row2Chunk).toContain(escapeHtml('Communication Rhythm'))
    expect(row2Chunk).toContain('>4.5<')
    expect(row2Chunk).not.toContain(escapeHtml('Governance Cadence'))
    expect(row2Chunk).not.toContain('>3.2<')
  })
})

describe('WebChainRail', () => {
  // Stage 1 has no gates (exercises the null branch). Stage 2 has one gate
  // whose band ('severe') deliberately differs from its stage's band
  // ('broken') — a gate chip must never inherit its stage's colour.
  const model: ChainModel = {
    stages: [
      { id: 's1', ordinal: '01', name: 'Discipleship Pathway', score: 70, band: 'holding', gates: [] },
      {
        id: 's2',
        ordinal: '02',
        name: 'Community Formation',
        score: 40,
        band: 'broken',
        gates: [
          {
            id: 'g1',
            name: 'Volunteer Pipeline',
            score: 22,
            note: 'Only 12% of members serve regularly.',
            band: 'severe',
          },
        ],
      },
    ],
    reads: [],
  }
  const html = renderToStaticMarkup(createElement(WebChainRail, { model }))

  it('renders no gates <ul> at all for a stage with an empty gates array', () => {
    // Regression this catches: `stage.gates.length === 0 ? null : (...)`
    // dropped or inverted, which would emit an empty `<ul role="list">` for
    // stage 1. The count below is exactly 2 — the outer stages <ol> plus the
    // ONE gates <ul> that stage 2 (non-empty) legitimately renders; a stray
    // empty gates list for stage 1 would push it to 3.
    expect((html.match(/role="list"/g) ?? []).length).toBe(2)
  })

  it('renders the gates <ul> with its chip for a stage with a non-empty gates array', () => {
    expect(html).toContain(escapeHtml('Volunteer Pipeline'))
    expect(html).toContain(escapeHtml('Only 12% of members serve regularly.'))
  })

  it("colors a gate chip by the gate's OWN band, not its stage's band", () => {
    // Regression this catches: the gate chip reading `stage.band` (via a copy-
    // paste from the stage badge above it) instead of `gate.band` — the chip
    // would render broken's colours instead of severe's.
    expect(html).toContain(
      `style="background-color:${BAND_FILL.broken};color:${textOnBand('broken')}">02<`,
    )
    expect(html).toContain(`style="border-color:${BAND_FILL.severe}"`)
    expect(html).toContain(`style="color:${BAND_TEXT.severe}">Volunteer Pipeline<`)
    // The two bands' fills are distinct hexes, so the assertions above cannot
    // pass by the stage and gate colours coincidentally matching.
    expect(BAND_FILL.broken).not.toBe(BAND_FILL.severe)
  })
})

describe('WebPhaseRail', () => {
  // Two blocks: one at full opacity (severe/broken/holding bands render CREAM
  // text on it), one at reduced opacity (must flip to INK — cream on a
  // 30%/60%-strength ground is unreadable). Band 'broken' is deliberately NOT
  // 'watch', so textOnBand(band) resolves to CREAM (#FAF7F0) — distinct from
  // INK (#1A1A18) — and the two colour-flip tests below cannot pass by
  // coincidence the way they could if band were 'watch' (where textOnBand
  // already returns ink).
  const model: PhaseRailModel = {
    blocks: [
      { numeral: '30', dayLabel: '30 Days', text: 'Fix the volunteer pipeline.', opacity: 1 },
      { numeral: '60', dayLabel: '60 Days', text: 'Launch a new small group track.', opacity: 0.6 },
    ],
    band: 'broken',
    supersedes: [
      '30 Days — Fix the volunteer pipeline.',
      '60 Days — Launch a new small group track.',
    ],
  }
  const bullets = [
    '30 Days — Fix the volunteer pipeline.',
    '60 Days — Launch a new small group track.',
    'Do not work on yet: launch a new campus.',
  ]
  const html = renderToStaticMarkup(createElement(WebPhaseRail, { model, bullets }))

  it('drops every bullet that IS in model.supersedes', () => {
    // Regression this catches: the filter inverted (`.filter(b =>
    // model.supersedes.includes(b))`) or removed entirely — the superseded
    // bullets would show up a second time, duplicating what the rail already
    // displays.
    expect(html).not.toContain(escapeHtml('30 Days — Fix the volunteer pipeline.'))
    expect(html).not.toContain(escapeHtml('60 Days — Launch a new small group track.'))
  })

  it('keeps the one bullet that is NOT in model.supersedes, in the bullet list beneath', () => {
    // Regression this catches: the filter dropped (bullets ignored entirely)
    // or the `remaining` list never rendered — the "Do not work on yet" line
    // (real deterministic prose s10Bullets appended) would be silently lost.
    expect(html).toContain('list-disc')
    expect(html).toContain(escapeHtml('Do not work on yet: launch a new campus.'))
  })

  it('emits no <ul> at all when nothing remains after filtering', () => {
    const supersedeAll: PhaseRailModel = { ...model, supersedes: bullets }
    const htmlNone = renderToStaticMarkup(createElement(WebPhaseRail, { model: supersedeAll, bullets }))
    // Regression this catches: `remaining.length === 0 ? null : (...)` dropped,
    // which would emit an empty `<ul class="list-disc ...">` — "never an empty
    // frame" applies here too. The blocks list is an <ol>, so any `<ul` found
    // can only be the (wrongly) non-null remaining list.
    expect(htmlNone).not.toContain('<ul')
  })

  it('binds the colour flip to its OWN block: full-opacity -> textOnBand(band), reduced-opacity -> INK', () => {
    // With exactly two blocks and exactly two possible colours, unscoped
    // `html.toContain('color:'+textOnBand(...))` / `html.toContain('color:#1A1A18')`
    // checks (as this test used to do) are satisfied even by an INVERTED ternary
    // (`block.opacity === 1 ? INK : textOnBand(model.band)`) — both hex strings
    // still appear in the page, just swapped onto the wrong blocks. Splitting on
    // `<li` isolates each block's own markup (bullets: [] so the remaining-
    // bullets <ul> contributes no extra `<li>` to split on), then each half is
    // checked against its OWN opacity marker bound to its OWN expected colour.
    const htmlNoBullets = renderToStaticMarkup(createElement(WebPhaseRail, { model, bullets: [] }))
    const [, fullOpacityChunk, reducedOpacityChunk] = htmlNoBullets.split('<li')
    expect(fullOpacityChunk).toBeDefined()
    expect(reducedOpacityChunk).toBeDefined()

    // Full-opacity (1) block: its own chunk carries its own opacity:1 marker
    // AND textOnBand(model.band) — never INK.
    expect(fullOpacityChunk).toContain('opacity:1"')
    expect(fullOpacityChunk).toContain(`color:${textOnBand(model.band)}`)
    expect(fullOpacityChunk).not.toContain('color:#1A1A18')

    // Reduced-opacity (0.6) block: its own chunk carries its own opacity:0.6
    // marker AND INK — never textOnBand(model.band). Regression this catches:
    // `block.opacity === 1 ? textOnBand(model.band) : INK` inverted or dropped
    // to always use textOnBand — the 60-day block would render CREAM text on
    // its 60%-strength ground, which is the exact illegibility this ternary
    // exists to prevent, and this is the only pair of assertions in this file
    // that can actually catch that inversion.
    expect(reducedOpacityChunk).toContain('opacity:0.6"')
    expect(reducedOpacityChunk).toContain('color:#1A1A18')
    expect(reducedOpacityChunk).not.toContain(`color:${textOnBand(model.band)}`)
  })
})
