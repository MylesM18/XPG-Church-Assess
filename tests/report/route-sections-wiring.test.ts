import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const read = (...p: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

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
    expect(diagnosisPage).toContain('churchFactsFrom(churchProfile')
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
