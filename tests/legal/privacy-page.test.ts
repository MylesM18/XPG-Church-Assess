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

  // The OpenAI processor bullet must name BOTH payloads the code actually sends
  // (post-merge review of PR #79, finding 8): the computed report results that lib/ai/sections.ts
  // words into prose (scores, rankings, the church profile — and the church name via the s2 cover
  // slice), AND the written reflections that lib/ai/themes.ts clusters into themes — sent as
  // `indexed` text with respondent identity replaced by an opaque index and the respondent-label
  // list never sent (themes.ts:171-181, pinned by tests/outreach/ai-exclusion.test.ts). Until this
  // wording the page said only "already-computed report results", which omitted the second payload
  // entirely; PR #79 (key-present ⇒ on, auto-run on view) is what made that path live by default.
  describe('OpenAI processor bullet names both payloads', () => {
    const start = SOURCE.indexOf('<strong className="text-ink">OpenAI</strong>')
    const end = SOURCE.indexOf('</li>', start)
    const bullet = start === -1 || end === -1 ? '' : SOURCE.slice(start, end)

    it('finds the bullet (non-vacuity)', () => {
      expect(bullet).toContain('OpenAI&rsquo;s API')
    })

    it('names the computed results AND the written reflections, and says how reflections are de-identified', () => {
      // JSX text wraps across source lines; collapse whitespace so a reformat cannot false-fail.
      const text = bullet.replace(/\s+/g, ' ')
      expect(text).toContain('already-computed report results')
      expect(text).toContain('written reflections')
      expect(text).toContain('text only')
      expect(text).toContain('nothing that identifies who wrote them')
      expect(text).toContain('list of who answered is never sent')
      // Still grounded in the methodology page's promise.
      expect(text).toContain('AI never decides a score or verdict')
    })

    it('the "What we collect" answers item acknowledges written reflections, so the bullet does not name a category the page never listed', () => {
      const cStart = SOURCE.indexOf('<strong className="text-ink">Assessment answers.</strong>')
      const cEnd = SOURCE.indexOf('</li>', cStart)
      const item = cStart === -1 || cEnd === -1 ? '' : SOURCE.slice(cStart, cEnd)
      expect(item).toContain('1&ndash;10 ratings')
      expect(item).toMatch(/written reflections/)
    })
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
