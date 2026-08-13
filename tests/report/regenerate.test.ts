import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

describe('regenerateReport wiring', () => {
  const src = readFileSync('app/app/[churchId]/actions.ts', 'utf8')

  it('exists as a server action', () => {
    expect(src).toContain('export async function regenerateReport')
  })

  it('reads through the status-agnostic RPC', () => {
    // get_run_responses filters status='in_progress' and returns nothing on a completed run —
    // regenerate would silently write a report built from zero responses.
    expect(src).toContain('get_completed_run_responses')
  })

  it('persists through save_report', () => {
    // Two call sites now: the generation block and regenerate. Assert the COUNT — a presence
    // check is satisfied by the pre-existing generation call and would survive regenerate
    // silently never persisting.
    expect(src.match(/rpc\('save_report'/g)?.length).toBe(2)
  })

  it('is gated by PROSE_MODE, exactly like generation', () => {
    // Occurrence-count equality on the process.env.PROSE_MODE read itself (not the bare word
    // PROSE_MODE, which already occurs 4x today in comments and the two existing reads — a
    // bare-word count would pass before regenerateReport exists and stay green even if its
    // gate were deleted). regenerate must add a THIRD process.env.PROSE_MODE read, and it must
    // use the exact fallback-mode early-return form generation uses, not just a mention.
    expect(src.match(/process\.env\.PROSE_MODE/g)?.length).toBe(3)
    expect(src).toContain("(process.env.PROSE_MODE ?? 'fallback') === 'fallback'")
  })

  it('never lets a failure reach the user', () => {
    // Same backstop shape as generation: the catch logs a reason and returns.
    expect(src).toContain("console.warn('[report] regenerate failed:")
  })

  it('checks admin auth before clustering themes', () => {
    // Any authenticated church member could invoke this action directly and drive real AI
    // model spend — it has no cache-check skip. Scope to regenerateReport's own source span so
    // this can't vacuously pass by anchoring on the sibling generateDiagnosis block, which also
    // mentions requireChurchAdmin-adjacent auth. Guard the slice before using it: a missing
    // needle must not let indexOf(-1) satisfy the ordering assertion below.
    const start = src.indexOf('export async function regenerateReport')
    expect(start).not.toBe(-1)
    const regenerateSrc = src.slice(start)

    expect(regenerateSrc).toContain('requireChurchAdmin')
    expect(regenerateSrc.indexOf('requireChurchAdmin')).toBeLessThan(
      regenerateSrc.indexOf('clusterThemes('),
    )
  })
})
