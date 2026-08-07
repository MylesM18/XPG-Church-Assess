// Source-reading tripwire (node env, no DOM): the PUBLIC /privacy page must keep the factual
// promises that were grounded in the codebase audit — the short-version summary card, the
// never-sell and no-tracking commitments, the Do Not Track stance, the religious-information
// note, the children's section, the contact address, and the cross-link to /terms. The
// attorney-review draft-status note was later removed on owner instruction. We read the RAW
// source so the assertions pin what actually ships. If a promise is reworded away, this test
// forces the change to be deliberate.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SOURCE = fs.readFileSync(path.join(ROOT, 'app', 'privacy', 'page.tsx'), 'utf8')

describe('public privacy page — content', () => {
  it.each([
    'The short version',
    'never sell personal information',
    'do not sell personal information',
    'Cookies, tracking, and Do Not Track',
    'A note on religious information',
    'Children',
    'Last updated: August 7, 2026',
    'info@xpgathering.com',
    '501(c)(3) nonprofit',
  ])('carries the "%s" content', (needle) => {
    expect(SOURCE).toContain(needle)
  })

  it('cross-links to the terms of service', () => {
    expect(SOURCE).toContain('href="/terms"')
  })

  it('offers a back-to-home link', () => {
    expect(SOURCE).toContain('href="/"')
  })

  it('declares page metadata', () => {
    expect(SOURCE).toContain('export const metadata')
  })

  // Reversal of an earlier requirement: the attorney-review "Draft status:" block was removed
  // on owner instruction — a public policy page should not advertise itself as a draft. Asserted
  // as an ABSENCE so the block cannot drift back in unnoticed; a presence check would have
  // survived the removal silently, which is exactly how this went stale the first time.
  it('does not ship the attorney-review draft-status note', () => {
    expect(SOURCE).not.toContain('Draft status:')
    expect(SOURCE).not.toContain('licensed attorney')
  })
})
