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
    const html = renderToStaticMarkup(createElement(ReportSections, { sections }))
    const order = ['Overview', 'Executive summary', 'How to read this'].map((t) => html.indexOf(t))
    expect(order).toEqual([...order].sort((a, b) => a - b))
    // Collect and compare the whole set — an assertion inside a loop reports only the
    // FIRST failure.
    const missing = sections.filter((s) => !html.includes(s.fallback.title))
    expect(missing.map((s) => s.id)).toEqual([])
  })

  it('takes every heading from fallback.title', () => {
    const html = renderToStaticMarkup(createElement(ReportSections, { sections }))
    expect(html).toContain('>Overview<')
    expect(html).toContain('>Executive summary<')
  })

  it('renders exactly one <h1>, on the first section only', () => {
    const html = renderToStaticMarkup(createElement(ReportSections, { sections }))
    expect((html.match(/<h1[\s>]/g) ?? []).length).toBe(1)
    expect(html.indexOf('<h1')).toBeLessThan(html.indexOf('<h2'))
    expect((html.match(/<h2[\s>]/g) ?? []).length).toBe(2)
  })

  it('renders a fallback section through SectionBodyView', () => {
    const html = renderToStaticMarkup(
      createElement(ReportSections, { sections: [fallbackSection('s1', 'Overview')] }),
    )
    expect(html).toContain('body of s1')
    expect(html).toContain('bullet a s1')
  })

  it('renders an empty section list without throwing', () => {
    expect(renderToStaticMarkup(createElement(ReportSections, { sections: [] }))).toBe('')
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
        createElement(ReportSections, { sections: [aiSection(id, `Title ${id}`, ai)] }),
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
        createElement(ReportSections, { sections: [aiSection(id, `Title ${id}`, VALID_AI[id])] }),
      )
      for (const needle of needles) if (!html.includes(needle)) missing.push(`${id}:${needle}`)
    }
    expect(missing).toEqual([])
  })

  it('renders the six s6 beats in order: affirm, pivot, evidence, not_statement, reframe, trajectory', () => {
    const html = renderToStaticMarkup(
      createElement(ReportSections, { sections: [aiSection('s6', 'Areas', VALID_AI.s6)] }),
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
        sections: [aiSection('s7', 'Lowest', { narrative: 'only narrative', pattern_claim: null })],
      }),
    )
    expect(html).toContain('only narrative')
    expect(html).not.toContain('FALLBACK BODY s7')
  })

  it('falls back to SectionBodyView when an AI payload fails its schema, and never throws', () => {
    const broken = Object.keys(VALID_AI).filter((id) => {
      const html = renderToStaticMarkup(
        createElement(ReportSections, { sections: [aiSection(id, `Title ${id}`, { nonsense: true })] }),
      )
      return !html.includes(`FALLBACK BODY ${id}`)
    })
    expect(broken).toEqual([])
  })

  it('falls back when ai is null on a source:ai section', () => {
    const html = renderToStaticMarkup(
      createElement(ReportSections, { sections: [aiSection('s2', 'Executive summary', null)] }),
    )
    expect(html).toContain('FALLBACK BODY s2')
  })

  it('still takes the heading from fallback.title on an AI section', () => {
    const html = renderToStaticMarkup(
      createElement(ReportSections, { sections: [aiSection('s2', 'Executive summary', VALID_AI.s2)] }),
    )
    expect(html).toContain('Executive summary')
  })

  it('uses SectionBodyView for a non-AI section id even when source is ai', () => {
    // s1/s3/s8/s10/s11/appendix have no AI renderer — they must not throw.
    const html = renderToStaticMarkup(
      createElement(ReportSections, { sections: [aiSection('s8', 'What leaders are saying', VALID_AI.s2)] }),
    )
    expect(html).toContain('FALLBACK BODY s8')
  })
})
