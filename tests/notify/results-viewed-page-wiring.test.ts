// Source-reading tripwire (node env, no DOM; the Server Component cannot be rendered in vitest). Pins
// where the diagnosis page sends the results-viewed email: once, after the admin redirect, inside the
// scoreable branch (so only a rendered report counts) after the sections are resolved, through the
// orchestrator that never rejects, with the summary built lazily inside that orchestrator's guard.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
/** Strip comments so a doc comment mentioning these names cannot satisfy or break a match. */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const PAGE = strip(
  fs.readFileSync(path.join(ROOT, 'app', 'app', '[churchId]', 'diagnosis', 'page.tsx'), 'utf8'),
)

const CALL = 'await notifyResultsViewed('

/** The balanced text between `open` and its matching `close`, starting at the first `open` at/after `from`. */
function balanced(source: string, from: number, open: string, close: string): string {
  const start = source.indexOf(open, from)
  expect(start, `expected ${open} after index ${from}`).toBeGreaterThan(-1)
  let depth = 0
  for (let i = start; i < source.length; i++) {
    if (source[i] === open) depth++
    else if (source[i] === close) {
      depth--
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  throw new Error(`unbalanced ${open}${close} after index ${from}`)
}

describe('diagnosis page: results-viewed email wiring', () => {
  it('calls the orchestrator exactly once', () => {
    expect(PAGE.split(CALL).length - 1).toBe(1)
  })

  it('calls it after the admin redirect', () => {
    const redirectAt = PAGE.indexOf('if (!isAdmin) redirect(')
    expect(redirectAt).toBeGreaterThan(-1)
    expect(PAGE.indexOf(CALL)).toBeGreaterThan(redirectAt)
  })

  it('calls it inside the scoreable branch, after the report sections are resolved', () => {
    const header = PAGE.indexOf('if (resolution.scoreable) {')
    expect(header).toBeGreaterThan(-1)
    const block = balanced(PAGE, header, '{', '}')
    expect(block).toContain(CALL)
    expect(block).toContain('resolveReportSections(')
    expect(block.indexOf('resolveReportSections(')).toBeLessThan(block.indexOf(CALL))
  })

  it('passes the admin flag and the run status, and builds the summary lazily from the rendered report', () => {
    const args = balanced(PAGE, PAGE.indexOf(CALL), '(', ')')
    expect(args).toContain('viewerIsAdmin: isAdmin')
    expect(args).toContain('runStatus: run!.status')
    expect(args).toMatch(/buildSummary:\s*\(\)\s*=>\s*resultsViewedSummary\(/)
    expect(args).toContain('churchName: church.name')
    expect(args).toContain('cover: resolved.cover')
    expect(args).toContain('areaScores: resolution.diagnosis.categories')
    expect(args).toContain('areaNames: reportMethodology.questions.categories')
  })

  it('reaches the database and Resend only through the seam, the sender, and the orchestrator', () => {
    const args = balanced(PAGE, PAGE.indexOf(CALL), '(', ')')
    expect(PAGE).toContain("from '@/lib/data/results-viewed-email'")
    expect(PAGE).toContain("from '@/lib/email/send-results-viewed'")
    expect(PAGE).toContain("from '@/lib/notify/results-viewed'")
    expect(args).toContain('claim: () => claimResultsViewedEmail(supabase, churchId)')
    expect(args).toContain('send: sendResultsViewedEmail')
    expect(args).toContain('mark: () => markResultsViewedEmailed(supabase, churchId)')
    expect(PAGE).not.toContain("rpc('claim_results_viewed_email'")
    expect(PAGE).not.toContain("rpc('mark_results_viewed_emailed'")
    expect(PAGE).not.toContain('sendResultsViewedEmail(')
  })
})
