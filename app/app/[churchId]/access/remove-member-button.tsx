'use client'

import { useActionState } from 'react'
import { removeMember, type ManageResult } from './actions'

const initial: ManageResult = { error: null }

export function RemoveMemberButton({ churchId, userId }: { churchId: string; userId: string }) {
  const [state, formAction, pending] = useActionState(removeMember, initial)
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="church_id" value={churchId} />
      <input type="hidden" name="user_id" value={userId} />
      <button type="submit" disabled={pending}
        className="font-body text-xs text-berry-deep underline underline-offset-2 hover:opacity-80 disabled:opacity-50">
        {pending ? 'Removing…' : 'Remove'}
      </button>
      {state.error && <p className="font-body text-xs text-berry">{state.error}</p>}
    </form>
  )
}
