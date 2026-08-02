import { RemoveMemberButton } from './remove-member-button'
import { ExtendDeadlineButton } from './extend-deadline-button'
import { completionWindowState, memberDaysLeftText } from '@/lib/deadlines/countdown'

// The focus target when a row unmounts. RemoveMemberButton focuses this heading from its own effect
// cleanup, because removing a row leaves no control at that position to receive focus. See
// docs/superpowers/specs/2026-07-20-m6d-i4-unmount-focus-design.md section 4.
const MEMBERS_HEADING_ID = 'access-members-heading'

export type Member = {
  user_id: string
  full_name: string | null
  email: string | null
  role: string
  joined_at: string
  assessment_deadline_at: string | null
}

export function MembersList({
  churchId, members, currentUserId, disableRemoveFor,
}: {
  churchId: string
  members: Member[]
  currentUserId: string | null
  disableRemoveFor: string | null
}) {
  const now = new Date()
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-line bg-paper p-4">
      <h2 id={MEMBERS_HEADING_ID} tabIndex={-1} className="font-display text-lg text-ink">Members</h2>
      <ul className="flex flex-col divide-y divide-line">
        {members.map((m) => {
          const isSelf = m.user_id === currentUserId
          const noRemove = m.user_id === disableRemoveFor
          const window = completionWindowState(m.assessment_deadline_at ? new Date(m.assessment_deadline_at) : null, now)
          const daysLeftText = memberDaysLeftText(window)
          return (
            <li key={m.user_id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate font-body text-sm text-ink">
                  {m.full_name ?? m.email ?? 'Unknown'}{isSelf && <span className="text-ink-soft"> (you)</span>}
                </p>
                <p className="font-body text-xs text-ink-soft">
                  {m.role === 'admin' ? 'Co-admin' : 'Member'} · joined {new Date(m.joined_at).toLocaleDateString()}
                  {daysLeftText && <span className={window.open ? '' : 'text-berry'}> · {daysLeftText}</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {window.timed && <ExtendDeadlineButton churchId={churchId} userId={m.user_id} />}
                {noRemove ? (
                  <span className="font-body text-xs text-ink-soft" title="A church must keep at least one admin.">Last admin</span>
                ) : (
                  <RemoveMemberButton churchId={churchId} userId={m.user_id} headingId={MEMBERS_HEADING_ID} />
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
