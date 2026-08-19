'use client'

import { useState, useTransition } from 'react'
import { generateDiagnosis } from './actions'
import { LiveStatus } from '@/components/live-status'
import { regenerateBlockedText } from '@/lib/runs/close-reopen'

const ENABLED =
  'rounded-md border border-line bg-ink px-3 py-1.5 font-body text-sm text-paper transition-opacity hover:opacity-90 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const BLOCKED =
  'cursor-not-allowed rounded-md border border-line px-3 py-1.5 font-body text-sm text-ink-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

/**
 * Admin-only "Regenerate diagnosis" (ADR 0003 follow-up). Rendered by the dashboard ONLY when the
 * run has been REOPENED (status 'in_progress') and a diagnosis already exists — i.e. members may be
 * changing answers under a report that no longer reflects them. Same shape as generate-button.tsx
 * and it re-runs the SAME generateDiagnosis server action (scores + report; on success the action
 * redirects to the diagnosis page, so this never navigates itself).
 *
 * Ready ⇔ every invited member has finished every area: finishedMemberCount(matrix).finished ===
 * total, the exact N-of-M the Close confirm shows. total > 0 is required so an empty roster can't
 * satisfy it vacuously. Not ready → aria-disabled (never native `disabled`: a11y pending-controls
 * contract, tests/a11y/pending-controls.test.ts) with the inline note, and the click returns before
 * the action. `if (pending) return` and `if (!ready) return` are two SEPARATE statements on purpose:
 * that census recognises `if (<word>) return` guards and counts them per file.
 */
export function RegenerateDiagnosisButton({
  churchId,
  finished,
  total,
}: {
  churchId: string
  finished: number
  total: number
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const ready = total > 0 && finished === total

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        aria-disabled={pending || !ready}
        onClick={() => {
          if (pending) return
          if (!ready) return
          startTransition(async () => {
            setError(null)
            const res = await generateDiagnosis(churchId)
            // On success the action redirects (throws NEXT_REDIRECT) and this never runs;
            // only the { ok:false } error path returns a value.
            if (res && !res.ok) setError(res.error ?? 'Something went wrong.')
          })
        }}
        className={ready ? ENABLED : BLOCKED}
      >
        {pending ? 'Regenerating…' : 'Regenerate diagnosis'}
        {!ready && <span className="text-xs"> ({regenerateBlockedText(finished, total)})</span>}
      </button>
      <LiveStatus message={error} tone="error" className="font-body text-sm text-berry" />
    </div>
  )
}
