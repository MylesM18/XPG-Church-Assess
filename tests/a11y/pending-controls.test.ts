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
// The e.preventDefault() branch allows a COMPOUND condition — the answer-form wizard's Submit/Next
// guards on `if (((isLastStep && pending) || !currentAnswered)) e.preventDefault()`, so its condition
// group is `[^\n]*?`, not a bare identifier, but stays anchored to `if (…) e.preventDefault()` so a
// conditionless preventDefault still never counts. The `return` branch DELIBERATELY stays a bare
// identifier (`\w+`): widening it too would collaterally match unrelated early-returns such as
// `if (!state.link) return null`, backfilling a spare guard token — the exact
// masking failure this file's design already guards against.
const GUARD = /if \([^\n]*?\) e\.preventDefault\(\)|if \(\w+\) return\b/

// A control disabled by a NAVIGATION BOUNDARY (the wizard's Back at `step === 0`) has no async
// window, so it needs no pending-guard — exclude it from the per-file guard requirement below. This
// is the only such control in the tree; adding another means listing it here.
const BOUNDARY = /aria-disabled=\{step === 0\}/

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
      controls: countOf(f.source, ARIA_DISABLED) - countOf(f.source, BOUNDARY),
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

  // Baseline dropped from 12 to 10 when the invite -> Viewer whole-assessment redesign's Task 5
  // deleted the anonymous per-category invite surface. Both dropped bindings lived in
  // category-invite.tsx, which defined two pending controls — aria-disabled={rePending} and
  // aria-disabled={newPending}, both driven by useActionState(createInvitation) in that same file.
  // respond-form.tsx was deleted in the same task but carried no aria-disabled binding, so it
  // contributed nothing. Verified: the entire 12 -> 10 drop is category-invite.tsx's two controls.
  // Bumped from 10 to 11 when Task A3 (dashboard + invite relocation) added the Resend control in
  // app/app/[churchId]/access/resend-invite-button.tsx — aria-disabled={pending} with a matching
  // e.preventDefault() guard, driven by useActionState(resendInvitation). See §2 of
  // docs/superpowers/plans/2026-07-20-m6d-i3-pending-focus.md.
  // Bumped from 11 to 12 when the assessment-deadlines feature added the admin
  // "Extend 3 days" roster control in app/app/[churchId]/access/extend-deadline-button.tsx —
  // aria-disabled={pending} with a matching e.preventDefault() guard, driven by
  // useActionState(extendMemberDeadline). (The §2 note in
  // docs/superpowers/plans/2026-07-20-m6d-i3-pending-focus.md is a deferred PR follow-up.)
  // Bumped from 12 to 13 when the final-report-redesign foundations plan (Task 7) added the
  // church-settings "Save settings" control in
  // app/app/[churchId]/settings/settings-form.tsx — aria-disabled={pending} with a matching
  // e.preventDefault() guard, driven by useActionState(updateChurchSettings).
  // Bumped from 13 to 15 when the close-assessment feature (ADR 0003) added the admin Close and
  // Reopen controls in app/app/[churchId]/close-reopen-controls.tsx — two aria-disabled={pending}
  // bindings, each with a matching `if (pending) return` guard, driven by useTransition +
  // closeAssessment/reopenAssessment. Note this census counts SOURCE bindings, not simultaneously
  // rendered controls: that component renders exactly one of the two buttons per run state, so the
  // number of controls a user can actually reach grew by one, not two.
  it('covers all fifteen known pending controls', () => {
    const count = FILES.reduce(
      (n, f) => n + (f.source.match(new RegExp(ARIA_DISABLED, 'g'))?.length ?? 0),
      0,
    )
    expect(
      count,
      'expected exactly 15 `aria-disabled={…}` bindings across app/ and components/ — one per ' +
        'control in the spec’s scope table. A LOWER count means a site was missed or reverted. A ' +
        'HIGHER count is not a defect: a new pending control was added, which is fine — add it to ' +
        '§2 of the design doc and bump this number. The answer-form wizard contributes two: the ' +
        'Submit/Next control and the Back navigation boundary (aria-disabled={step === 0}).',
    ).toBe(15)
  })
})
