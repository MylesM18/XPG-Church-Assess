// `.ts` not `.tsx` (vitest include is tests/**/*.test.ts) — JSX as createElement, as in
// tests/report/web-toolbar.test.ts. react-dom/server renders a 'use client' component with
// useState/useTransition fine (initial state; no interaction). The server-action module is mocked
// so no next/headers import is reached.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/app/app/[churchId]/run-actions', () => ({
  closeAssessment: vi.fn(),
  reopenAssessment: vi.fn(),
}))

import { CloseReopenControls } from '@/app/app/[churchId]/close-reopen-controls'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SOURCE = fs.readFileSync(path.join(ROOT, 'app', 'app', '[churchId]', 'close-reopen-controls.tsx'), 'utf8')
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

const render = (props: Parameters<typeof CloseReopenControls>[0]) =>
  renderToStaticMarkup(createElement(CloseReopenControls, props))

const OPEN = { churchId: 'c1', status: 'in_progress' as const, closedAt: null, finished: 3, total: 8 }
const CLOSED = { churchId: 'c1', status: 'complete' as const, closedAt: '2026-08-18T14:03:00.000Z', finished: 8, total: 8 }

describe('CloseReopenControls — open run', () => {
  const html = render(OPEN)
  it('renders the Close button and nothing from the closed state', () => {
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Close assessment<\/button>/)
    expect(html).not.toContain('Reopen assessment')
    expect(html).not.toContain('Assessment closed')
  })
  it('always mounts the LiveStatus region (sr-only when empty)', () => {
    expect(html).toMatch(/<p role="alert" class="sr-only"><\/p>/)
  })
})

describe('CloseReopenControls — closed run', () => {
  it('renders the dated closed line in its own <p> plus the Reopen button, and no Close button', () => {
    const html = render(CLOSED)
    // scoped to the carrying element, not "somewhere in the markup"
    expect(html).toMatch(/<p class="font-body text-sm text-ink-soft">Assessment closed on August 18, 2026<\/p>/)
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Reopen assessment<\/button>/)
    expect(html).not.toMatch(/>Close assessment</)
  })
  it('falls back to the dateless line for an old-path run (closed_at null)', () => {
    const html = render({ ...CLOSED, closedAt: null })
    expect(html).toMatch(/<p class="font-body text-sm text-ink-soft">Assessment closed<\/p>/)
    expect(html).not.toContain('Assessment closed on')
    expect(html).toMatch(/>Reopen assessment</)
  })
})

describe('CloseReopenControls — confirm wiring (source-read; window.confirm is not reachable in SSR)', () => {
  it('confirms Close with the N-of-M spec text and Reopen with the reminder text — exactly once each', () => {
    expect(CODE.match(/window\.confirm\(closeConfirmText\(finished, total\)\)/g)?.length).toBe(1)
    expect(CODE.match(/window\.confirm\(REOPEN_CONFIRM_TEXT\)/g)?.length).toBe(1)
    expect(CODE.match(/window\.confirm\(/g)?.length).toBe(2)
  })
  it('routes the confirmed click into the matching server action inside a transition', () => {
    expect(CODE).toContain("import { closeAssessment, reopenAssessment } from './run-actions'")
    expect(CODE).toContain('startTransition(')
    expect(CODE.indexOf('window.confirm(closeConfirmText(finished, total))')).toBeLessThan(CODE.indexOf('run(closeAssessment)'))
    expect(CODE.indexOf('window.confirm(REOPEN_CONFIRM_TEXT)')).toBeLessThan(CODE.indexOf('run(reopenAssessment)'))
  })
  it('surfaces the action error through LiveStatus, imported from the shared primitive', () => {
    expect(CODE).toContain("from '@/components/live-status'")
    expect(CODE).toContain('<LiveStatus message={error} tone="error"')
  })
})
