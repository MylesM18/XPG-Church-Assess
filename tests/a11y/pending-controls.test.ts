// Pins that no control disables itself with the native `disabled` attribute during an async action.
// SOURCE-READING test (node env, no DOM): it asserts on file text, not rendered output.
//
// Why it exists: `disabled` on a FOCUSED control drops keyboard focus to <body> the moment it is
// applied, and the user stays stranded there for the whole network round-trip — they cannot Tab
// from where they were, and a screen reader reading from <body> has lost its place. Measured:
//
//   before-click              -> BUTTON:Create share link
//   during-pending (disabled) -> BODY          <-- lost here
//   during-pending (aria-disabled) -> BUTTON:Creating…   <-- retained
//
// This deliberately DEVIATES from React's documented `disabled={isPending}` idiom, so the reasoning
// has to live here or someone will restore it in good faith. React's docs lean on `disabled` for
// double-submit protection. Measured against a real useActionState form action counting
// invocations, it provides none that the guard does not:
//
//   three synchronous clicks:  disabled -> 3 invocations | aria-disabled + guard -> 3 invocations
//   click after pending commits: disabled -> blocked     | aria-disabled + guard -> blocked
//
// Identical in both directions. React's claim holds only once the re-render commits; the unguarded
// window exists either way. The deviation costs nothing, so this test protects a real improvement.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SCAN_DIRS = [path.join(REPO_ROOT, 'app'), path.join(REPO_ROOT, 'components')]

/** Remove block and line comments so prose mentioning these attributes is not scanned. */
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

// `disabled={` is a SUBSTRING of `aria-disabled={`, so a naive match would flag every fixed site.
// The lookbehind is what makes this assertion mean "bare native disabled binding".
const BARE_DISABLED = /(?<!aria-)disabled=\{/
const ARIA_DISABLED = /aria-disabled=\{/
// Shape A guards with e.preventDefault(); shape B guards with an early return inside the handler it
// already had. Both must be CONDITIONAL — an `if (<condition>) …` — that is what distinguishes a
// guard from ordinary application code. Matching a bare `e.preventDefault()` was tried and is wrong:
// answer-form.tsx's own handleSubmit contains one for unrelated reasons, which gave that file a
// spare guard token and let a good-faith deletion of the button's guard pass unnoticed.
// The condition may be COMPOUND: the answer-form wizard's Submit/Next guards on
// `if (((isLastStep && pending) || !currentAnswered)) e.preventDefault()`, so the condition group is
// `[^\n]*?` rather than a bare identifier — still anchored to `if (…)`, so a conditionless
// preventDefault still never counts. Widening only ADDS matches, so no file's guard count can drop.
const GUARD = /if \([^\n]*?\) (?:e\.preventDefault\(\)|return\b)/

describe('pending controls', () => {
  it('scans enough files that the assertions below cannot pass vacuously', () => {
    expect(
      FILES.length,
      `expected at least 25 .tsx files under app/ and components/, found ${FILES.length} — the ` +
        'scan is probably not reaching the source tree, which would make every "zero occurrences" ' +
        'assertion below pass trivially',
    ).toBeGreaterThanOrEqual(25)
  })

  it('has no control disabling itself with the native attribute', () => {
    const offenders = FILES.filter((f) => BARE_DISABLED.test(f.source)).map((f) => f.path)
    expect(
      offenders,
      `native \`disabled={…}\` binding in: ${offenders.join(', ')}. Applying \`disabled\` to a ` +
        'FOCUSED control drops focus to <body> for the whole action. Use `aria-disabled={…}` plus ' +
        'a guard — see this file’s header for the measurement showing the guard is exactly as ' +
        'strong as native disabled.',
    ).toEqual([])
  })

  it('keeps every site that guards its pending state', () => {
    const countOf = (source: string, re: RegExp) =>
      (source.match(new RegExp(re, 'g')) ?? []).length

    const underGuarded = FILES.map((f) => ({
      path: f.path,
      controls: countOf(f.source, ARIA_DISABLED),
      guards: countOf(f.source, GUARD),
    }))
      .filter((f) => f.controls > f.guards)
      .map((f) => `${f.path} (${f.controls} controls, ${f.guards} guards)`)

    expect(
      underGuarded,
      `fewer guards than pending controls in: ${underGuarded.join(', ')}. Native \`disabled\` was ` +
        'preventing a second activation; dropping it without a guard loses that. Counting per file ' +
        'rather than merely checking presence is deliberate — share-control.tsx has TWO controls, ' +
        'and a presence check stays green when only one of them loses its guard. Add ' +
        '`onClick={(e) => { if (<pending>) e.preventDefault() }}` for a submit button, or an early ' +
        '`if (<pending>) return` inside an existing onClick handler.',
    ).toEqual([])
  })

  it('covers all twelve known pending controls', () => {
    const count = FILES.reduce(
      (n, f) => n + (f.source.match(new RegExp(ARIA_DISABLED, 'g'))?.length ?? 0),
      0,
    )
    expect(
      count,
      'expected exactly 12 `aria-disabled={…}` bindings across app/ and components/ — one per ' +
        'control in the spec’s scope table. A LOWER count means a site was missed or reverted. A ' +
        'HIGHER count is not a defect: a new pending control was added, which is fine — add it to ' +
        '§2 of the design doc and bump this number. The answer-form wizard contributes two: the ' +
        'Submit/Next control and the Back navigation boundary (aria-disabled={step === 0}).',
    ).toBe(12)
  })
})
