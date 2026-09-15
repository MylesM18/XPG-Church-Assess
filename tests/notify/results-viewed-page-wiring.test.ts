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

  it('reaches the database and Resend only through the store, the sender, and the orchestrator', () => {
    const args = balanced(PAGE, PAGE.indexOf(CALL), '(', ')')
    expect(PAGE).toContain("from '@/lib/notify/results-viewed-store'")
    expect(PAGE).toContain("from '@/lib/email/send-results-viewed'")
    expect(PAGE).toContain("from '@/lib/notify/results-viewed'")
    expect(PAGE).not.toContain('@/lib/data/results-viewed-email')
    // The service-role store authorizes nothing itself: the page's admin redirect (pinned above) must
    // come first, and the privileged client stays inside the store rather than being built here.
    expect(args).toContain('claim: () => claimResultsViewedEmail(churchId)')
    expect(args).toContain('mark: () => markResultsViewedEmailed(churchId)')
    expect(PAGE).not.toContain('createServiceRoleClient')
    // The run id keys the Resend idempotency key.
    expect(args).toMatch(/send:\s*\(summary\)\s*=>\s*sendResultsViewedEmail\(summary, run!\.id\)/)
    expect(PAGE.split('sendResultsViewedEmail(').length - 1).toBe(1)
    expect(PAGE).not.toContain("rpc('claim_results_viewed_email'")
    expect(PAGE).not.toContain("rpc('mark_results_viewed_emailed'")
  })
})

/** Every `.tsx` file under the given repo-relative directories, as repo-relative paths. */
function tsxFiles(dirs: string[]): string[] {
  return dirs.flatMap((dir) =>
    (fs.readdirSync(path.join(ROOT, dir), { recursive: true, encoding: 'utf8' }) as string[])
      .filter((file) => file.endsWith('.tsx'))
      .map((file) => path.join(dir, file)),
  )
}

/** Every `<Link …>` opening tag, scanned to its closing `>` at brace depth 0 (so `=>` inside a prop is safe). */
function linkTags(source: string): string[] {
  const tags: string[] = []
  const opener = /<Link[\s>]/g
  let match: RegExpExecArray | null
  while ((match = opener.exec(source)) !== null) {
    let depth = 0
    let end = match.index
    for (; end < source.length; end++) {
      const ch = source[end]
      if (ch === '{') depth++
      else if (ch === '}') depth--
      else if (ch === '>' && depth === 0) break
    }
    tags.push(source.slice(match.index, end + 1))
    opener.lastIndex = end + 1
  }
  return tags
}

describe('links to the report never prefetch it', () => {
  // A full prefetch (`prefetch={true}`) renders the report page on the server without anyone opening
  // it, which would claim and send the results-viewed email from a dashboard view. Next's default
  // prefetch for this dynamic route (no loading.tsx, no PPR) stops at the router state and never runs
  // the page. Raw source, not comment-stripped: stripping `//` would also cut URL strings and unbalance
  // the brace scan.
  it('no <Link> whose tag targets the diagnosis route carries a prefetch prop', () => {
    const reportLinks = tsxFiles(['app', 'components']).flatMap((file) =>
      linkTags(fs.readFileSync(path.join(ROOT, file), 'utf8'))
        .filter((tag) => tag.includes('/diagnosis'))
        .map((tag) => ({ file, tag })),
    )
    expect(reportLinks.length, "expected at least one <Link> to the report (the dashboard's View diagnosis)").toBeGreaterThan(0)
    for (const { file, tag } of reportLinks) {
      expect(tag, `${file}: a <Link> to the report must not set prefetch`).not.toMatch(/\bprefetch\b/)
    }
  })
})
