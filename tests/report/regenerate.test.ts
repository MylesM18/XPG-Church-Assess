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

  // Greptile P1 (PR #79, "Client latch permits duplicate generation"): the auto-generate
  // component's sessionStorage latch is per BROWSER — two admins, or one admin in two tabs,
  // viewing the diagnosis at once each pass their own latch and each fire regenerateReport for the
  // same inputs. The action therefore re-reads the `reports` row scoped to (run_id, inputs_hash)
  // — the SAME scoped read the generation block does — and, when a USABLE row was written within
  // REGENERATE_DEDUP_WINDOW_MS, skips the model spend. No migration, no lock: truly simultaneous
  // in-flight calls can still both run (save_report's UPSERT makes that safe; the only cost is
  // duplicate spend), but the post-write window is closed. Manual Generate / Regenerate is
  // unaffected in practice: the page only renders those forms when NO usable row exists at the
  // live hash.
  describe('recency dedup: skips when a usable row already exists at this inputs hash', () => {
    const start = src.indexOf('export async function regenerateReport')
    expect(start).not.toBe(-1)
    const regenerateSrc = src.slice(start)
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

    it('re-reads the reports row scoped to (run_id, inputs_hash) with section_sources + generated_at, inside regenerateReport', () => {
      // Scoped exactly like generation's cache check (unscoped ⇒ a sibling church's row could
      // suppress this church's regenerate).
      const readIdx = regenerateSrc.indexOf(".from('reports')")
      expect(readIdx).toBeGreaterThan(-1)
      const readBlock = regenerateSrc.slice(readIdx, regenerateSrc.indexOf('.maybeSingle()', readIdx))
      expect(readBlock).toContain("select('section_sources, generated_at')")
      expect(readBlock).toContain(".eq('run_id', run.id)")
      expect(readBlock).toContain(".eq('inputs_hash', inputsHash)")
    })

    it('calls isUsableCachedReport twice in actions.ts — generation\'s cache check AND regenerate\'s dedup (count 1 → 2)', () => {
      // Occurrence-count equality on the CALL, comments stripped: a presence check is satisfied by
      // the pre-existing generation call and would survive regenerate never gating on usability
      // (a 100 %-fallback row must NOT suppress regenerate — that is the whole H7 point).
      expect(code.match(/isUsableCachedReport\(/g)?.length).toBe(2)
      const regenerateCode = code.slice(code.indexOf('export async function regenerateReport'))
      expect(regenerateCode.match(/isUsableCachedReport\(/g)?.length).toBe(1)
    })

    it('names the window as REGENERATE_DEDUP_WINDOW_MS (10 minutes) and compares generated_at against it', () => {
      expect(code).toMatch(/const REGENERATE_DEDUP_WINDOW_MS = 10 \* 60_000/)
      // Declared once, USED in regenerateReport (a declared-but-unused constant is a no-op guard).
      expect(code.match(/REGENERATE_DEDUP_WINDOW_MS/g)?.length).toBe(2)
      const regenerateCode = code.slice(code.indexOf('export async function regenerateReport'))
      expect(regenerateCode).toContain('REGENERATE_DEDUP_WINDOW_MS')
      expect(regenerateCode).toContain('generated_at')
    })

    it('logs the skip with seconds only — no payload — revalidates the page, and returns without persisting', () => {
      expect(regenerateSrc).toContain("'[report] regenerate skipped: a report for these inputs was written '")
      // The skip returns BEFORE any model call; the log carries an age in seconds, nothing else.
      // fix/auto-generate-hardening: the skip REVALIDATES first — the clicking tab may have
      // rendered before the other tab's write, and Next does not re-render a form action that
      // neither revalidates nor redirects (behavior pinned in tests/report/regenerate-behavior.test.ts).
      const skipIdx = regenerateSrc.indexOf('[report] regenerate skipped:')
      const skipTail = regenerateSrc.slice(skipIdx, skipIdx + 320)
      expect(skipTail).toMatch(/s ago/)
      expect(skipTail).toContain('revalidatePath(`/app/${churchId}/diagnosis`)')
      expect(skipTail).toMatch(/return/)
      expect(skipTail.indexOf('revalidatePath(')).toBeLessThan(skipTail.indexOf('return'))
      expect(skipTail).not.toContain('section_sources')
      expect(skipTail).not.toContain('facts')
    })

    it('reads the auto flag off the FormData under the exact name the client sends, and only auto-runs back off from a non-usable row', () => {
      // fix/auto-generate-hardening: `auto=1` widens the skip to ANY fresh row (a fresh
      // all-fallback row = the model just failed; do not re-run it from every new tab). Manual
      // calls keep the usable-only rule — the H7 point.
      const regenerateCode = code.slice(code.indexOf('export async function regenerateReport'))
      expect(regenerateCode).toContain("const auto = formData.get('auto') === '1'")
      expect(regenerateCode).toMatch(/if \(cached && \(auto \|\| isUsableCachedReport\(cached\.section_sources\)\)\)/)
      // The DB clock may run a little ahead of the function's: a small negative age is "just
      // written"; the tolerance is named, declared once, and used once.
      expect(code).toMatch(/const REGENERATE_DEDUP_SKEW_TOLERANCE_MS = 60_000/)
      expect(code.match(/REGENERATE_DEDUP_SKEW_TOLERANCE_MS/g)?.length).toBe(2)
      expect(regenerateCode).toContain('ageMs > -REGENERATE_DEDUP_SKEW_TOLERANCE_MS')
      expect(regenerateCode).not.toContain('ageMs >= 0')
    })

    it('places the dedup read AFTER reportInputs({ and BEFORE clusterThemes( — the hash exists, the model has not been called', () => {
      const inputsIdx = regenerateSrc.indexOf('reportInputs({')
      const readIdx = regenerateSrc.indexOf(".from('reports')")
      const skipIdx = regenerateSrc.indexOf('[report] regenerate skipped:')
      const clusterIdx = regenerateSrc.indexOf('clusterThemes(')
      // Guard every anchor before ordering: indexOf(-1) is a fail-open sentinel.
      for (const idx of [inputsIdx, readIdx, skipIdx, clusterIdx]) expect(idx).toBeGreaterThan(-1)
      expect(inputsIdx).toBeLessThan(readIdx)
      expect(readIdx).toBeLessThan(skipIdx)
      expect(skipIdx).toBeLessThan(clusterIdx)
    })
  })

  it('checks admin auth before clustering themes', () => {
    // Any authenticated church member could invoke this action directly and drive real AI
    // model spend — its only skip is the 10-minute recency dedup below, never a content cache
    // check, so any inputs older than that are a real spend. Scope to regenerateReport's own
    // source span so this can't vacuously pass by anchoring on the sibling generateDiagnosis
    // block, which also mentions requireChurchAdmin-adjacent auth. Guard the slice before using
    // it: a missing needle must not let indexOf(-1) satisfy the ordering assertion below.
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
    // ONLY unbounded model-spend path (regenerate has no content cache-check skip — only the
    // short recency dedup — so every invocation outside that window is a real clusterThemes +
    // composeReport spend). Pin that the guard's verdict is both
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
