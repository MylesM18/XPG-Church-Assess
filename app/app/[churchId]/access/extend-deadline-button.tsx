'use client'

import { useActionState } from 'react'
import { extendMemberDeadline } from './actions'
import type { ManageResult } from './actions'
import { LiveStatus } from '@/components/live-status'

const initial: ManageResult = { error: null }

export function ExtendDeadlineButton({ churchId, userId }: { churchId: string; userId: string }) {
  const [state, formAction, pending] = useActionState(extendMemberDeadline, initial)
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="church_id" value={churchId} />
      <input type="hidden" name="user_id" value={userId} />
      <button type="submit" aria-disabled={pending}
        onClick={(e) => { if (pending) e.preventDefault() }}
        className="rounded-md border border-line px-2 py-1 font-body text-xs text-ink-soft transition-colors hover:text-ink aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
        {pending ? 'Extending…' : 'Extend 3 days'}
      </button>
      <LiveStatus message={state.error} tone="error" className="font-body text-xs text-berry" />
    </form>
  )
}
