// Source-reading tripwire (node env, no DOM): the public landing footer must expose the two new
// public legal pages under the existing "DOCUMENTATION" heading, as INTERNAL links to /terms
// labelled TERMS OF SERVICE and /privacy labelled PRIVACY POLICY. Unlike the footer's external
// links, internal ones must NOT open a new tab (no target="_blank", no ↗ affordance). Scoped to
// the <footer> block so a stray /terms or /privacy reference elsewhere in app/page.tsx can't
// satisfy it; the exactly-once check on each href doubles as a non-vacuity + reverse guard
// against accidental removal or duplication. Comments are stripped so a prose mention can
// neither satisfy nor break the assertions.
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

function linkBlock(href: string): string {
  const start = footer.indexOf(`href="${href}"`)
  return start === -1 ? '' : footer.slice(start, footer.indexOf('</Link>', start) + '</Link>'.length)
}

const termsLink = linkBlock('/terms')
const privacyLink = linkBlock('/privacy')

describe('landing footer "Documentation → Terms / Privacy" links', () => {
  it('anchors on the footer block', () => {
    expect(footerStart, 'the landing footer must exist in app/page.tsx').not.toBe(-1)
  })

  it('keeps the links under the DOCUMENTATION heading', () => {
    expect(footer, 'the footer must carry a DOCUMENTATION heading').toContain('DOCUMENTATION')
  })

  it('links to the public terms page exactly once, labelled TERMS OF SERVICE', () => {
    const occurrences = footer.split('href="/terms"').length - 1
    expect(occurrences, 'the /terms footer link must appear exactly once').toBe(1)
    expect(termsLink, 'the terms link must be labelled TERMS OF SERVICE').toContain(
      'TERMS OF SERVICE',
    )
  })

  it('links to the public privacy page exactly once, labelled PRIVACY POLICY', () => {
    const occurrences = footer.split('href="/privacy"').length - 1
    expect(occurrences, 'the /privacy footer link must appear exactly once').toBe(1)
    expect(privacyLink, 'the privacy link must be labelled PRIVACY POLICY').toContain(
      'PRIVACY POLICY',
    )
  })

  it('keeps both internal links in-tab (no new-tab affordances)', () => {
    for (const link of [termsLink, privacyLink]) {
      expect(link, 'an internal link must not open a new tab').not.toContain('target="_blank"')
      expect(link, 'an internal link must not carry the external ↗ affordance').not.toContain('↗')
    }
  })
})
