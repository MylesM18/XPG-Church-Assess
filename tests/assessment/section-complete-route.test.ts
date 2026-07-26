// Source-reading tripwire (node env, no DOM): the new "section complete" interstitial route exists,
// mirrors the /done + answer guards, delegates branch logic to the pure sectionCompleteNav helper,
// and renders the two approved buttons to the right hrefs. All invisible in a static render → the
// tripwire. Straight apostrophe in the heading matches the JSX.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const ROUTE = path.join(
  ROOT, 'app', 'app', '[churchId]', 'answer', '[categoryId]', 'complete', 'page.tsx',
)
const routeExists = fs.existsSync(ROUTE)
const route = routeExists ? stripComments(fs.readFileSync(ROUTE, 'utf8')) : ''

describe('section-complete interstitial route', () => {
  it('adds the interstitial server page', () => {
    expect(
      routeExists,
      'app/app/[churchId]/answer/[categoryId]/complete/page.tsx must exist',
    ).toBe(true)
  })

  it('delegates branch logic to the unit-tested pure helper', () => {
    expect(route, 'must call sectionCompleteNav(...)').toContain('sectionCompleteNav(')
    expect(route).toContain("from '@/lib/coverage/section-complete'")
  })

  it('mirrors the /done + answer guards', () => {
    expect(route, 'membership gate (matches /done)').toContain("from('church_members')")
    expect(route, 'own coverage via the security-definer RPC').toContain('get_member_run_coverage')
    expect(route, 'classifies coverage via the shared helper').toContain('coverage(rows, categories)')
    expect(route, 'validates categoryId against the methodology').toContain('loadMethodology()')
    expect(route, 'unauth deep-link → sign-in with next').toContain('/sign-in?next=')
  })

  it('acts on each redirecting helper branch', () => {
    expect(route, 'finish-section → back to the just-completed section').toContain(
      'redirect(`/app/${churchId}/answer/${nav.targetId}`)',
    )
    expect(route, 'done → hand off to the /done guard').toContain('redirect(`/app/${churchId}/done`)')
  })

  it('renders the two approved buttons to the right hrefs and section names', () => {
    expect(route, 'Go back → the just-completed section').toContain('/app/${churchId}/answer/${categoryId}`}')
    expect(route, 'Continue → the next unfinished section').toContain('/app/${churchId}/answer/${nav.nextId}`}')
    expect(route).toContain('Go back')
    expect(route).toContain('Continue')
    expect(route, 'names the completed section from the helper').toContain('nav.completedName')
    expect(route, 'names the next section from the helper').toContain('nav.nextName')
  })
})
