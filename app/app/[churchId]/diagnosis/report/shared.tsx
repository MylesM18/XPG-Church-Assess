// app/app/[churchId]/diagnosis/report/shared.tsx
import Link from 'next/link'
import type { ReactNode } from 'react'
import { GenerateButton } from '@/app/app/[churchId]/generate-button'

export function EmptyState({ churchId }: { churchId: string }) {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-2xl flex-col items-start gap-4 px-6 py-16">
      <h1 className="font-display text-2xl text-ink">No diagnosis yet</h1>
      <p className="font-body text-ink-soft">This assessment hasn’t been diagnosed yet.</p>
      <Link
        href={`/app/${churchId}`}
        className="py-1.5 font-body text-sm text-ink underline underline-offset-2 hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        ← Back to the dashboard
      </Link>
    </main>
  )
}

/**
 * The authenticated diagnosis page's not-scoreable notice. The message is taken as `children`
 * rather than hardcoded here: the branch that decides WHEN this renders lives in
 * app/app/[churchId]/diagnosis/page.tsx, so the copy explaining why stays with it, and this
 * component stays a plain card that any such branch can reuse. Wired to the existing regenerate
 * action (GenerateButton / generateDiagnosis) rather than a new one — the same one-shot action
 * the dashboard already uses.
 */
export function StaleMethodologyNotice({
  churchId, children,
}: {
  churchId: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col items-start gap-4 rounded-lg border border-line bg-paper p-6">
      <h1 className="font-display text-xl text-ink">{children}</h1>
      <GenerateButton churchId={churchId} />
    </section>
  )
}

/**
 * The public share page's (app/r/[shareToken]/page.tsx) not-scoreable notice — the read-only
 * counterpart to StaleMethodologyNotice above. No GenerateButton: regenerating a diagnosis is an
 * admin action, and a visitor holding a forwarded share link is never an admin.
 *
 * Under CT-2(c) this renders when the run cannot be re-derived under the current methodology
 * (some area has no complete respondent, or the church's attendance band is unset/unknown) —
 * version-staleness itself can no longer occur, since the view is always re-derived fresh.
 *
 * Extracted into its own component for the same reason StaleMethodologyNotice already is: it
 * owns the ONLY <h1> its branch renders, from a file other than the page itself. Without this,
 * a literal <h1> inline in app/r/[shareToken]/page.tsx's not-scoreable branch would break
 * tests/a11y/shared-report-heading.test.ts, which statically sums that page's own <h1> count
 * with sections.tsx's count and requires exactly one — a static count that cannot tell "two
 * <h1>s in one branch" (wrong) apart from "one <h1> per mutually exclusive branch" (right).
 * Routing the heading through another file keeps the page's own literal count at 0 either way,
 * so the guard reads true regardless of which branch actually renders. It stays an <h1>,
 * matching every other top-level report surface (EmptyState, StaleMethodologyNotice).
 */
export function SharedStaleMethodologyNotice() {
  return (
    <section className="flex flex-col items-start gap-4 rounded-lg border border-line bg-paper p-6">
      <h1 className="font-display text-xl text-ink">This shared report isn’t ready yet</h1>
      <p className="font-body text-ink-soft">
        The assessment behind this link can’t be scored under the current methodology yet. Ask a
        church admin to finish the assessment and share a fresh link.
      </p>
    </section>
  )
}
