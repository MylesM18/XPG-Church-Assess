// `.ts` not `.tsx` (vitest include is tests/**/*.test.ts) — JSX as createElement, as in
// tests/dashboard/close-reopen-controls.test.ts. react-dom/server renders a 'use client' component
// with useState/useTransition fine (initial state; no interaction). The server-action module is
// mocked so no next/headers import is reached.
//
// ADR 0003 follow-up: once a run has been REOPENED (status back to 'in_progress') and a diagnosis
// already exists, the dashboard swaps "View diagnosis" for a "Regenerate diagnosis" button that
// re-runs the SAME generateDiagnosis action. It is enabled only when every invited member has
// finished (finishedMemberCount: finished === total); otherwise it renders aria-disabled with an
// inline N-of-M note and never reaches the action.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/app/app/[churchId]/actions', () => ({
  generateDiagnosis: vi.fn(),
}))

import { RegenerateDiagnosisButton } from '@/app/app/[churchId]/regenerate-diagnosis-button'
import { regenerateBlockedText } from '@/lib/runs/close-reopen'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SOURCE = fs.readFileSync(
  path.join(ROOT, 'app', 'app', '[churchId]', 'regenerate-diagnosis-button.tsx'),
  'utf8',
)
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

const render = (props: Parameters<typeof RegenerateDiagnosisButton>[0]) =>
  renderToStaticMarkup(createElement(RegenerateDiagnosisButton, props))

describe('regenerateBlockedText', () => {
  it('is the N-of-M note, verbatim', () => {
    expect(regenerateBlockedText(3, 8)).toBe(
      '3 of 8 members have finished — regenerate once everyone is done',
    )
  })
})

describe('RegenerateDiagnosisButton — everyone finished', () => {
  const html = render({ churchId: 'c1', finished: 8, total: 8 })
  it('renders an ENABLED "Regenerate diagnosis" button with no blocked note', () => {
    expect(html).toMatch(/<button[^>]*type="button"[^>]*aria-disabled="false"[^>]*>Regenerate diagnosis<\/button>/)
    expect(html).not.toContain('members have finished')
    expect(html).not.toContain('Regenerating…')
  })
  it('always mounts the LiveStatus region (sr-only when empty)', () => {
    expect(html).toMatch(/<p role="alert" class="sr-only"><\/p>/)
  })
})

describe('RegenerateDiagnosisButton — not everyone finished', () => {
  it('renders aria-disabled with the inline N-of-M note bound to the button', () => {
    const html = render({ churchId: 'c1', finished: 3, total: 8 })
    // scoped to the carrying element, not "somewhere in the markup"
    const m = html.match(/<button[^>]*type="button"[^>]*aria-disabled="true"[^>]*>([\s\S]*?)<\/button>/)
    expect(m, 'an aria-disabled button must exist').not.toBeNull()
    expect(m![1]).toContain('Regenerate diagnosis')
    expect(m![1]).toContain('3 of 8 members have finished — regenerate once everyone is done')
  })
  it('treats an empty roster (0 of 0) as NOT ready — a vacuous everyone-finished must not enable it', () => {
    const html = render({ churchId: 'c1', finished: 0, total: 0 })
    expect(html).toMatch(/aria-disabled="true"/)
    expect(html).toContain('0 of 0 members have finished')
  })
})

describe('RegenerateDiagnosisButton — action wiring (source-read; clicks are not reachable in SSR)', () => {
  it('re-runs the SAME generateDiagnosis server action the Generate button uses, inside a transition', () => {
    expect(CODE).toContain("import { generateDiagnosis } from './actions'")
    expect(CODE.match(/generateDiagnosis\(churchId\)/g)?.length).toBe(1)
    expect(CODE).toContain('startTransition(')
  })
  it('guards the click on pending AND on readiness, each as its own early return, before the action', () => {
    // pending-controls census (tests/a11y/pending-controls.test.ts) recognises `if (<word>) return`
    // guards; the readiness guard is a SEPARATE statement so both are counted and both hold.
    const pendingGuard = CODE.indexOf('if (pending) return')
    const readyGuard = CODE.indexOf('if (!ready) return')
    expect(pendingGuard).toBeGreaterThan(-1)
    expect(readyGuard).toBeGreaterThan(-1)
    expect(pendingGuard).toBeLessThan(CODE.indexOf('generateDiagnosis(churchId)'))
    expect(readyGuard).toBeLessThan(CODE.indexOf('generateDiagnosis(churchId)'))
    // never native `disabled` — a11y pending-controls contract
    expect(CODE).not.toMatch(/(?<!aria-)disabled=\{/)
    expect(CODE).toContain('aria-disabled={pending || !ready}')
  })
  it('surfaces the action error through LiveStatus, imported from the shared primitive', () => {
    expect(CODE).toContain("from '@/components/live-status'")
    expect(CODE).toContain('<LiveStatus message={error} tone="error"')
  })
  it('reads the blocked note from the shared close-reopen copy source, not an inline string', () => {
    expect(CODE).toContain("import { regenerateBlockedText } from '@/lib/runs/close-reopen'")
    expect(CODE).toContain('regenerateBlockedText(finished, total)')
    expect(CODE).not.toContain('regenerate once everyone is done')
  })
})
