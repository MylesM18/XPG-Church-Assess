'use client'

import { useActionState, useEffect, useRef } from 'react'
import { revokeInvitation, type ManageResult } from './actions'
import { LiveStatus } from '@/components/live-status'

const initial: ManageResult = { error: null }

export function RevokeInviteButton({
  churchId,
  inviteId,
  headingId,
}: {
  churchId: string
  inviteId: string
  headingId: string
}) {
  const [state, formAction, pending] = useActionState(revokeInvitation, initial)
  const submitted = useRef(false)

  // Arm while this control's own action is in flight, so an unrelated unmount never moves focus.
  // DISARM when the action settles with an error: revokeInvitation returns { error } WITHOUT calling
  // revalidatePath on either of its failure paths, so the row stays mounted with the flag set, and a
  // later unmount -- most obviously navigating away from the page -- would run the cleanup below and
  // yank focus mid route transition. `pending` is a dependency as well as `state.error` so that a
  // retry returning the SAME error text still disarms: pending transitions true -> false either way.
  useEffect(() => {
    if (pending) submitted.current = true
    else if (state.error) submitted.current = false
  }, [pending, state.error])

  // Recover focus on unmount, but only if this control caused it. Revoking a row leaves no control at
  // that position, so the target is the list's own heading. getElementById rather than a ref: a ref
  // cannot cross the server -> client boundary, and threading one would force
  // pending-invites-list.tsx to become a client component, for a measured-identical result.
  useEffect(() => () => {
    if (submitted.current) document.getElementById(headingId)?.focus()
  }, [headingId])

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="church_id" value={churchId} />
      <input type="hidden" name="invite_id" value={inviteId} />
      <button type="submit" aria-disabled={pending}
        onClick={(e) => { if (pending) e.preventDefault() }}
        className="py-2 font-body text-xs text-berry-deep underline underline-offset-2 hover:opacity-80 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
        {pending ? 'Revoking…' : 'Revoke'}
      </button>
      <LiveStatus message={state.error} tone="error" className="font-body text-xs text-berry" />
    </form>
  )
}
