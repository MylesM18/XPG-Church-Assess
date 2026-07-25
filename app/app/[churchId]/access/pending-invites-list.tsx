import { RevokeInviteButton } from './revoke-invite-button'
import { ResendInviteButton } from './resend-invite-button'
import { acceptLink } from '@/lib/access/accept-state'

// The focus target when a row unmounts. BOTH branches below carry this id deliberately: revoking the
// LAST pending invite swaps the populated section for the empty-state one, so if only the populated
// heading had it, document.getElementById would return null at exactly that moment, the optional
// chain would swallow it, and focus would stay on <body>. That is the single most common revoke
// there is. See the spec section 6.1.
const PENDING_HEADING_ID = 'access-pending-invites-heading'

export type PendingInvite = { id: string; invited_email: string; role: string; expires_at: string }

export function PendingInvitesList({
  churchId, invites, appUrl,
}: {
  churchId: string
  invites: PendingInvite[]
  appUrl: string
}) {
  if (invites.length === 0) {
    return (
      <section className="rounded-lg border border-line bg-paper p-4">
        <h2 id={PENDING_HEADING_ID} tabIndex={-1} className="font-display text-lg text-ink">Pending invitations</h2>
        <p className="mt-1 font-body text-sm text-ink-soft">No pending invitations.</p>
      </section>
    )
  }
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-line bg-paper p-4">
      <h2 id={PENDING_HEADING_ID} tabIndex={-1} className="font-display text-lg text-ink">Pending invitations</h2>
      <ul className="flex flex-col divide-y divide-line">
        {invites.map((inv) => (
          <li key={inv.id} className="flex flex-col gap-1 py-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-body text-sm text-ink">{inv.invited_email}</p>
                <p className="font-body text-xs text-ink-soft">{inv.role === 'admin' ? 'Co-admin' : 'Member'} · expires {new Date(inv.expires_at).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-3">
                <ResendInviteButton churchId={churchId} inviteId={inv.id} />
                <RevokeInviteButton churchId={churchId} inviteId={inv.id} headingId={PENDING_HEADING_ID} />
              </div>
            </div>
            <code className="break-all font-body text-xs text-ink-soft">{acceptLink(appUrl, inv.id)}</code>
          </li>
        ))}
      </ul>
    </section>
  )
}
