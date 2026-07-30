// Source-reading tripwire (node env, no DOM). Once the church's run is complete, the answer page
// must render a READ-ONLY review, not the editable SelfForm — v1 completion is terminal and the
// write RPC rejects a completed run, so rendering the form there reopened the "no active run" throw
// on the old "Take Again" path. Regressing to an unconditional <SelfForm> turns this red.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const page = stripComments(
  fs.readFileSync(
    path.join(ROOT, 'app', 'app', '[churchId]', 'answer', '[categoryId]', 'page.tsx'),
    'utf8',
  ),
)

describe('answer page: a completed run is review-only', () => {
  it('resolves the run and gates writability on the named seam', () => {
    expect(page, 'imports the run seam').toContain("from '@/lib/runs/current-run'")
    expect(page, 'resolves the current run status-agnostically').toContain('currentRun(')
    expect(page, 'gates on canAcceptAnswers (the named write policy)').toContain('canAcceptAnswers(')
  })

  it('renders the editable SelfForm only behind the writability gate', () => {
    const gateAt = page.indexOf('canAcceptAnswers')
    const formAt = page.indexOf('<SelfForm')
    expect(gateAt, 'the writability gate is present').toBeGreaterThanOrEqual(0)
    // The form must appear AFTER the gate — an unconditional form (rendered before/without the
    // gate) is the regression that reopens the write throw.
    expect(formAt, 'SelfForm sits after the canAcceptAnswers gate').toBeGreaterThan(gateAt)
  })

  it('shows a read-only review state for the completed run', () => {
    expect(page, 'read-only note present').toMatch(/read-only/i)
  })
})
