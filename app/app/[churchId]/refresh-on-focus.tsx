'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Mounted once on the dashboard, which is a Server Component whose per-area status is
 * computed at render time from the get_run_coverage RPC. Self-assessment opens in a new
 * tab (target="_blank"), so when the user switches back to the dashboard tab this calls
 * router.refresh() to re-run the server render and pick up any newly saved answers —
 * advancing a card not_started → In progress → Completed without a manual reload.
 *
 * Keyed to `visibilitychange` + a `visible` guard so it fires on RETURN, not when leaving.
 * Renders nothing.
 */
export function RefreshOnFocus() {
  const router = useRouter()
  useEffect(() => {
    function refreshWhenVisible() {
      if (document.visibilityState === 'visible') router.refresh()
    }
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => document.removeEventListener('visibilitychange', refreshWhenVisible)
  }, [router])
  return null
}
