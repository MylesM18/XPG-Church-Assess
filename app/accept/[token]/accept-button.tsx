'use client'

import { useState } from 'react'
import { acceptInvitation } from './actions'
import { LiveStatus } from '@/components/live-status'

export function AcceptButton({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-disabled={pending}
        onClick={async () => {
          if (pending) return
          setError(null)
          setPending(true)
          const res = await acceptInvitation(token) // success redirects; only errors return
          if (res && !res.ok) { setError(res.error ?? 'Could not accept the invitation.'); setPending(false) }
        }}
        className="rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {pending ? 'Accepting…' : 'Accept invitation'}
      </button>
      <LiveStatus message={error} tone="error" className="font-body text-sm text-berry" />
    </div>
  )
}
