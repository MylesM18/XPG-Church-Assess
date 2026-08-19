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
  path.join('components', 'answer-form.tsx'),
  path.join('components', 'auth', 'passwordless-entry.tsx'),
  path.join('app', 'get-started', 'form.tsx'),
  path.join('app', 'app', '[churchId]', 'generate-button.tsx'),
  path.join('app', 'app', '[churchId]', 'close-reopen-controls.tsx'),
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

  // --- Census hardening (Task 10) ------------------------------------------------------------
  //
  // A reviewer showed the two tests above are evadable: they only check for the literal lowercase
  // string `error` next to a literal `<p`, joined by a literal `&&` with no parenthesis in between.
  // None of that is what makes the old bug a bug — a live region silently missed on first mount is
  // just as broken when the guard is spelled `submitError`, `state.err`, or `notice`; when the
  // element is a `<div>` or `<span>` instead of a `<p>`; when the operator is a ternary instead of
  // `&&`; or when Prettier's own house style — `{cond && (\n  <Tag />\n)}` — puts a parenthesis and
  // a newline between the operator and the tag. That last form is not hypothetical: 16 legitimate
  // instances of the `{cond && (` convention exist in this tree today (e.g.
  // app/app/[churchId]/page.tsx, app/app/[churchId]/diagnosis/report/chain.tsx,
  // app/app/[churchId]/diagnosis/page.tsx, components/marketing/chain-viz.tsx), which is exactly
  // why the fix can't be "just widen the regex to allow whitespace" — it has to key on something
  // that is actually a status-message signal, not on punctuation.

  it('never mounts <LiveStatus> behind a conditional guard', () => {
    // LiveStatus's own contract (components/live-status.tsx) is that it is ALWAYS rendered — the
    // sr-only collapse when there's no message is what keeps the region registered. So there is no
    // legitimate reason for `<LiveStatus` to ever appear immediately after `&&` or `?`, with or
    // without a Prettier paren-wrap. This is the worst reintroduction of the bug: the identical
    // defect, wrapped around the very component that was supposed to make it inexpressible. Risk of
    // a false positive here is close to zero — nothing in this tree, and nothing that should ever
    // exist, needs LiveStatus behind a guard.
    const offenders = FILES.filter((f) => /(?:&&|\?)\s*\(?\s*<LiveStatus\b/.test(f.source)).map(
      (f) => f.path,
    )
    expect(
      offenders,
      `<LiveStatus> is conditionally mounted in: ${offenders.join(', ')}. LiveStatus must always be ` +
        'rendered — `cond && <LiveStatus …/>` or `cond ? <LiveStatus …/> : null` (parenthesised or ' +
        'not) reinserts the exact silent-miss bug this file exists to prevent.',
    ).toEqual([])
  })

  it('has no conditionally mounted status element under another name, tag, or role', () => {
    // Tripwire (a): the guarding identifier itself looks like a status message — error, err,
    // message, status, notice, warning, fail/failed, problem, alert, toast, banner — in any case
    // and as any suffix (submitError, state.err, formStatus, …), not just the literal lowercase
    // `error` the test above is keyed to. Requires the identifier to sit immediately against the
    // operator, exactly the shape of every evasion demonstrated (`identifier && <Tag>` /
    // `identifier ? <Tag> : null`), so it does not fire on unrelated compound conditions like
    // `isDownstream && stage.isDoNotWorkOn && (…)` elsewhere in this tree. <LiveStatus> is excluded
    // here — its own conditional mounting, under ANY guard name, is already asserted with a more
    // specific message by the test above — so this test's offender list is only ever about a
    // different element standing in for it.
    const namedStatusGuard =
      /[\w$.]*(?:err(?:or)?|message|status|notice|warning|fail(?:ed)?|problem|alert|toast|banner)\s*(?:&&|\?)\s*\(?\s*<(?!LiveStatus\b)[A-Za-z]/i

    // Tripwire (b): element-and-identifier-agnostic. Whatever guards it and whatever it's called,
    // an element that is only conditionally mounted has no business wearing the accessibility
    // contract of a live region (role="alert", role="status", aria-live). <LiveStatus> itself is
    // exempted here — its own conditional mounting is asserted, with a more specific message, by
    // the test above.
    const conditionalElementOpenTag = /(?:&&|\?)\s*\(?\s*<([A-Za-z][\w.]*)\b([^>]*)>/g
    const liveRegionAttrs = /role\s*=\s*["'](?:alert|status)["']|aria-live\s*=/

    const offenders = FILES.filter((f) => {
      if (namedStatusGuard.test(f.source)) return true
      conditionalElementOpenTag.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = conditionalElementOpenTag.exec(f.source))) {
        if (match[1] !== 'LiveStatus' && liveRegionAttrs.test(match[2] ?? '')) return true
      }
      return false
    }).map((f) => f.path)

    expect(
      offenders,
      `conditionally mounted status element in: ${offenders.join(', ')}. The old ` +
        '`{error && <p>{error}</p>}` bug reappears under a different variable name (submitError, ' +
        'state.err, notice, …), a different element (<div>, <span>, …), as a ternary, or with ' +
        'role="alert" / role="status" / aria-live on the conditional element — every one of these ' +
        'is silently missed by screen readers exactly like the original. Route it through ' +
        '<LiveStatus> instead.',
    ).toEqual([])
  })

  it('keeps the two focus-move sites focusable', () => {
    const answerForm = FILES.find((f) => f.path === path.join('components', 'answer-form.tsx'))
    expect(
      answerForm,
      'expected components/answer-form.tsx to be present in the scanned file set — if it was ' +
        'renamed or moved, update this test',
    ).toBeDefined()
    // Task 4 (resumable-assessment-progress) replaced the inline "done" confirmation screen with a
    // full navigation back to the dashboard on completion (onComplete → router.push), so there is no
    // longer a second in-page view to move focus into. The remaining — and now only — focus-move
    // site in this component is the per-question heading, focused on every step change
    // (headingRef.current?.focus(), asserted separately in tests/a11y/answer-form-wizard.test.ts).
    expect(
      answerForm!.source,
      'answer-form must keep the per-question heading focusable — it is the target of the ' +
        'programmatic focus-on-step-change call',
    ).toContain('ref={headingRef}')
    expect(answerForm!.source, 'the focused heading must carry tabIndex={-1}').toContain('tabIndex={-1}')

    // The sign-in mechanics (and this focus-move) live in the shared PasswordlessEntry component,
    // rendered by both /sign-in and /sign-up.
    const signIn = FILES.find((f) => f.path === path.join('components', 'auth', 'passwordless-entry.tsx'))
    expect(
      signIn,
      'expected components/auth/passwordless-entry.tsx to be present in the scanned file set — if it ' +
        'was renamed or moved, update this test',
    ).toBeDefined()
    expect(signIn!.source, 'passwordless-entry must keep a ref on the sent confirmation').toContain('ref={sentRef}')
  })

  // --- ShareResult.status must stay required (Fix 5) -----------------------------------------
  //
  // Making `status` optional again would keep `tsc` green — `string | undefined` still satisfies
  // a comparison against `'created'` — while silently restoring the exact unannounceable-revoke
  // state the discriminator exists to prevent (revokeShare's success return would once again be
  // indistinguishable from the client's EMPTY initial state). A type-level requirement needs a
  // type-level pin, not just a runtime check.
  it('keeps ShareResult.status required, not optional', () => {
    const actionsSource = fs.readFileSync(
      path.join(REPO_ROOT, 'app', 'app', '[churchId]', 'diagnosis', 'actions.ts'),
      'utf8',
    )
    expect(actionsSource).toContain("status: 'idle' | 'created' | 'revoked'")
    expect(
      actionsSource,
      'ShareResult.status must not become optional (`status?:`) — `string | undefined` still ' +
        "compiles against `=== 'created'`, so tsc would stay green while silently reintroducing " +
        'the unannounceable revoke state this discriminator exists to prevent',
    ).not.toMatch(/status\?:/)
  })
})
