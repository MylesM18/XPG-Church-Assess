// `.ts` not `.tsx` (vitest.config.ts includes tests/**/*.test.ts only) — JSX as createElement.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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
import { loadMethodology } from '@/lib/methodology/load'
import { webVisuals } from '@/lib/report/web-visuals'
import { FOUNDATION_3_FACTS } from '../fixtures/facts'
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

  it('colors a zero-count row\'s number ink-soft, not the theme colour', () => {
    // Regression this catches: `row.count === 0 ? var(--color-ink-soft) : THEME_FILL[row.theme]`
    // inverted or dropped — the 0 would render in THEME_FILL.theology instead.
    expect(html).toContain('style="color:var(--color-ink-soft)">0<')
    expect(html).not.toContain(`style="color:${THEME_FILL.theology}">0<`)
  })

  it('colors a non-zero row\'s number THEME_FILL[row.theme], not ink-soft', () => {
    // Regression this catches: the ternary always picking ink-soft (or the
    // branches swapped) — the 5 would render grey instead of themed.
    expect(html).toContain(`style="color:${THEME_FILL.systems}">5<`)
    expect(html).not.toContain('style="color:var(--color-ink-soft)">5<')
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
    expect(html).toContain(`style="left:${model.thresholdPct}%;border-color:var(--color-ink-soft)"`)
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
  // text on it), one at reduced opacity (must flip to the theme ink token — cream
  // on a 30%/60%-strength ground is unreadable). Band 'broken' is deliberately NOT
  // 'watch', so textOnBand(band) resolves to CREAM (#FAF7F0) rather than the PDF's
  // ink hex, keeping the two colour-flip tests below meaningful in the same way they
  // were when the reduced-opacity colour was itself a hex.
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

  it('binds the colour flip to its OWN block: full-opacity -> textOnBand(band), reduced-opacity -> the theme ink', () => {
    // With exactly two blocks and exactly two possible colours, unscoped
    // `html.toContain('color:'+textOnBand(...))` / `html.toContain('color:var(--color-ink)')`
    // checks (as this test used to do) are satisfied even by an INVERTED ternary
    // (`block.opacity === 1 ? var(--color-ink) : textOnBand(model.band)`) — both colour strings
    // still appear in the page, just swapped onto the wrong blocks. Splitting on
    // `<li` isolates each block's own markup (bullets: [] so the remaining-
    // bullets <ul> contributes no extra `<li>` to split on), then each half is
    // checked against its OWN opacity marker bound to its OWN expected colour.
    const htmlNoBullets = renderToStaticMarkup(createElement(WebPhaseRail, { model, bullets: [] }))
    const [, fullOpacityChunk, reducedOpacityChunk] = htmlNoBullets.split('<li')
    expect(fullOpacityChunk).toBeDefined()
    expect(reducedOpacityChunk).toBeDefined()

    // Full-opacity (1) block: its own chunk carries its own opacity:1 marker
    // AND textOnBand(model.band) — never the theme ink.
    expect(fullOpacityChunk).toContain('opacity:1"')
    expect(fullOpacityChunk).toContain(`color:${textOnBand(model.band)}`)
    expect(fullOpacityChunk).not.toContain('color:var(--color-ink)')

    // Reduced-opacity (0.6) block: its own chunk carries its own opacity:0.6
    // marker AND the theme ink — never textOnBand(model.band). Regression this
    // catches: `block.opacity === 1 ? textOnBand(model.band) : var(--color-ink)`
    // inverted or dropped to always use textOnBand — the 60-day block would render
    // CREAM text on its 60%-strength ground, which is the exact illegibility this
    // ternary exists to prevent, and this is the only pair of assertions in this
    // file that can actually catch that inversion.
    expect(reducedOpacityChunk).toContain('opacity:0.6"')
    expect(reducedOpacityChunk).toContain('color:var(--color-ink)')
    expect(reducedOpacityChunk).not.toContain(`color:${textOnBand(model.band)}`)
  })
})

/**
 * The foundation archetype's NINE-entry rail — the case every hand-built model above is
 * structurally unable to reach, and the reason the phase-opacity defect survived a whole
 * branch of reviews: the only foundation-archetype coverage asserted the MODEL and never
 * rendered it.
 *
 * roadmapEntries (lib/report/fallback-sections.ts) loops `for phase { for gatedEnabler }`,
 * so FOUNDATION_3_FACTS (3 gated enablers x 3 phases, per ruling 8) yields nine entries
 * ordered [30/A, 30/B, 30/C, 60/A, ...]. Opacity must therefore encode the PHASE, not the
 * array position: all three 30-day blocks share one opacity, all three 60-day blocks the
 * next, all three 90-day blocks the third.
 *
 * Regression this catches: `PHASE_OPACITY[i]` keyed on array index, which rendered three
 * consecutive "30 days" blocks at 1 / 0.6 / 0.3 and flattened all six 60- and 90-day
 * blocks to 0.3 — the ramp stopped encoding phase at all.
 *
 * Every assertion below is scoped to a single block's own <li> chunk. A value appearing
 * SOMEWHERE in this markup proves nothing: nine blocks draw from a three-value palette,
 * so unscoped `toContain` checks pass on almost any misassignment.
 */
describe('WebPhaseRail — foundation archetype, nine roadmap entries', () => {
  const model = webVisuals(FOUNDATION_3_FACTS, loadMethodology()).s10.phaseRail
  // bullets: [] so the remaining-bullets <ul> contributes no extra <li> to split on.
  const html = renderToStaticMarkup(createElement(WebPhaseRail, { model: model!, bullets: [] }))
  const chunks = html.split('<li').slice(1)

  const OPACITY = /opacity:([\d.]+)"/
  // The day-label caption is the block's only element carrying the CAPS class; the numeral
  // beside it carries NUM, and the body text carries the body class. All three are distinct.
  const DAY_LABEL = /tracking-\[0\.1em\]">([^<]+)</
  // The reduced-opacity text colour: the web @theme's ink token, read inline because it sits in
  // a ternary beside the computed textOnBand(band).
  const INK_TOKEN = 'var(--color-ink)'

  it('is a genuine nine-block model, so nothing below passes vacuously on a three-block rail', () => {
    expect(model).not.toBeNull()
    expect(model!.blocks.length).toBe(9)
    expect(chunks.length).toBe(9)
  })

  it('gives every 30-day block one opacity, every 60-day block the next, every 90-day block the third', () => {
    const byDayLabel = new Map<string, string[]>()
    for (const chunk of chunks) {
      const dayLabel = DAY_LABEL.exec(chunk)?.[1]
      const opacity = OPACITY.exec(chunk)?.[1]
      // Both are read out of the SAME chunk, so each opacity is bound to the day label
      // printed beside it — a cross-block mixup cannot survive this pairing.
      expect(dayLabel).toBeDefined()
      expect(opacity).toBeDefined()
      byDayLabel.set(dayLabel!, [...(byDayLabel.get(dayLabel!) ?? []), opacity!])
    }

    expect([...byDayLabel.keys()].sort()).toEqual(['30 days', '60 days', '90 days'])
    expect(byDayLabel.get('30 days')).toEqual(['1', '1', '1'])
    expect(byDayLabel.get('60 days')).toEqual(['0.6', '0.6', '0.6'])
    expect(byDayLabel.get('90 days')).toEqual(['0.3', '0.3', '0.3'])
  })

  it('flips text to the theme ink on every reduced-opacity block, so ONLY the three 30-day blocks wear textOnBand', () => {
    // Guard first: the two colours this component can emit must be distinct strings, or every
    // assertion below is trivially true. (This used to be the live risk — with the reduced
    // branch on the PDF's own ink hex, a fixture landing on the 'watch' band made
    // textOnBand(band) that same hex. The branch now emits a token, so the two can no longer
    // collide; the guard is kept so a future move back to a literal is caught.)
    const onBand = textOnBand(model!.band)
    expect(onBand).not.toBe(INK_TOKEN)

    for (const chunk of chunks) {
      const dayLabel = DAY_LABEL.exec(chunk)![1]
      if (dayLabel === '30 days') {
        expect(chunk).toContain(`color:${onBand}`)
        expect(chunk).not.toContain(`color:${INK_TOKEN}`)
      } else {
        expect(chunk).toContain(`color:${INK_TOKEN}`)
        expect(chunk).not.toContain(`color:${onBand}`)
      }
    }
  })

  it('renders nine separate list items, each carrying its OWN day label bound to its OWN text', () => {
    // Stand-in for key uniqueness. React puts no keys in static markup, and React 19's
    // server renderer emits no duplicate-key warning either (verified empirically — the
    // reconciler's duplicate-key check is client-side), so the observable property is that
    // all nine blocks survive as nine <li>s with their own content. This proves nothing
    // about the key EXPRESSION on its own; the source assertion below covers that.
    expect(chunks.length).toBe(model!.blocks.length)
    model!.blocks.forEach((block, i) => {
      expect(chunks[i]).toContain(`>${escapeHtml(block.dayLabel)}<`)
      expect(chunks[i]).toContain(`>${escapeHtml(block.text)}<`)
    })
    // The nine texts are nine distinct action_library strings, so the per-chunk pairing
    // above cannot be satisfied by a component that renders one block nine times.
    expect(new Set(model!.blocks.map((b) => b.text)).size).toBe(9)
  })

  it('keys each block on the index too — three distinct day labels cannot key nine siblings', () => {
    // SOURCE-READING assertion (same approach as tests/a11y/shared-report-heading.test.ts):
    // duplicate React keys are invisible in rendered markup, so the only place to catch
    // `key={block.dayLabel}` is the source. Written against the map callback's own
    // parameter name rather than a literal key string, so renaming `i` does not break it.
    const source = fs.readFileSync(
      path.join(
        fileURLToPath(new URL('../..', import.meta.url)),
        'app', 'app', '[churchId]', 'diagnosis', 'report', 'web-visuals.tsx',
      ),
      'utf8',
    )
    const railBody = source.slice(source.indexOf('export function WebPhaseRail'))
    const mapCall = /model\.blocks\.map\(\(\s*(\w+)\s*,\s*(\w+)\s*\)\s*=>/.exec(railBody)
    expect(mapCall).not.toBeNull()

    const indexParam = mapCall![2]!
    const liStart = railBody.indexOf('<li')
    const liTagHead = railBody.slice(liStart, railBody.indexOf('className', liStart))
    expect(liTagHead).toContain('key=')
    expect(liTagHead).toContain(`\${${indexParam}}`)
  })
})
