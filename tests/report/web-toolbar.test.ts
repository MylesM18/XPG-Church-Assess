import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ReportToolbar, ReportNotice } from '../../app/app/[churchId]/diagnosis/report/toolbar'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const INK_LINK = 'py-1.5 font-body text-sm text-ink underline underline-offset-4'

describe('ReportToolbar', () => {
  it('renders the caps runline on the left and its children as the actions', () => {
    const html = renderToStaticMarkup(
      createElement(ReportToolbar, null, createElement('a', { href: '/x.pdf' }, 'Download PDF')),
    )
    expect(html).toContain('XPG · CHURCH HEALTH ASSESSMENT')
    expect(html).toContain('text-[0.6875rem] font-bold uppercase tracking-[0.1em]')
    expect(html).toContain('border-b border-line pb-3')
    expect(html).toContain('>Download PDF</a>')
    expect(html.indexOf('XPG · CHURCH HEALTH ASSESSMENT')).toBeLessThan(html.indexOf('Download PDF'))
    expect(html).not.toMatch(/<h[1-6][\s>]/)
  })
})

describe('ReportNotice', () => {
  it('renders an ink-ruled box around its children without touching their copy', () => {
    const html = renderToStaticMarkup(
      createElement(ReportNotice, null, createElement('p', null, 'This report predates your latest settings change.')),
    )
    expect(html).toContain('border-l-4 border-ink')
    expect(html).toContain('bg-sand')
    expect(html).toContain('<p>This report predates your latest settings change.</p>')
  })
})

describe('ShareControl trigger restyle (source-read: client component, useActionState)', () => {
  it('both buttons use the ink text-link style Download PDF uses, not ink-soft', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'app', 'app', '[churchId]', 'diagnosis', 'share-control.tsx'),
      'utf8',
    )
    // Each button's opening tag carries `onClick={(e) => ...}` whose `=>` contains a `>`, so a
    // "slice to the next >" would stop short; capture each button's own className instead
    // (attribute order in the file: ref, type, aria-disabled, onClick, className).
    const classes = [...src.matchAll(/<button\b[\s\S]*?className="([^"]*)"/g)].map((m) => m[1] ?? '')
    expect(classes.length).toBe(2)
    for (const cls of classes) {
      expect(cls).toContain(INK_LINK)
      expect(cls).not.toContain('text-ink-soft')
    }
    // Copy and behaviour untouched.
    expect(src).toContain('Create share link')
    expect(src).toContain('Revoke share link')
    expect(src).toContain("'use client'")
  })
})
