'use client'

import { useActionState, useState } from 'react'
import { resendInvitation, type ManageResult } from './actions'
import { LiveStatus } from '@/components/live-status'

const initial: ManageResult = { error: null }

export function ResendInviteButton({ churchId, inviteId }: { churchId: string; inviteId: string }) {
  const [state, formAction, pending] = useActionState(resendInvitation, initial)
  // A successful resend keeps the row mounted (no focus recovery needed, unlike Revoke). Track
  // whether the last settle succeeded so screen-reader users get a confirmation; visual users see
  // the expiry date refresh. `succeeded` is adjusted during render — React's documented pattern for
  // deriving state from a value change — rather than in an effect: a ref can't be read during render
  // (react-hooks/refs) and setState-in-effect causes an extra cascading render (react-hooks/set-state-in-effect).
  const [prevPending, setPrevPending] = useState(pending)
  const [succeeded, setSucceeded] = useState(false)
  if (pending !== prevPending) {
    setPrevPending(pending)
    if (!pending) setSucceeded(!state.error)
  }

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="church_id" value={churchId} />
      <input type="hidden" name="invite_id" value={inviteId} />
      <button type="submit" aria-disabled={pending}
        onClick={(e) => { if (pending) e.preventDefault() }}
        className="py-2 font-body text-xs text-ink-soft underline underline-offset-2 hover:opacity-80 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
        {pending ? 'Resending…' : 'Resend'}
      </button>
      <LiveStatus message={state.error} tone="error" className="font-body text-xs text-berry" />
      <LiveStatus message={succeeded && !pending ? 'Invitation re-sent.' : null} tone="status" className="sr-only" />
    </form>
  )
}
