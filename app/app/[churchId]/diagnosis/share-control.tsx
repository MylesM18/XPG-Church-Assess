'use client'

import { useActionState } from 'react'
import { LiveStatus } from '@/components/live-status'
import { shareReport, revokeShare, type ShareResult } from './actions'

const EMPTY: ShareResult = { link: null, error: null, status: 'idle' }

export function ShareControl({
  churchId, runId, existingLink,
}: {
  churchId: string
  runId: string
  existingLink: string | null
}) {
  const [minted, mintAction, minting] = useActionState(shareReport, EMPTY)
  const [revoked, revokeAction, revoking] = useActionState(revokeShare, EMPTY)

  // `existingLink` is the single source of truth for shared-or-not. Both actions call
  // revalidatePath, so the server re-renders this component with the correct value after
  // every mint and every revoke — there is no need to reconcile client-side action state
  // against it. The action results are consulted only for their error messages.
  const link = existingLink
  const error = minted.error ?? revoked.error

  // Gate on `link` — the server's source of truth — so a mint-then-revoke sequence reads correctly:
  // `minted.status` is still 'created' at that point, but `link` is null, so that branch is skipped
  // and the region says "revoked".
  //
  // On first paint of a page that already has a share link both statuses are 'idle', so nothing is
  // announced on load. The first-mount problem is solved by construction, with no guard.
  //
  // Why not a useRef previous-value guard: it fires on any re-render where the prop changes,
  // including unrelated revalidations of the same path, and it would still need an explicit
  // first-mount guard. The discriminator is exact — set by the action that actually ran.
  const announcement = link
    ? minted.status === 'created'
      ? 'Share link created.'
      : null
    : revoked.status === 'revoked'
      ? 'Share link revoked.'
      : null

  return (
    <div className="flex flex-col gap-2">
      {link ? (
        <>
          <p className="font-body text-sm text-ink-soft">
            Anyone with this link can read this report until it expires.
          </p>
          <code className="font-body break-all rounded border border-line bg-paper p-2 text-sm text-ink">
            {link}
          </code>
          <form action={revokeAction}>
            <input type="hidden" name="church_id" value={churchId} />
            <input type="hidden" name="run_id" value={runId} />
            <button
              type="submit"
              disabled={revoking}
              className="py-1.5 font-body text-sm text-ink-soft underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {revoking ? 'Revoking…' : 'Revoke share link'}
            </button>
          </form>
        </>
      ) : (
        <form action={mintAction}>
          <input type="hidden" name="church_id" value={churchId} />
          <input type="hidden" name="run_id" value={runId} />
          <button
            type="submit"
            disabled={minting}
            className="py-1.5 font-body text-sm text-ink-soft underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {minting ? 'Creating…' : 'Create share link'}
          </button>
        </form>
      )}

      <LiveStatus message={error} tone="error" className="font-body text-sm text-ink" />
      <LiveStatus message={announcement} tone="status" className="sr-only" />
    </div>
  )
}
