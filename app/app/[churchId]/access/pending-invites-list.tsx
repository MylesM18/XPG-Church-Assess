import { RevokeInviteButton } from './revoke-invite-button'
import { acceptLink } from '@/lib/access/accept-state'

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
        <h2 className="font-display text-lg text-ink">Pending invitations</h2>
        <p className="mt-1 font-body text-sm text-ink-soft">No pending invitations.</p>
      </section>
    )
  }
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-line bg-paper p-4">
      <h2 className="font-display text-lg text-ink">Pending invitations</h2>
      <ul className="flex flex-col divide-y divide-line">
        {invites.map((inv) => (
          <li key={inv.id} className="flex flex-col gap-1 py-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-body text-sm text-ink">{inv.invited_email}</p>
                <p className="font-body text-xs text-ink-soft">{inv.role === 'admin' ? 'Co-admin' : 'Viewer'} · expires {new Date(inv.expires_at).toLocaleDateString()}</p>
              </div>
              <RevokeInviteButton churchId={churchId} inviteId={inv.id} />
            </div>
            <code className="break-all font-body text-xs text-ink-soft">{acceptLink(appUrl, inv.id)}</code>
          </li>
        ))}
      </ul>
    </section>
  )
}
