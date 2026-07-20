'use client'

import { useState, useTransition } from 'react'
import { generateDiagnosis } from './actions'

export function GenerateButton({ churchId }: { churchId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const res = await generateDiagnosis(churchId)
            // On success the action redirects (throws NEXT_REDIRECT) and this never runs;
            // only the { ok:false } error path returns a value.
            if (res && !res.ok) setError(res.error ?? 'Something went wrong.')
          })
        }
        className="rounded-md border border-line bg-ink px-3 py-1.5 font-body text-sm text-paper transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {pending ? 'Generating…' : 'Generate diagnosis'}
      </button>
      {error && <p className="font-body text-sm text-berry">{error}</p>}
    </div>
  )
}
