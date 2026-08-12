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
