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

  it('is gated by proseEnabled(), exactly like generation — never by an inline PROSE_MODE read', () => {
    // Occurrence-count equality on the `proseEnabled()` CALL (not the bare identifier, which the
    // import line also carries). Three call sites: the M5b prose block, the report block, and
    // regenerateReport's early return. A bare-word count would stay green if the regenerate gate
    // were deleted; equality on the call catches both a dropped gate and a fourth ungated model
    // path. Zero inline `process.env.PROSE_MODE` reads: the ONLY reader is lib/ai/prose-mode.ts,
    // so the four surfaces can never disagree about whether the model is on.
    // Comments are stripped first: the docblocks name `proseEnabled()` in prose too, and a raw
    // count would drift every time a comment is edited.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    expect(code).toContain("import { proseEnabled } from '@/lib/ai/prose-mode'")
    expect(code.match(/proseEnabled\(\)/g)?.length).toBe(3)
    expect(code.match(/if \(proseEnabled\(\)\) \{/g)?.length).toBe(2)
    expect(code.match(/process\.env\.PROSE_MODE/g) ?? []).toHaveLength(0)
    expect(code).toContain('if (!proseEnabled()) return')
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

    // FINAL REVIEW: the two assertions above pin the CALL, not the ENFORCEMENT. Deleting the
    // guard body while keeping `await requireChurchAdmin(churchId)` left them both green — i.e.
    // the admin gate could be gutted to a no-op with the whole suite passing, on this branch's
    // ONLY unbounded model-spend path (regenerate has no cache-check skip, so every invocation
    // is a real clusterThemes + composeReport spend). Pin that the guard's verdict is both
    // CAPTURED off the result and ACTED ON.
    expect(
      regenerateSrc,
      'requireChurchAdmin\'s result must destructure its error — an ignored error is an ' +
        'ungated action, and the call alone reads as if it throws, which it does not.',
    ).toMatch(/const \{[^}]*\berror: authErr\b[^}]*\} = await requireChurchAdmin\(/)
    expect(
      regenerateSrc,
      'a failed admin check must RETURN. Without this, any authenticated church member can ' +
        'invoke the action directly and drive unbounded AI model spend.',
    ).toMatch(/if \(authErr\)[\s\S]{0,120}return/)
  })
})
