// Pins the skip-link landmark invariant. This is a SOURCE-READING test (node env, no DOM):
// it asserts on file structure, not on rendered output or className strings.
//
// Why it exists: the `id="main-content" tabIndex={-1}` pair must live on each route's REAL <main>
// landmark, never on a wrapper in app/layout.tsx. A `<div id="main-content">{children}</div>`
// wrapper in the layout shipped once on this branch and was caught in review — it makes the skip
// link land on a generic div and duplicates the id wherever a route also has its own <main>.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const APP_DIR = path.join(REPO_ROOT, 'app')

/** Remove /* *​/ blocks and // line comments so prose mentions of `<main>` are not scanned. */
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

/**
 * Every `<main` opening tag in `source`, each returned as the whole slice from `<main` up to and
 * including its closing `>`. Whole-text (not per-line) so multi-line opening tags are handled —
 * app/not-found.tsx spreads its landmark attributes across four lines.
 */
function mainOpeningTags(source: string): string[] {
  const tags: string[] = []
  // Require whitespace, `>` or `/` after `<main` so `<mainsomething` is not matched.
  const pattern = /<main(?=[\s>/])/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    const close = source.indexOf('>', match.index)
    tags.push(source.slice(match.index, close === -1 ? source.length : close + 1))
  }
  return tags
}

const APP_TSX_FILES = tsxFilesUnder(APP_DIR)

type Landmark = { file: string; tag: string }

const LANDMARKS: Landmark[] = APP_TSX_FILES.flatMap((file) =>
  mainOpeningTags(stripComments(fs.readFileSync(file, 'utf8'))).map((tag) => ({
    file: path.relative(REPO_ROOT, file),
    tag,
  })),
)

describe('skip-link landmark invariant', () => {
  it('app/layout.tsx mentions main-content exactly once, as the skip link href', () => {
    const layout = fs.readFileSync(path.join(APP_DIR, 'layout.tsx'), 'utf8')
    const occurrences = layout.match(/main-content/g) ?? []
    expect(
      occurrences.length,
      'app/layout.tsx must reference main-content exactly once (the skip link href). A second ' +
        'occurrence means the id was put on a layout wrapper — put it on each route’s <main>.',
    ).toBe(1)
    expect(layout).toContain('href="#main-content"')
    expect(layout).not.toMatch(/id=["{]?["']?main-content/)
  })

  it('every <main> under app/ carries id="main-content" and tabIndex={-1}', () => {
    const missingId = LANDMARKS.filter((l) => !l.tag.includes('id="main-content"')).map((l) => l.file)
    const missingTabIndex = LANDMARKS.filter((l) => !l.tag.includes('tabIndex={-1}')).map((l) => l.file)

    expect(missingId, `<main> without id="main-content" in: ${missingId.join(', ')}`).toEqual([])
    expect(missingTabIndex, `<main> without tabIndex={-1} in: ${missingTabIndex.join(', ')}`).toEqual([])
  })

  it('finds enough landmarks that the scan cannot pass vacuously', () => {
    const files = new Set(LANDMARKS.map((l) => l.file))
    expect(
      LANDMARKS.length,
      `expected at least 15 <main> landmarks under app/, found ${LANDMARKS.length} — the scan is ` +
        'probably not reaching the route files',
    ).toBeGreaterThanOrEqual(15)
    expect(files.size, `expected landmarks in at least 10 files, found ${files.size}`).toBeGreaterThanOrEqual(10)
    expect(
      files.has(path.join('app', 'not-found.tsx')),
      'app/not-found.tsx must supply a <main id="main-content"> so the skip link resolves on ' +
        'unmatched URLs — do not delete it',
    ).toBe(true)
  })
})
