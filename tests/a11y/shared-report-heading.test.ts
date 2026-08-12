// Pins that the public shared-report page carries exactly one top-level heading.
// SOURCE-READING test (node env, no DOM): it asserts on file structure, not rendered output —
// same approach as tests/a11y/main-landmark.test.ts, which this mirrors.
//
// Why it exists: app/r/[shareToken]/page.tsx is a public, unauthenticated page. Before Task 15's
// report-reform split, VerdictHeader rendered <h1>{name}</h1> here. The reworked VerdictHeader
// (app/app/[churchId]/diagnosis/report/cover.tsx) emits only <p> elements, so it is easy for this
// page to end up with a document outline that starts at <h2> and has no <h1> at all. Nothing else
// in this repo would catch that: tests/a11y/main-landmark.test.ts only asserts on <main> opening
// tags, never on headings.
//
// Since plan 4's web swap, this page's single <h1> comes from <ReportSections> — specifically the
// first of its 13 sections (app/app/[churchId]/diagnosis/report/sections.tsx), rendered as an
// unconditional <h1> only for index 0. It lives in a DIFFERENT file, so a plain single-file grep
// of page.tsx alone cannot see it — it would read 0 forever after the swap, whether or not
// <ReportSections> is actually still there. So this test reads BOTH files and requires: page.tsx
// renders <ReportSections> (the only thing that makes counting sections.tsx's <h1> meaningful),
// and the two files' <h1> counts sum to exactly one — i.e. the page supplies no competing <h1> of
// its own.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SHARE_PAGE = path.join(REPO_ROOT, 'app', 'r', '[shareToken]', 'page.tsx')
const SECTIONS = path.join(REPO_ROOT, 'app', 'app', '[churchId]', 'diagnosis', 'report', 'sections.tsx')

/** Remove /* *​/ blocks and // line comments so prose mentions of `<h1` are not scanned. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

// Require whitespace, `>` or `/` after `<h1` so `<h1x` is not matched (mirrors
// main-landmark.test.ts's identical guard on `<main`).
function h1Count(source: string): number {
  return (source.match(/<h1(?=[\s>/])/g) ?? []).length
}

describe('shared report page heading invariant', () => {
  it('renders <ReportSections>, and carries exactly one <h1> once ReportSections is counted', () => {
    const pageSource = stripComments(fs.readFileSync(SHARE_PAGE, 'utf8'))
    const sectionsSource = stripComments(fs.readFileSync(SECTIONS, 'utf8'))

    expect(
      pageSource,
      'app/r/[shareToken]/page.tsx must render <ReportSections> — it supplies this page’s ' +
        'one true <h1> (the first report section’s title). Without it, the sum-based ' +
        'assertion below would pass vacuously off sections.tsx’s own <h1>.',
    ).toMatch(/<ReportSections[\s>]/)

    const pageH1s = h1Count(pageSource)
    const sectionH1s = h1Count(sectionsSource)
    expect(
      pageH1s + sectionH1s,
      `app/r/[shareToken]/page.tsx must carry exactly one <h1> — it is a public, ` +
        `unauthenticated page, so its document outline needs a top-level heading of its ` +
        `own. Found ${pageH1s} <h1> in page.tsx directly and ${sectionH1s} in the ` +
        `ReportSections it renders (expected 0 + 1).`,
    ).toBe(1)
  })
})
