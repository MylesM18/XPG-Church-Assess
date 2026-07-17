'use client'

import { useActionState } from 'react'
import { revokeInvitation, type ManageResult } from './actions'

const initial: ManageResult = { error: null }

export function RevokeInviteButton({ churchId, inviteId }: { churchId: string; inviteId: string }) {
  const [state, formAction, pending] = useActionState(revokeInvitation, initial)
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="church_id" value={churchId} />
      <input type="hidden" name="invite_id" value={inviteId} />
      <button type="submit" disabled={pending}
        className="font-body text-xs text-berry-deep underline underline-offset-2 hover:opacity-80 disabled:opacity-50">
        {pending ? 'Revoking…' : 'Revoke'}
      </button>
      {state.error && <p className="font-body text-xs text-berry">{state.error}</p>}
    </form>
  )
}
