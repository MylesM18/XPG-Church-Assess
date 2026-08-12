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
