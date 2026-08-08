import { describe, expect, it } from 'vitest'
import { isExemptMember } from '@/lib/coverage/exemption'

const NOW = new Date('2026-08-07T12:00:00.000Z')
const PAST = '2026-08-01T12:00:00.000Z'
const FUTURE = '2026-08-20T12:00:00.000Z'
// NOW minus 1ms: the smallest possible "strictly past" deadline, paired with the
// exact-boundary test below to pin the operator's direction on both sides.
const JUST_PAST = new Date(NOW.getTime() - 1).toISOString()

describe('isExemptMember', () => {
  it('no deadline means no exemption', () => {
    // Mutation guard: a dropped/inverted `deadlineAt === null` check. Without this
    // early return, a null deadline would hit `new Date(null)` (epoch 1970) and always
    // read as "past" -> wrongly exempting every untimed (founder / pre-existing) member.
    expect(isExemptMember(null, '0.2.0', NOW)).toBe(false)
  })

  it('an open window means no exemption', () => {
    // Mutation guard: catches `<` swapped in for `>` (wrong comparison direction).
    // NOW is well before FUTURE, so only the correct direction reports "not yet exempt".
    expect(isExemptMember(FUTURE, '0.2.0', NOW)).toBe(false)
  })

  it('closed window on a pre-0.3.0 run exempts', () => {
    // Mutation guard: catches `<` swapped in for `>`, and catches a dropped/inverted
    // predatesOutreach call collapsing to `return false` unconditionally.
    expect(isExemptMember(PAST, '0.2.0', NOW)).toBe(true)
  })

  it('closed window on a null-version run exempts', () => {
    // Mutation guard: catches a version check that assumes non-null (e.g. `runMethodologyVersion < OUTREACH_VERSION`
    // called directly instead of via predatesOutreach, which would throw/misbehave on null).
    expect(isExemptMember(PAST, null, NOW)).toBe(true)
  })

  it('closed window on a 0.3.0 run does NOT exempt', () => {
    // Mutation guard: catches the predatesOutreach gate being dropped entirely (which
    // would exempt on deadline alone, regardless of methodology version).
    expect(isExemptMember(PAST, '0.3.0', NOW)).toBe(false)
  })

  it('at the boundary instant the window is still open', () => {
    // THE discriminating test: with `>=` this would wrongly report true (exempt) at the
    // exact instant now === deadline. Only strict `>` yields false here. Mutation-tested
    // for real (see task-19-report.md) by flipping the operator and re-running.
    expect(isExemptMember(NOW.toISOString(), '0.2.0', NOW)).toBe(false)
  })

  it('one millisecond past the boundary is exempt', () => {
    // Companion to the boundary test above: confirms the operator's "past" side actually
    // fires at the smallest possible margin, not just at "clearly after" (PAST, 6 days
    // prior) where `>` and `>=` cannot be told apart.
    expect(isExemptMember(JUST_PAST, '0.2.0', NOW)).toBe(true)
  })
})
