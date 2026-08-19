'use client'

import { useState, useTransition } from 'react'
import { closeAssessment, reopenAssessment } from './run-actions'
import { LiveStatus } from '@/components/live-status'
import { closeConfirmText, closedLineText, REOPEN_CONFIRM_TEXT, type RunActionResult } from '@/lib/runs/close-reopen'
import type { RunStatus } from '@/lib/runs/current-run'

const BUTTON =
  'rounded-md border border-line px-3 py-1.5 font-body text-sm text-ink transition-opacity hover:opacity-80 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

/**
 * Admin-only Close / Reopen assessment control (ADR 0003). Confirmation is window.confirm — the app
 * has no dialog primitive and no new deps are allowed; the confirm copy lives in
 * lib/runs/close-reopen.ts so the pages and this component share one source. Same shape as
 * generate-button.tsx: click → transition → server action → inline error through the always-mounted
 * <LiveStatus> (components/live-status.tsx). On success the action revalidates the dashboard, so the
 * page re-renders in the other state; no redirect.
 *
 * Each handler opens with its own `if (pending) return` rather than relying on run()'s: that is the
 * a11y pending-controls contract (tests/a11y/pending-controls.test.ts — aria-disabled, never native
 * `disabled`, plus a guard PER control), and it also stops a second window.confirm from appearing
 * while the first action is still in flight. run() keeps its guard as the shared safety net.
 */
export function CloseReopenControls({
  churchId,
  status,
  closedAt,
  finished,
  total,
}: {
  churchId: string
  status: RunStatus
  closedAt: string | null
  finished: number
  total: number
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const isClosed = status === 'complete'

  function run(action: (id: string) => Promise<RunActionResult>) {
    if (pending) return
    startTransition(async () => {
      setError(null)
      const res = await action(churchId)
      if (!res.ok) setError(res.error)
    })
  }

  return (
    <div className="flex flex-col gap-1">
      {isClosed ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-body text-sm text-ink-soft">{closedLineText(closedAt)}</p>
          <button
            type="button"
            aria-disabled={pending}
            onClick={() => {
              if (pending) return
              if (!window.confirm(REOPEN_CONFIRM_TEXT)) return
              run(reopenAssessment)
            }}
            className={BUTTON}
          >
            {pending ? 'Reopening…' : 'Reopen assessment'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          aria-disabled={pending}
          onClick={() => {
            if (pending) return
            if (!window.confirm(closeConfirmText(finished, total))) return
            run(closeAssessment)
          }}
          className={BUTTON}
        >
          {pending ? 'Closing…' : 'Close assessment'}
        </button>
      )}
      <LiveStatus message={error} tone="error" className="font-body text-sm text-berry" />
    </div>
  )
}
