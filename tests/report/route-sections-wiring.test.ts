import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const read = (...p: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const countOf = (s: string, re: RegExp) => (s.match(re) ?? []).length

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
  it('passes churchFactsFrom(churchProfile, …) into reportInputs, not a null profile', () => {
    // Pins the §4.3 drift risk directly: a ChurchFacts built from four columns produces a
    // different profile slice and therefore a permanently stale hash, silently.
    expect(diagnosisPage).toContain('loadChurchProfile(')
    // Occurrence-count equality, NOT presence. There are two call sites — the reportInputs call
    // that feeds inputsHash and the buildFacts call on the themes-rebuild path — and they must
    // stay argument-identical. A bare toContain is satisfied by either one alone, so a
    // regression at exactly one site would render a facts.profile that diverges from the one
    // that was hashed, with every gate still green. Pinning both counts also forces a conscious
    // decision if a third call site is ever added.
    expect(countOf(diagnosisPage, /churchFactsFrom\(/g)).toBe(2)
    expect(countOf(diagnosisPage, /churchFactsFrom\(churchProfile/g)).toBe(2)
    expect(diagnosisPage).not.toContain('churchFactsFrom(null')
  })

  it('passes knownLabels(responses) as the label source at both facts call sites', () => {
    // labelSource IS a hash input, by the same indirect route as church: buildFacts admits the
    // eight FREE_TEXT_PROFILE_KEYS into facts.profile only when labelSource.kind === 'known'
    // (lib/report/facts.ts:182), and facts.profile is component 5 of the inputs hash. Generation
    // passes knownLabels(responses) (actions.ts:200), so render must too — a redacted source here
    // type-checks fine, silently drops eight keys from the hashed profile, and stales the
    // persisted report forever with every gate green.
    //
    // Occurrence-count equality, NOT presence — sibling of the churchFactsFrom pin above and the
    // same two call sites (reportInputs, and buildFacts on the themes-rebuild path).
    expect(countOf(diagnosisPage, /labelSource:/g)).toBe(2)
    expect(countOf(diagnosisPage, /labelSource: knownLabels\(responses\)/g)).toBe(2)
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
