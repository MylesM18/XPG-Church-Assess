'use client'

import { useEffect, useState, useTransition } from 'react'
import { LiveStatus } from '@/components/live-status'
import {
  initialWaitState,
  revealWords,
  stepWaitState,
  waitDelayMs,
  type WaitPhraseState,
} from '@/lib/report/wait-phrases'

const BUTTON =
  'self-start py-1.5 font-body text-sm text-ink underline underline-offset-4 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const SPINNER =
  'mr-2 inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-line border-t-ink align-[-1px]'

/**
 * The diagnosis page's Generate / Regenerate report control (fix/prose-auto-generate-on-view,
 * hardened in fix/auto-generate-hardening, given its wait experience in
 * feat/report-wait-experience). page.tsx mounts one inside each notice block when
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
 * so a click during the model round cannot start a second, concurrent run that no dedup can
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
 * THE WAIT (feat/report-wait-experience). Generation takes ~45-60 s in the common case and up to
 * ~3.5 min at the fan-out's worst, so the control shows a spinner and reveals a rotating line of
 * reassurance word by word beneath it. Two rules govern that layer:
 *
 *  1. It is DECORATIVE — `aria-hidden` throughout. The one thing a screen reader hears is the
 *     stable "Writing your report with the model…" in <LiveStatus> (role="status" ⇒ aria-live
 *     polite), always mounted, never behind `pending &&`, because a region inserted at the same
 *     moment as its first message is silently missed. A rotating string in that region would
 *     re-announce on every word, which is worse than the problem it solves.
 *  2. The arithmetic lives in lib/report/wait-phrases.ts, which is pure and unit-tested — this
 *     repo has no jsdom/RTL, so logic left inline here could not be tested at all. The spinner is
 *     CSS-animated, which app/globals.css already stops under prefers-reduced-motion; the reveal
 *     is a setTimeout chain, which CSS cannot stop, so it checks the media query itself and shows
 *     each line whole instead of typing it.
 *
 * `phrases` comes from the server (lib/data/wait-phrases.ts reads `report_wait_phrases`, falling
 * back to the shipped defaults) — the client never touches the table.
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

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function AutoGenerateReport({
  churchId,
  inputsHash,
  action,
  label,
  auto,
  phrases,
}: {
  churchId: string
  inputsHash: string
  action: (formData: FormData) => Promise<void>
  label: 'Generate report' | 'Regenerate report'
  auto: boolean
  phrases: readonly string[]
}) {
  const [pending, startTransition] = useTransition()
  // Read once, lazily: it cannot differ between server and client render here because nothing
  // below depends on it until `pending` is true, which only a client interaction can make so.
  const [reduced] = useState(prefersReducedMotion)
  // Lazy initializer rather than a reset inside the auto effect: an auto-run fires on mount, when
  // this is already the starting state, and a synchronous setState in an effect costs a cascading
  // render (eslint react-hooks). The manual path resets in its own handler, where that is free.
  const [wait, setWait] = useState<WaitPhraseState>(() => initialWaitState(phrases, reduced))

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

  // The reveal: one self-rescheduling timeout, cleaned up on every re-run so a finished report
  // never leaves a timer ticking behind the unmounted notice.
  useEffect(() => {
    if (!pending || phrases.length === 0) return
    const timer = setTimeout(
      () => setWait((current) => stepWaitState(current, phrases, reduced)),
      waitDelayMs(wait, phrases, reduced),
    )
    return () => clearTimeout(timer)
  }, [pending, phrases, reduced, wait])

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        aria-disabled={pending}
        onClick={() => {
          if (pending) return
          // Restart the reveal rather than resuming mid-sentence from the previous run.
          setWait(initialWaitState(phrases, reduced))
          startTransition(() => invoke(action, churchId, false))
        }}
        className={BUTTON}
      >
        {pending && <span aria-hidden="true" className={SPINNER} />}
        {pending ? 'Writing…' : label}
      </button>
      {pending && (
        <p
          aria-hidden="true"
          className="min-h-[1.6em] font-body text-base leading-[1.6] text-ink-soft"
        >
          {revealWords(phrases[wait.phrase] ?? '', wait.words)}
        </p>
      )}
      <LiveStatus
        tone="status"
        message={pending ? 'Writing your report with the model…' : null}
        className="font-body text-base leading-[1.6] text-ink-soft"
      />
    </div>
  )
}
