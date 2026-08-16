// Note: this file is intentionally `.ts`, not `.tsx`. vitest.config.ts's `include` is
// `tests/**/*.test.ts` — a `.tsx` test file would never be collected (silently, exit code 0,
// the suite total would simply stay unchanged), and vitest.config.ts is off-limits to edit for
// this task. So JSX is written as `createElement` calls instead of angle-bracket syntax; every
// assertion below is otherwise identical to what a JSX version would check.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ReportSections, SectionBodyView } from '../../app/app/[churchId]/diagnosis/report/sections'
import type { AssembledSection } from '../../lib/report/compose'
import type { ChartModel } from '../../lib/report/charts'
import type { PhaseRailModel, WebVisuals } from '../../lib/report/web-visuals'

// ReportSections now requires the cover's verdict band (Part B re-skin); any band renders.
const BAND = 'holding' as const

// This file's sections are synthetic (fallbackSection/aiSection), so `visuals` is a minimal
// literal satisfying WebVisuals rather than the real facts/methodology pipeline — these tests
// exercise dispatch/chrome, not the visual models themselves (that's tests/report/web-visuals*).
const VISUALS: WebVisuals = {
  s3: { capacity: { band: 'holding', capacity: 0, throughput: 0, capacityPct: 0, throughputPct: 0, gap: 0, gapLabel: null } },
  s4: { constraint: null, dumbbells: null },
  s7: { themeSplit: null },
  s8: { spread: null },
  s9: { chain: { stages: [], reads: [] } },
  s10: { phaseRail: null },
  s13: { confidence: { pct: 0, label: '0%', respondents: 0, areas: 0, thinnest: null } },
}

const fallbackSection = (id: string, title: string): AssembledSection => ({
  id: id as AssembledSection['id'],
  source: 'fallback',
  ai: null,
  fallback: { title, body: `body of ${id}`, bullets: [`bullet a ${id}`, `bullet b ${id}`] },
  charts: [],
})

describe('SectionBodyView', () => {
  it('renders the body and every bullet', () => {
    const html = renderToStaticMarkup(
      createElement(SectionBodyView, { body: 'the body', bullets: ['one', 'two'] }),
    )
    expect(html).toContain('the body')
    expect(html).toContain('one')
    expect(html).toContain('two')
  })

  it('renders no list at all when there are no bullets', () => {
    const html = renderToStaticMarkup(createElement(SectionBodyView, { body: 'the body', bullets: [] }))
    expect(html).toContain('the body')
    expect(html).not.toContain('<ul')
  })
})

describe('ReportSections', () => {
  const sections = [
    fallbackSection('s1', 'Overview'),
    fallbackSection('s2', 'Executive summary'),
    fallbackSection('s3', 'How to read this'),
  ]

  it('renders every section, in array order, and never re-sorts', () => {
    const html = renderToStaticMarkup(createElement(ReportSections, { visuals: VISUALS, band: BAND, sections }))
    const order = ['Overview', 'Executive summary', 'How to read this'].map((t) => html.indexOf(t))
    expect(order).toEqual([...order].sort((a, b) => a - b))
    // Collect and compare the whole set — an assertion inside a loop reports only the
    // FIRST failure.
    const missing = sections.filter((s) => !html.includes(s.fallback.title))
    expect(missing.map((s) => s.id)).toEqual([])
  })

  it('takes every heading from fallback.title', () => {
    const html = renderToStaticMarkup(createElement(ReportSections, { visuals: VISUALS, band: BAND, sections }))
    expect(html).toContain('>Overview<')
    expect(html).toContain('>Executive summary<')
  })

  it('renders exactly one <h1>, on the first section only', () => {
    const html = renderToStaticMarkup(createElement(ReportSections, { visuals: VISUALS, band: BAND, sections }))
    expect((html.match(/<h1[\s>]/g) ?? []).length).toBe(1)
    expect(html.indexOf('<h1')).toBeLessThan(html.indexOf('<h2'))
    expect((html.match(/<h2[\s>]/g) ?? []).length).toBe(2)
  })

  it('renders a fallback section through SectionBodyView', () => {
    const html = renderToStaticMarkup(
      createElement(ReportSections, { visuals: VISUALS, band: BAND, sections: [fallbackSection('s1', 'Overview')] }),
    )
    expect(html).toContain('body of s1')
    expect(html).toContain('bullet a s1')
  })

  it('renders an empty section list without throwing', () => {
    expect(renderToStaticMarkup(createElement(ReportSections, { visuals: VISUALS, band: BAND, sections: [] }))).toBe('')
  })
})

// --- AI renderers (Task 6) -------------------------------------------------------------------
//
// Written with createElement, not JSX, for the same reason as the rest of this file: this file
// is intentionally `.ts` and vitest.config.ts's include (`tests/**/*.test.ts`) does not match
// `.tsx` — a JSX version would silently never be collected.

const aiSection = (id: string, title: string, ai: unknown): AssembledSection => ({
  id: id as AssembledSection['id'],
  source: 'ai',
  ai,
  fallback: { title, body: `FALLBACK BODY ${id}`, bullets: [`FALLBACK BULLET ${id}`] },
  charts: [],
})

const VALID_AI: Record<string, unknown> = {
  s2: { summary: 'AI summary text', what_this_is_not: 'AI not-this text', context_bullets: ['ctx one', 'ctx two'] },
  s4: { thesis_word: 'Alignment', narrative: 'AI s4 narrative' },
  s5: { strengths: [{ category_id: 'c1', heading: 'Strength head', body: 'Strength body' }] },
  s6: {
    areas: [{
      category_id: 'c2',
      affirm: 'affirm text',
      pivot: 'pivot text',
      evidence: 'evidence text',
      not_statement: 'not statement text',
      reframe: 'reframe text',
      trajectory: 'trajectory text',
    }],
  },
  s7: { narrative: 'AI s7 narrative', pattern_claim: 'the pattern claim' },
  s9: { narrative: 'AI s9 narrative', working_model: 'the working model' },
  s12: { assessment: 'AI s12 assessment', overall_percent: 62, tier_name: 'Developing', primary_objective: 'the objective' },
}

describe('AI renderers', () => {
  it('renders every AI shape through its own renderer, not the fallback', () => {
    // Collect and compare the whole set — an assertion inside a loop reports only the
    // FIRST failure, which would hide six broken renderers behind one.
    const leaked = Object.entries(VALID_AI).filter(([id, ai]) => {
      const html = renderToStaticMarkup(
        createElement(ReportSections, { visuals: VISUALS, band: BAND, sections: [aiSection(id, `Title ${id}`, ai)] }),
      )
      return html.includes(`FALLBACK BODY ${id}`)
    })
    expect(leaked.map(([id]) => id)).toEqual([])
  })

  it('renders the distinctive content of each AI shape', () => {
    const expected: Record<string, string[]> = {
      s2: ['AI summary text', 'AI not-this text', 'ctx one', 'ctx two'],
      s4: ['Alignment', 'AI s4 narrative'],
      s5: ['Strength head', 'Strength body'],
      s6: ['affirm text', 'pivot text', 'evidence text', 'not statement text', 'reframe text', 'trajectory text'],
      s7: ['AI s7 narrative', 'the pattern claim'],
      s9: ['AI s9 narrative', 'the working model'],
      s12: ['AI s12 assessment', '62', 'Developing', 'the objective'],
    }
    const missing: string[] = []
    for (const [id, needles] of Object.entries(expected)) {
      const html = renderToStaticMarkup(
        createElement(ReportSections, { visuals: VISUALS, band: BAND, sections: [aiSection(id, `Title ${id}`, VALID_AI[id])] }),
      )
      for (const needle of needles) if (!html.includes(needle)) missing.push(`${id}:${needle}`)
    }
    expect(missing).toEqual([])
  })

  it('renders the six s6 beats in order: affirm, pivot, evidence, not_statement, reframe, trajectory', () => {
    const html = renderToStaticMarkup(
      createElement(ReportSections, { visuals: VISUALS, band: BAND, sections: [aiSection('s6', 'Areas', VALID_AI.s6)] }),
    )
    const positions = [
      'affirm text', 'pivot text', 'evidence text', 'not statement text', 'reframe text', 'trajectory text',
    ].map((t) => html.indexOf(t))
    // Strengthening beyond the brief: an indexOf-ordering assertion over needles that are ABSENT
    // degenerates to [-1, -1, -1], which is trivially "sorted" and would pass even if s6 never
    // rendered its AI content at all. Assert presence first so the order check below cannot pass
    // vacuously.
    expect(positions.every((p) => p > -1)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('omits the s7 pattern claim when it is null', () => {
    const html = renderToStaticMarkup(
      createElement(ReportSections, {
        visuals: VISUALS,
        band: BAND,
        sections: [aiSection('s7', 'Lowest', { narrative: 'only narrative', pattern_claim: null })],
      }),
    )
    expect(html).toContain('only narrative')
    expect(html).not.toContain('FALLBACK BODY s7')
  })

  it('falls back to SectionBodyView when an AI payload fails its schema, and never throws', () => {
    const broken = Object.keys(VALID_AI).filter((id) => {
      const html = renderToStaticMarkup(
        createElement(ReportSections, { visuals: VISUALS, band: BAND, sections: [aiSection(id, `Title ${id}`, { nonsense: true })] }),
      )
      return !html.includes(`FALLBACK BODY ${id}`)
    })
    expect(broken).toEqual([])
  })

  it('falls back when ai is null on a source:ai section', () => {
    const html = renderToStaticMarkup(
      createElement(ReportSections, { visuals: VISUALS, band: BAND, sections: [aiSection('s2', 'Executive summary', null)] }),
    )
    expect(html).toContain('FALLBACK BODY s2')
  })

  it('still takes the heading from fallback.title on an AI section', () => {
    const html = renderToStaticMarkup(
      createElement(ReportSections, { visuals: VISUALS, band: BAND, sections: [aiSection('s2', 'Executive summary', VALID_AI.s2)] }),
    )
    expect(html).toContain('Executive summary')
  })

  it('uses SectionBodyView for a non-AI section id even when source is ai', () => {
    // s1/s3/s8/s10/s11/appendix have no AI renderer — they must not throw.
    const html = renderToStaticMarkup(
      createElement(ReportSections, { visuals: VISUALS, band: BAND, sections: [aiSection('s8', 'What leaders are saying', VALID_AI.s2)] }),
    )
    expect(html).toContain('FALLBACK BODY s8')
  })
})

// --- Visual placement dispatchers (Task 16) ---------------------------------------------------
//
// The real-data placement/ordering assertions live in tests/report/web-sections.test.ts. These
// two cases need shapes CAPACITY_FACTS cannot produce: a section that carries charts while
// belonging to NEITHER placement list, and an s10 whose bullets are not entirely superseded by
// the phase rail (s10Bullets only appends its extra `Do not work on yet:` line for the
// 'constraint' archetype). Both are built synthetically here.
//
// Class strings are the ones sections.tsx uses, kept in sync by hand exactly as
// web-sections.test.ts does — a drift fails these loudly rather than silently.
const BODY_CLASS = 'font-body text-base leading-[1.6] text-ink'
const LIST_CLASS = 'list-disc space-y-1 pl-5 font-body text-base leading-[1.6] text-ink'
const RAIL_TEXT_CLASS = 'font-body text-[0.9375rem] leading-[1.6]'
const CAPS_CLASS = 'font-body text-[0.6875rem] font-bold uppercase tracking-[0.1em]'
const CONFIDENCE_HEAD = `<p class="${CAPS_CLASS}" style="color:#5A5A54">Confidence</p>`
const STAT_GRID = 'aria-label="Area scores with health bands"'
const RANK_LIST = 'aria-label="Weakest questions, ranked"'

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const countOf = (html: string, needle: string) =>
  (html.match(new RegExp(escapeRe(needle), 'g')) ?? []).length

const SYNTHETIC_STAT_GRID: ChartModel = {
  kind: 'stat_grid',
  width: 500,
  height: 72,
  cells: [
    {
      id: 'c1',
      name: 'Volunteers',
      score: 61,
      band: 'holding',
      percentile: 40,
      label: 'VOLUNTEERS · HOLDING',
      x: 0,
      y: 0,
      w: 250,
      h: 72,
      bar: { x: 12, y: 56, w: 100, h: 4 },
    },
  ],
}

const SYNTHETIC_RANK_LIST: ChartModel = {
  kind: 'rank_list',
  width: 500,
  height: 44,
  rows: [
    {
      rank: '01',
      itemId: 'q1',
      text: 'RANKED QUESTION ONE',
      fullText: 'RANKED QUESTION ONE',
      mean: 42,
      theme: 'systems',
      themeLabel: 'SYSTEMS',
      y: 0,
      h: 44,
      scoreBlock: { x: 444, y: 6, w: 56, h: 32 },
    },
  ],
}

describe('SectionVisualsAbove / SectionVisualsBelow', () => {
  it('renders EVERY chart of an unplaced section above its body, in model order, exactly once', () => {
    // s5 is in neither ABOVE_IDS nor BELOW_IDS, so it must keep the pre-Task-16 behaviour of the
    // blind `section.charts.map`: all charts, above the body, in array order. Regressions this
    // catches: the `!ABOVE_IDS.includes(...)` early return being dropped (charts vanish); 's5'
    // being added to BELOW_IDS (a chart moves below, or renders twice); the charts and the body
    // swapping slots.
    const section: AssembledSection = {
      ...fallbackSection('s5', 'Strengths'),
      charts: [SYNTHETIC_RANK_LIST, SYNTHETIC_STAT_GRID],
    }
    const html = renderToStaticMarkup(
      createElement(ReportSections, { visuals: VISUALS, band: BAND, sections: [section] }),
    )
    const body = `<p class="${BODY_CLASS}">body of s5</p>`
    const at = [RANK_LIST, STAT_GRID, body].map((needle) => html.indexOf(needle))
    expect(at, 'both charts and the body must render').not.toContain(-1)
    // Model order (rank list BEFORE stat grid, both before the body), not kind order.
    expect(at).toEqual([...at].sort((a, b) => a - b))
    expect(countOf(html, RANK_LIST)).toBe(1)
    expect(countOf(html, STAT_GRID)).toBe(1)
    // Nothing from the placement branches leaks onto an unplaced section.
    expect(html).not.toContain(CONFIDENCE_HEAD)
  })

  it('swaps the s10 bullets for the phase rail, keeping the body and any bullet it does not supersede', () => {
    const phaseRail: PhaseRailModel = {
      blocks: [
        { numeral: '30', dayLabel: '30 days', text: 'RAIL BLOCK THIRTY', opacity: 1 },
        { numeral: '60', dayLabel: '60 days', text: 'RAIL BLOCK SIXTY', opacity: 0.6 },
        { numeral: '90', dayLabel: '90 days', text: 'RAIL BLOCK NINETY', opacity: 0.3 },
      ],
      band: 'holding',
      supersedes: ['SUPERSEDED BULLET'],
    }
    const section: AssembledSection = {
      ...fallbackSection('s10', 'Roadmap'),
      fallback: {
        title: 'Roadmap',
        body: 'BODY OF S10',
        bullets: ['SUPERSEDED BULLET', 'SURVIVING BULLET'],
      },
    }
    const html = renderToStaticMarkup(
      createElement(ReportSections, {
        visuals: { ...VISUALS, s10: { phaseRail } },
        band: BAND,
        sections: [section],
      }),
    )

    // Prose parity: every string SectionBodyView would have rendered for s10, EXCEPT the ones
    // the model declares superseded, still reaches the page.
    expect(html).toContain(`<p class="${BODY_CLASS}">BODY OF S10</p>`)
    expect(html).toContain(`<li>SURVIVING BULLET</li>`)
    expect(html).not.toContain(`<li>SUPERSEDED BULLET</li>`)
    // The superseded string is not merely un-listed, it is off the page entirely (the rail
    // renders its own copy from the model's blocks, not from the bullet text).
    expect(html).not.toContain('SUPERSEDED BULLET')

    for (const block of phaseRail.blocks) {
      expect(html, block.dayLabel).toContain(`<p class="${RAIL_TEXT_CLASS}">${block.text}</p>`)
    }
    const at = ['BODY OF S10', 'RAIL BLOCK THIRTY', 'RAIL BLOCK NINETY', 'SURVIVING BULLET'].map(
      (needle) => html.indexOf(needle),
    )
    expect(at, 'body, rail blocks and the surviving bullet must all render').not.toContain(-1)
    expect(at).toEqual([...at].sort((a, b) => a - b))
  })

  it('leaves s10 on SectionContent when the phase rail is absent, never an empty frame', () => {
    // VISUALS pins s10.phaseRail to null. The `&& visuals.s10.phaseRail` guard must then fall
    // through to the ordinary body renderer rather than render a railless wrapper.
    const html = renderToStaticMarkup(
      createElement(ReportSections, { visuals: VISUALS, band: BAND, sections: [fallbackSection('s10', 'Roadmap')] }),
    )
    expect(html).toContain(`<p class="${BODY_CLASS}">body of s10</p>`)
    expect(html).toContain(`<ul class="${LIST_CLASS}">`)
    expect(html).toContain('<li>bullet a s10</li>')
    expect(html).not.toContain(RAIL_TEXT_CLASS)
  })

  it('renders the confidence meter for the appendix id only, exactly once', () => {
    // Guards the id correction directly: the MODEL key is visuals.s13, but the runtime
    // SectionId is 'appendix'. A `case 's13'` in SectionVisualsBelow renders 0 of these.
    const appendix = renderToStaticMarkup(
      createElement(ReportSections, { visuals: VISUALS, band: BAND, sections: [fallbackSection('appendix', 'Methodology')] }),
    )
    expect(countOf(appendix, CONFIDENCE_HEAD)).toBe(1)
    const others = renderToStaticMarkup(
      createElement(ReportSections, {
        visuals: VISUALS,
        band: BAND,
        sections: ['s1', 's10', 's11', 's12'].map((id) => fallbackSection(id, `Title ${id}`)),
      }),
    )
    expect(countOf(others, CONFIDENCE_HEAD)).toBe(0)
  })
})
