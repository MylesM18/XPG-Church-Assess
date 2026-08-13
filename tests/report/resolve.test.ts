import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

describe('lib/data/reports.ts — the hash-addressed reports seam', () => {
  const src = readFileSync('lib/data/reports.ts', 'utf8')

  it('addresses the row by inputs_hash, not by generated_at ordering (D-P5-5)', () => {
    expect(src).toContain(".eq('inputs_hash', inputsHash)")
    // The pre-D-P5-5 read. Its survival anywhere in this module means the seam kept
    // the latest-row semantics that make the spec's revert scenario lose R1 forever.
    expect(src).not.toContain("order('generated_at'")
  })

  it('selects the two jsonb columns the resolver reads back', () => {
    expect(src).toContain('inputs_hash, sections, facts')
  })

  it('holds the reports query text exactly once — one place, so it cannot drift', () => {
    expect(src.match(/from\('reports'\)/g)?.length).toBe(2)
  })
})
