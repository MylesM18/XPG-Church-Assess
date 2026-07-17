import { RemoveMemberButton } from './remove-member-button'

export type Member = { user_id: string; full_name: string | null; email: string | null; role: string; joined_at: string }

export function MembersList({
  churchId, members, currentUserId, disableRemoveFor,
}: {
  churchId: string
  members: Member[]
  currentUserId: string | null
  disableRemoveFor: string | null
}) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-line bg-paper p-4">
      <h2 className="font-display text-lg text-ink">Members</h2>
      <ul className="flex flex-col divide-y divide-line">
        {members.map((m) => {
          const isSelf = m.user_id === currentUserId
          const noRemove = m.user_id === disableRemoveFor
          return (
            <li key={m.user_id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate font-body text-sm text-ink">
                  {m.full_name ?? m.email ?? 'Unknown'}{isSelf && <span className="text-ink-soft"> (you)</span>}
                </p>
                <p className="font-body text-xs text-ink-soft">{m.role === 'admin' ? 'Co-admin' : 'Viewer'} · joined {new Date(m.joined_at).toLocaleDateString()}</p>
              </div>
              {noRemove ? (
                <span className="font-body text-xs text-ink-soft" title="A church must keep at least one admin.">Last admin</span>
              ) : (
                <RemoveMemberButton churchId={churchId} userId={m.user_id} />
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
