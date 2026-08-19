'use client'

import { useEffect, useTransition } from 'react'
import { LiveStatus } from '@/components/live-status'

const BUTTON =
  'self-start py-1.5 font-body text-sm text-ink underline underline-offset-4 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

/**
 * The diagnosis page's Generate / Regenerate report control (fix/prose-auto-generate-on-view,
 * hardened in fix/auto-generate-hardening). page.tsx mounts one inside each notice block when
 * `proseEnabled()` holds — beside "predates your latest settings change" as Regenerate, beside
 * "hasn't been written by the model yet" as Generate — so a disabled model never spends a request.
 * The `action` prop IS `regenerateReport`, passed down from the Server Component: this file
 * deliberately does not import '../actions', so page.tsx keeps its single import of the action
 * (tests/report/web-page-wiring.test.ts).
 *
 * Auto-run (`auto`, which the page sets to `!runIsOpen`): once per browser session per (church,
 * INPUTS HASH), the mount effect fires the action itself. The sessionStorage latch is READ first
 * (present ⇒ do nothing) and SET synchronously before anything is awaited, so strict-mode's double
 * effect or a re-render with a new `action` reference cannot fire the model twice. Keyed on the
 * resolver's `inputsHash`, never on which notice mounted us: a NEW hash auto-fires again, the SAME
 * hash never re-fires in a tab session, even after a failure — the button is the retry. Not
 * auto-firing on an open / reopened run is deliberate: there every member submission is a new
 * hash, and view-time generation would regenerate the whole report per submission, bypassing the
 * dashboard's "everyone has finished" gate. Storage unavailable ⇒ no auto-fire (unbounded spend
 * otherwise); the button still works. The auto call carries `auto=1` so the server can back off
 * from ANY row written in its recency window (a fresh all-fallback row = the model just failed);
 * a manual click sends no such flag and bypasses that back-off — it IS the retry.
 *
 * The button is this component's, not a sibling Server-Component form, so it shares `pending`
 * with the auto-run it may have just started: aria-disabled (never native `disabled`, which drops
 * focus to <body> — tests/a11y/pending-controls.test.ts) plus an `if (pending) return` guard,
 * so a click during the ~1 min model round cannot start a second, concurrent run that no dedup can
 * see (nothing is written until a run finishes).
 *
 * `await action(fd)` is guarded. The action itself never throws, but a TRANSPORT failure of the
 * POST — dropped connection, a 504 at the function's duration cap on a long fan-out — rejects the
 * client promise, and React 19 surfaces an unhandled rejection inside a transition to the nearest
 * error boundary; the app has none of its own, so an auto-fired call could replace the whole page
 * with Next's generic error screen on a mere view. Swallowed here; the button is the retry.
 *
 * No router.refresh(): regenerateReport revalidates the diagnosis path itself on every path that
 * changes what the page shows, including a dedup skip (a click from a tab rendered before another
 * tab's write must see the fresh row). A second client-side refresh would only re-render the page
 * twice.
 *
 * Pending state is announced through <LiveStatus tone="status"> (role="status" ⇒ aria-live
 * polite), always mounted, never behind `pending &&` — tests/a11y/live-regions-applied.test.ts
 * forbids a conditionally mounted live region because screen readers miss a region inserted at
 * the same moment as its first message.
 */
async function invoke(action: (formData: FormData) => Promise<void>, churchId: string, auto: boolean): Promise<void> {
  const fd = new FormData()
  fd.set('churchId', churchId)
  if (auto) fd.set('auto', '1')
  try {
    await action(fd)
  } catch {
    // Transport-level failure only (see the header). Nothing to show: the page is unchanged, the
    // button is the retry, and the server logs its own reason if the action ran at all.
  }
}

export function AutoGenerateReport({
  churchId,
  inputsHash,
  action,
  label,
  auto,
}: {
  churchId: string
  inputsHash: string
  action: (formData: FormData) => Promise<void>
  label: 'Generate report' | 'Regenerate report'
  auto: boolean
}) {
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!auto) return
    const key = `xpg:autogen:${churchId}:${inputsHash}`
    try {
      if (window.sessionStorage.getItem(key)) return
      window.sessionStorage.setItem(key, new Date().toISOString())
    } catch {
      return
    }
    startTransition(() => invoke(action, churchId, true))
  }, [auto, churchId, inputsHash, action])

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        aria-disabled={pending}
        onClick={() => {
          if (pending) return
          startTransition(() => invoke(action, churchId, false))
        }}
        className={BUTTON}
      >
        {label}
      </button>
      <LiveStatus
        tone="status"
        message={pending ? 'Writing your report with the model…' : null}
        className="font-body text-base leading-[1.6] text-ink-soft"
      />
    </div>
  )
}
