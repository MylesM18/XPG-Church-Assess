'use client'

import { useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LiveStatus } from '@/components/live-status'

/**
 * Fires the report model AUTOMATICALLY when an admin views the diagnosis (fix/prose-auto-generate-
 * on-view). page.tsx mounts one of these inside each notice block — trigger="stale" beside the
 * Regenerate form, trigger="generate" beside the Generate form — and only when `proseEnabled()`
 * holds, so a disabled model never spends a request. The `action` prop IS `regenerateReport`,
 * passed down from the Server Component: this file deliberately does not import '../actions', so
 * page.tsx keeps its single import of the action (tests/report/web-page-wiring.test.ts).
 *
 * Once per browser session per (church, trigger): a sessionStorage latch is READ first (present ⇒
 * render nothing, do nothing — the manual form beside us is the retry path) and SET synchronously
 * before anything is awaited, so React strict-mode's double effect, a router.refresh(), or a
 * re-render with a new `action` reference cannot fire the model twice. If storage is unavailable
 * (private mode, storage disabled) we do NOT auto-fire: without a latch every view — and every
 * strict-mode double effect — would be an unbounded model spend, and the manual button still works.
 *
 * Pending state is announced through <LiveStatus tone="status"> (role="status" ⇒ aria-live
 * polite), always mounted, never behind `pending &&` — tests/a11y/live-regions-applied.test.ts
 * forbids a conditionally mounted live region because screen readers miss a region inserted at
 * the same moment as its first message.
 */
export function AutoGenerateReport({
  churchId,
  trigger,
  action,
}: {
  churchId: string
  trigger: 'generate' | 'stale'
  action: (formData: FormData) => Promise<void>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    const key = `xpg:autogen:${churchId}:${trigger}`
    try {
      if (window.sessionStorage.getItem(key)) return
      window.sessionStorage.setItem(key, new Date().toISOString())
    } catch {
      return
    }
    startTransition(async () => {
      const fd = new FormData()
      fd.set('churchId', churchId)
      await action(fd)
      router.refresh()
    })
  }, [churchId, trigger, action, router])

  return (
    <LiveStatus
      tone="status"
      message={pending ? 'Writing your report with the model…' : null}
      className="font-body text-base leading-[1.6] text-ink-soft"
    />
  )
}
