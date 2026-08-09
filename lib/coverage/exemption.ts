import { predatesOutreach } from '@/lib/methodology/effective'

/**
 * "Old edition, old test." A member's progress is measured against the run's OWN item list, not
 * the current one, whenever that run predates the outreach questions (methodology 0.3.0).
 *
 * REVISED (owner ruling, 2026-08-08) — this used to also require a passed `assessment_deadline_at`
 * ("closed window, closed test"): only a member whose window had already closed was exempted,
 * because the answer page served the CURRENT methodology to everyone, so an open-window member on
 * an old run technically COULD still go answer the new items before their deadline. The deadline
 * dropped out of this decision because that precondition no longer holds: the answer page now
 * serves each run's EFFECTIVE methodology (effectiveMethodologyForRun), so a pre-0.3.0 run never
 * offers the new items to any member, open window or closed. Keying exemption off the deadline
 * would reintroduce, from the other direction, the exact failure this predicate exists to prevent —
 * an open-window member offered the small list by the answer page but measured against the big one
 * by the dashboard/completion screens, reading as permanently incomplete. See
 * tests/coverage/exemption.test.ts for the full rationale.
 *
 * Consequently this is now a run-level fact, not a per-member one — every member of the same
 * church (one run per church, ADR 0001) gets the same answer. It is kept as a named,
 * coverage-domain predicate (rather than inlining predatesOutreach at every call site) purely for
 * vocabulary; lib/coverage/member-matrix.ts's own comments still reference it by this name.
 */
export function isExemptMember(runMethodologyVersion: string | null): boolean {
  return predatesOutreach(runMethodologyVersion)
}
