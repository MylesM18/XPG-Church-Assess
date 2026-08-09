import { describe, expect, it } from 'vitest'
import { isExemptMember } from '@/lib/coverage/exemption'
import { predatesOutreach } from '@/lib/methodology/effective'

// Owner ruling (2026-08-08): isExemptMember USED to be a three-way AND of (has a deadline, run
// predates 0.3.0, that deadline has strictly passed) — "closed window, closed test": only a member
// whose window had already closed was measured against the run's old (smaller) item list, because
// only THEY were structurally unable to answer new items (the answer page served the CURRENT
// methodology to everyone, so an open-window member on an old run could, in principle, still answer
// the new items before their deadline).
//
// That precondition no longer holds. The answer page (app/app/[churchId]/answer/[categoryId]/
// page.tsx) now serves each run's EFFECTIVE methodology (effectiveMethodologyForRun), so a
// pre-0.3.0 run never offers the new items to ANY member, open window or closed. Continuing to key
// exemption off the deadline would reintroduce the exact bug this predicate exists to prevent, from
// the other direction: an open-window member on an old run would be offered the small item list by
// the answer page but measured against the big one by the dashboard/completion screens, reading as
// permanently incomplete despite having answered everything they were ever shown.
//
// So the item-list question now has exactly one input: does the run predate 0.3.0? isExemptMember
// is kept as a named, coverage-domain predicate (rather than inlining predatesOutreach at every
// call site) purely for vocabulary — lib/coverage/member-matrix.ts's own comments reference it by
// this name — but it is now a run-level fact, not a per-member one; every member of the same church
// (one run per church, ADR 0001) gets the same answer.
describe('isExemptMember', () => {
  it('a run stamped 0.2.0 (predates the outreach questions) exempts', () => {
    // Mutation guard: catches the predatesOutreach delegation being dropped (e.g. replaced with a
    // hardcoded `false`, or a direct `=== '0.2.0'` that would miss '0.1.0' and other predating values).
    expect(isExemptMember('0.2.0')).toBe(true)
  })

  it('a null (unstamped, pre-versioning) run exempts', () => {
    // Mutation guard: catches a version check that assumes non-null and would throw or misbehave —
    // predatesOutreach(null) === true is the documented contract this must keep honoring.
    expect(isExemptMember(null)).toBe(true)
  })

  it('a run stamped 0.3.0 (current edition) does NOT exempt', () => {
    // Mutation guard: catches the predatesOutreach gate being dropped entirely (unconditional true).
    expect(isExemptMember('0.3.0')).toBe(false)
  })

  it('a run stamped past 0.3.0 does NOT exempt', () => {
    expect(isExemptMember('0.4.0')).toBe(false)
  })

  it('agrees with predatesOutreach for every input — no independent comparison logic to drift', () => {
    // Mutation guard: catches a hand-rolled version comparison creeping back in (e.g. string equality
    // instead of the lexicographic compare predatesOutreach uses) that could disagree with the engine's
    // own effectiveMethodologyForRun on some input, splitting "what's served" from "what's exempt".
    for (const v of [null, '0.1.0', '0.2.0', '0.2.9', '0.3.0', '0.3.1', '1.0.0']) {
      expect(isExemptMember(v)).toBe(predatesOutreach(v))
    }
  })
})
