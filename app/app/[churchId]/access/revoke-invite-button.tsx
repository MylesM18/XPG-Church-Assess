'use client'

import { useActionState } from 'react'
import { revokeInvitation, type ManageResult } from './actions'
import { LiveStatus } from '@/components/live-status'

const initial: ManageResult = { error: null }

export function RevokeInviteButton({ churchId, inviteId }: { churchId: string; inviteId: string }) {
  const [state, formAction, pending] = useActionState(revokeInvitation, initial)
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="church_id" value={churchId} />
      <input type="hidden" name="invite_id" value={inviteId} />
      <button type="submit" disabled={pending}
        className="py-2 font-body text-xs text-berry-deep underline underline-offset-2 hover:opacity-80 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
        {pending ? 'Revoking…' : 'Revoke'}
      </button>
      <LiveStatus message={state.error} tone="error" className="font-body text-xs text-berry" />
    </form>
  )
}
