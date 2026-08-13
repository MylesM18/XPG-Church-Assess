import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const read = (...p: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const countOf = (s: string, re: RegExp) => (s.match(re) ?? []).length

/**
 * Extracts the balanced-parenthesis argument text of the first `callName(...)` call in
 * `source`, or null if the call isn't present. Local copy of the helper in
 * tests/report/route-methodology-wiring.test.ts — per this test suite's existing
 * no-shared-fixture-module convention (see resolve.test.ts's fixture-kit comment), each
 * consumer keeps its own, rather than importing across test files.
 */
function extractCallArgs(source: string, callName: string): string | null {
  const marker = `${callName}(`
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
  return source.slice(openParenIdx + 1, end - 1)
}

const sharePage = strip(read('app', 'r', '[shareToken]', 'page.tsx'))
const diagnosisPage = strip(read('app', 'app', '[churchId]', 'diagnosis', 'page.tsx'))

describe('the public share surface stays structurally excluded from AI, themes and reflections', () => {
  it('never reads the reports table and never assembles the AI path', () => {
    expect(sharePage).not.toContain(".from('reports')")
    expect(sharePage).not.toContain('assembleReport(')
    expect(sharePage).toContain('assembleFallbackOnly(')
  })

  it('never builds a keyed reflections array', () => {
    expect(sharePage).not.toContain('reflectionRowsFor')
    expect(sharePage).not.toContain('respondent_key')
  })

  it('passes no themes into buildFacts', () => {
    // Whole-file substring-ABSENCE check. Acceptable ONLY while the share page has zero
    // legitimate uses of the word (verified: no code, no import path, no comment). If one is
    // ever genuinely needed, switch this to occurrence-count equality — do NOT delete it.
    expect(sharePage).not.toContain('themes')
  })

  it('passes the explicit redacted label source, never knownLabels (D-P4-4)', () => {
    expect(sharePage).toContain("kind: 'redacted'")
    expect(sharePage).not.toContain('knownLabels(')
  })
})

describe('the diagnosis surface wires the keyed array to the hash and nothing else', () => {
  it('passes churchFactsFrom(churchProfile, …) into resolveReportSections, not a null profile', () => {
    // Pins the §4.3 drift risk directly: a ChurchFacts built from four columns produces a
    // different profile slice and therefore a permanently stale hash, silently.
    expect(diagnosisPage).toContain('loadChurchProfile(')
    // Occurrence-count equality, NOT presence. Plan 5's resolver seam collapsed the old two call
    // sites (the reportInputs call that fed inputsHash and the buildFacts call on the
    // themes-rebuild path) into resolveReportSections's single call — a regression that
    // reintroduces a second, drifting church-facts source would show up here.
    expect(countOf(diagnosisPage, /churchFactsFrom\(/g)).toBe(1)
    expect(countOf(diagnosisPage, /churchFactsFrom\(churchProfile/g)).toBe(1)
    expect(diagnosisPage).not.toContain('churchFactsFrom(null')
  })

  it('computes knownLabels(responses) once and threads it as the single labelSource', () => {
    // labelSource IS a hash input, by the same indirect route as church: buildFacts admits the
    // eight FREE_TEXT_PROFILE_KEYS into facts.profile only when labelSource.kind === 'known'
    // (lib/report/facts.ts:182), and facts.profile is component 5 of the inputs hash. Generation
    // passes knownLabels(responses) (actions.ts:200), so render must too — a redacted source here
    // type-checks fine, silently drops eight keys from the hashed profile, and stales the
    // persisted report forever with every gate green.
    //
    // Plan 5's resolver seam collapsed the old two inline call sites (reportInputs, and buildFacts
    // on the themes-rebuild path) into one: labelSource is computed once and threaded through as
    // a shorthand property, so the literal `labelSource:` no longer appears — the invariant is
    // now "computed once, consumed once", pinned by occurrence count on both identifiers.
    expect(countOf(diagnosisPage, /knownLabels\(responses\)/g)).toBe(1)
    expect(diagnosisPage).toContain('const labelSource = knownLabels(responses)')

    // Pins the BINDING reaching the call, not merely the identifier `labelSource` appearing
    // somewhere in the file. A bare `\blabelSource\b` count of 2 is satisfied by the const
    // declaration's own name PLUS an object *key* — so a regression like
    // `labelSource: { kind: 'redacted' as const },` at the call site (silently dropping the
    // eight FREE_TEXT_PROFILE_KEYS from the hashed profile, lib/report/facts.ts:182, and staling
    // the persisted report forever) would satisfy that count while breaking the invariant. Scope
    // to the call's own argument text and require the bare shorthand form — `labelSource` not
    // immediately followed by `:` — to close that hole.
    const resolveArgs = extractCallArgs(diagnosisPage, 'resolveReportSections')
    expect(resolveArgs, 'expected a resolveReportSections( call').not.toBeNull()
    expect(
      /(^|[{,])\s*labelSource\s*[,}]/.test(resolveArgs!),
      'resolveReportSections must receive labelSource as a bare shorthand property (the ' +
        'knownLabels(responses) binding itself), not a re-typed or redacted object literal',
    ).toBe(true)
  })

  it('reads the response hash off the diagnosis edition, not the run row', () => {
    // The other half of §4.3 parity: generation is responseHash(responses, diagnosis
    // .methodology_version) (actions.ts:119), so render must read .methodology_version off the
    // re-derived diagnosis too — never run.methodology_version and never a methodology edition's
    // own .questions.version. Both counts pinned so a second call site forces a decision rather
    // than silently satisfying a presence check.
    expect(countOf(diagnosisPage, /responseHash\(/g)).toBe(1)
    expect(
      countOf(diagnosisPage, /responseHash\(responses, resolution\.diagnosis\.methodology_version\)/g),
    ).toBe(1)
  })

  it('keeps loadChurchForMember for chrome and the role check', () => {
    expect(diagnosisPage).toContain('loadChurchForMember(')
  })
})

describe('both surfaces render from reportMethodology, never the raw methodology', () => {
  it('keeps both effectiveMethodology assignments', () => {
    const missing = [
      ['share', sharePage],
      ['diagnosis', diagnosisPage],
    ].filter(([, src]) => !(src as string).includes('derived.effectiveMethodology'))
    expect(missing.map(([label]) => label)).toEqual([])
  })
})
