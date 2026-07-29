// Source-reading tripwire (node env, no DOM): the public landing footer must expose the new public
// Methodology page under a "DOCUMENTATION" heading, as an INTERNAL link to /methodology labelled
// METHODOLOGY. Unlike the footer's external links, the internal one must NOT open a new tab
// (no target="_blank", no ↗ affordance). Scoped to the <footer> block so a stray /methodology
// reference elsewhere in app/page.tsx can't satisfy it; the exactly-once check on the href doubles
// as a non-vacuity + reverse guard against accidental removal. Comments are stripped so a prose
// mention can neither satisfy nor break the assertions.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SOURCE = fs.readFileSync(path.join(ROOT, 'app', 'page.tsx'), 'utf8')
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

const footerStart = CODE.indexOf('<footer')
const footer =
  footerStart === -1 ? '' : CODE.slice(footerStart, CODE.indexOf('</footer>', footerStart) + '</footer>'.length)

const methodologyLinkStart = footer.indexOf('href="/methodology"')
const methodologyLink =
  methodologyLinkStart === -1
    ? ''
    : footer.slice(methodologyLinkStart, footer.indexOf('</Link>', methodologyLinkStart) + '</Link>'.length)

describe('landing footer "Documentation → Methodology" link', () => {
  it('anchors on the footer block', () => {
    expect(footerStart, 'the landing footer must exist in app/page.tsx').not.toBe(-1)
  })

  it('groups the link under a DOCUMENTATION heading', () => {
    expect(footer, 'the footer must carry a DOCUMENTATION heading').toContain('DOCUMENTATION')
  })

  it('links to the public methodology page exactly once, labelled METHODOLOGY', () => {
    const occurrences = footer.split('href="/methodology"').length - 1
    expect(occurrences, 'the /methodology footer link must appear exactly once').toBe(1)
    expect(methodologyLink, 'the methodology link must be labelled METHODOLOGY').toContain(
      'METHODOLOGY',
    )
  })

  it('keeps the internal link in-tab (no new-tab affordances)', () => {
    expect(methodologyLink, 'an internal link must not open a new tab').not.toContain(
      'target="_blank"',
    )
    expect(methodologyLink, 'an internal link must not carry the external ↗ affordance').not.toContain(
      '↗',
    )
  })
})
