// Source-reading tripwire (node env, no DOM): asserts on file structure, not rendered output —
// same approach as tests/dashboard/results-admin-only.test.ts (readFileSync + comment-stripping
// + string/regex assertions on the source text).
//
// Why this exists, and why tests/report/stale-payload.test.ts is not enough: CT-1 (whole-branch
// review) was a call-ORDERING bug at three route call sites, not a bug inside resolveReportView
// itself. stale-payload.test.ts feeds resolveReportView a stale payload DIRECTLY — that proves
// the function itself branches correctly, but a unit test one layer below a call site cannot
// observe whether the CALLER invokes fallbackProse/buildReportView before or after
// resolveReportView's internal version check. The scoped re-review of the CT-1 fix proved the
// gap concretely: reverting the version check at the diagnosis-page call site left 436/436
// green, and the same revert on the public share route also left 436/436 green — two valid,
// compiling, CT-1-shaped regressions the pre-existing suite could not see.
//
// resolveReportView's own doc comment (lib/report/view.ts) explains the fix: `blocks` is a LAZY
// THUNK (`() => ReportBlocks`), not a value, specifically so a stale payload can never reach
// fallbackProse/buildReportView — resolveReportView only invokes the thunk once it has confirmed
// the payload is fresh. A caller that resolves `blocks` eagerly, before calling
// resolveReportView, reintroduces the exact defect this file exists to catch: fallbackProse (or
// buildReportView) throws on an old-shaped payload before the version check ever runs.
//
// This test pins, for all three report routes, that the file (a) calls resolveReportView( at
// all, (b) never calls fallbackProse(/buildReportView( anywhere OUTSIDE that call's own
// parentheses (i.e. nothing runs before the version check), and (c) wherever fallbackProse(/
// buildReportView( appears INSIDE the call, it does so as the body of the lazy `() => ...`
// thunk argument, never as a bare eagerly-evaluated positional argument.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const read = (...p: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8')
/** Strip comments so a doc comment mentioning these names cannot satisfy or break a match. */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

const GUARDED_CALLS = ['fallbackProse(', 'buildReportView('] as const

const ROUTES = [
  { label: 'app/app/[churchId]/diagnosis/page.tsx', segs: ['app', 'app', '[churchId]', 'diagnosis', 'page.tsx'] },
  { label: 'app/r/[shareToken]/page.tsx', segs: ['app', 'r', '[shareToken]', 'page.tsx'] },
  { label: 'app/api/report/[runId]/pdf/route.ts', segs: ['app', 'api', 'report', '[runId]', 'pdf', 'route.ts'] },
] as const

/**
 * Splits a call's argument-list text at top-level commas — i.e. commas not nested inside
 * (), {}, [], or a string/template literal. Not a general JS parser; good enough for this
 * repo's call-site formatting (positional args, one per line, no nested calls that themselves
 * contain top-level commas the split needs to see).
 */
function splitTopLevelArgs(argsText: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  let quote: string | null = null
  for (let i = 0; i < argsText.length; i++) {
    const ch = argsText[i]!
    if (quote) {
      current += ch
      if (ch === '\\') { current += argsText[++i] ?? ''; continue }
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; current += ch; continue }
    if (ch === '(' || ch === '{' || ch === '[') depth++
    if (ch === ')' || ch === '}' || ch === ']') depth--
    if (ch === ',' && depth === 0) { parts.push(current); current = ''; continue }
    current += ch
  }
  if (current.trim() !== '') parts.push(current)
  return parts
}

/**
 * Locates the first `resolveReportView(...)` call in `source` by counting parens from its own
 * open paren to its matching close, then splits its argument list at top-level commas. Returns
 * null when `resolveReportView(` is absent. `before`/`after` are everything outside the call's
 * own parens — anything found there runs, in source-order terms, before resolveReportView's
 * internal version check ever gets a chance to gate it.
 */
function extractResolveReportViewCall(
  source: string,
): { before: string; args: string[]; after: string } | null {
  const marker = 'resolveReportView('
  const start = source.indexOf(marker)
  if (start === -1) return null

  const openParenIdx = start + marker.length - 1
  let depth = 0
  let end = openParenIdx
  for (; end < source.length; end++) {
    if (source[end] === '(') depth++
    else if (source[end] === ')') {
      depth--
      if (depth === 0) { end++; break }
    }
  }

  return {
    before: source.slice(0, start),
    args: splitTopLevelArgs(source.slice(openParenIdx + 1, end - 1)),
    after: source.slice(end),
  }
}

describe('report routes resolve staleness before ever touching fallbackProse/buildReportView (CT-1)', () => {
  for (const { label, segs } of ROUTES) {
    it(`${label} calls resolveReportView( and gates fallbackProse/buildReportView behind its lazy thunk`, () => {
      const source = strip(read(...segs))

      expect(source, `${label} must call resolveReportView(`).toContain('resolveReportView(')

      const call = extractResolveReportViewCall(source)
      if (!call) throw new Error('unreachable — resolveReportView( presence already asserted above')

      for (const fn of GUARDED_CALLS) {
        expect(
          call.before.includes(fn) || call.after.includes(fn),
          `${label} calls ${fn} outside the resolveReportView(...) call. That runs BEFORE ` +
            `resolveReportView's internal version check can gate it — a stale payload would ` +
            `throw again instead of rendering the stale-methodology notice (CT-1).`,
        ).toBe(false)
      }

      // Inside the call, fallbackProse/buildReportView may only appear as the body of the lazy
      // `() => ...` thunk argument — never as a bare, eagerly-evaluated positional argument
      // (which JS evaluates before resolveReportView is even entered).
      for (const arg of call.args) {
        const usesGuardedCall = GUARDED_CALLS.some((fn) => arg.includes(fn))
        if (!usesGuardedCall) continue
        expect(
          /^\s*\(\)\s*=>/.test(arg),
          `${label}: an argument passed to resolveReportView(...) calls fallbackProse/` +
            `buildReportView but is not itself a lazy "() => ..." thunk (found: ` +
            `${JSON.stringify(arg.trim().slice(0, 160))}). A non-thunk argument is evaluated ` +
            `eagerly, before the version check runs — CT-1 again.`,
        ).toBe(true)
      }
    })
  }
})
