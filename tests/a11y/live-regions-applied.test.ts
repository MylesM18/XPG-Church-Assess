// Pins that every status message in the app goes through LiveStatus. SOURCE-READING test
// (node env, no DOM): it asserts on file structure, not rendered output.
//
// Why it exists: the old `{error && <p className="…">{error}</p>}` form renders identically to the
// LiveStatus form on screen. If someone reintroduces it, nothing looks wrong, no other test fails,
// and the announcement is silently lost for screen-reader users. This test is the tripwire for
// regressions across all ten sites at once.
//
// The companion tests/a11y/live-status-component.test.ts pins the component's own shape; this file
// pins its APPLICATION. Runtime node-identity — that the region element is never remounted — is
// proven separately in a real browser and cannot be checked here (no jsdom, and vitest.config.ts
// is off-limits).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SCAN_DIRS = [path.join(REPO_ROOT, 'app'), path.join(REPO_ROOT, 'components')]

/** Remove block and line comments so prose mentions of the old pattern are not scanned. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function tsxFilesUnder(dir: string): string[] {
  const found: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...tsxFilesUnder(full))
    else if (entry.isFile() && entry.name.endsWith('.tsx')) found.push(full)
  }
  return found
}

const FILES = SCAN_DIRS.flatMap(tsxFilesUnder).map((file) => ({
  path: path.relative(REPO_ROOT, file),
  source: stripComments(fs.readFileSync(file, 'utf8')),
}))

// The ten files that render a status message. All five success announcements land in files already
// on this list, so it is also the complete set of LiveStatus consumers.
const EXPECTED_CONSUMERS = [
  'components/answer-form.tsx',
  path.join('app', 'sign-in', 'page.tsx'),
  path.join('app', 'get-started', 'form.tsx'),
  path.join('app', 'app', '[churchId]', 'invite-panel.tsx'),
  path.join('app', 'app', '[churchId]', 'generate-button.tsx'),
  path.join('app', 'app', '[churchId]', 'access', 'invite-member-form.tsx'),
  path.join('app', 'app', '[churchId]', 'access', 'remove-member-button.tsx'),
  path.join('app', 'app', '[churchId]', 'access', 'revoke-invite-button.tsx'),
  path.join('app', 'accept', '[token]', 'accept-button.tsx'),
  path.join('app', 'app', '[churchId]', 'diagnosis', 'share-control.tsx'),
]

describe('live-region application', () => {
  it('finds enough files that the scan cannot pass vacuously', () => {
    expect(
      FILES.length,
      `expected at least 25 .tsx files under app/ and components/, found ${FILES.length} — the ` +
        'scan is probably not reaching the source tree, which would make every "zero occurrences" ' +
        'assertion below pass trivially',
    ).toBeGreaterThanOrEqual(25)
  })

  it('has no conditionally mounted status paragraphs left', () => {
    const offenders = FILES.filter((f) => /error\s*&&\s*<p/.test(f.source)).map((f) => f.path)
    expect(
      offenders,
      `conditionally mounted error paragraph in: ${offenders.join(', ')}. A live region inserted ` +
        'at the same moment as its first message is silently missed by screen readers. Use ' +
        '<LiveStatus tone="error" message={…} className="…" /> instead.',
    ).toEqual([])
  })

  it('routes every status message through LiveStatus', () => {
    const renderers = FILES.filter((f) => f.source.includes('<LiveStatus')).map((f) => f.path)
    const missing = EXPECTED_CONSUMERS.filter((c) => !renderers.includes(c))
    expect(
      missing,
      `expected these files to render <LiveStatus>: ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('imports LiveStatus wherever it is rendered', () => {
    const missingImport = FILES.filter(
      (f) => f.source.includes('<LiveStatus') && !f.source.includes("from '@/components/live-status'"),
    ).map((f) => f.path)
    expect(missingImport, `renders <LiveStatus> without importing it: ${missingImport.join(', ')}`).toEqual([])
  })

  it('keeps the two focus-move sites focusable', () => {
    const answerForm = FILES.find((f) => f.path === 'components/answer-form.tsx')!
    expect(
      answerForm.source,
      'answer-form must render its confirmation as a focusable <h1> — the form it replaces owns ' +
        'the page’s only <h1>, and the submit button unmounts with it',
    ).toMatch(/<h1 tabIndex=\{-1\}/)

    const signIn = FILES.find((f) => f.path === path.join('app', 'sign-in', 'page.tsx'))!
    expect(signIn.source, 'sign-in must keep a ref on the sent confirmation').toContain('ref={sentRef}')
  })
})
