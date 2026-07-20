'use client'

import { useState } from 'react'
import { acceptInvitation } from './actions'

export function AcceptButton({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setError(null)
          setPending(true)
          const res = await acceptInvitation(token) // success redirects; only errors return
          if (res && !res.ok) { setError(res.error ?? 'Could not accept the invitation.'); setPending(false) }
        }}
        className="rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {pending ? 'Accepting…' : 'Accept invitation'}
      </button>
      {error && <p className="font-body text-sm text-berry">{error}</p>}
    </div>
  )
}
