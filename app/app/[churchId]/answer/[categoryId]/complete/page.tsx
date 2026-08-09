import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireChurchMembership } from '@/lib/auth/require-church-membership'
import { currentRun } from '@/lib/runs/current-run'
import { loadMethodology } from '@/lib/methodology/load'
import { effectiveMethodologyForRun } from '@/lib/methodology/effective'
import { coverage, type CoverageRow } from '@/lib/coverage/coverage'
import { sectionCompleteNav } from '@/lib/coverage/section-complete'

export default async function SectionCompletePage({
  params,
}: {
  params: Promise<{ churchId: string; categoryId: string }>
}) {
  const { churchId, categoryId } = await params
  const supabase = await createClient()

  // Guards 1–2 — church + membership permission wall (shared with /answer and /done). An
  // unauthenticated deep link is sent to sign-in with a next back to this page.
  await requireChurchMembership(supabase, churchId, {
    signInNext: `/app/${churchId}/answer/${categoryId}/complete`,
  })

  // Guard 3 — categoryId must be a real methodology category. `categories` is the run's EFFECTIVE
  // list (owner ruling, 2026-08-08): the answer page never serves a pre-0.3.0 run's members the 10
  // outreach items, so "complete" must be judged against that SAME filtered list — otherwise a
  // member who finished every item they were ever shown would be measured against a bigger
  // denominator they can structurally never reach, and get bounced right back into the section they
  // just completed. Categories themselves are invariant across editions
  // (effectiveMethodologyForRun only ever drops items, never categories), so this is also safe for
  // the existence check below.
  const run = await currentRun(supabase, churchId)
  const categories = effectiveMethodologyForRun(loadMethodology(), run?.methodology_version ?? null).questions.categories
  if (!categories.some((c) => c.id === categoryId)) notFound()

  // Guard 4 — caller's OWN coverage (security-definer RPC; responses stays default-deny).
  const { data: coverageData, error: coverageError } = await supabase.rpc('get_member_run_coverage', {
    p_church_id: churchId,
  })
  if (coverageError) throw coverageError
  const rows = (coverageData ?? []) as CoverageRow[]
  const result = coverage(rows, categories)

  // Branch on the pure, unit-tested helper. redirect() returns never, so after the two guards
  // TypeScript narrows `nav` to the interstitial variant below.
  const nav = sectionCompleteNav({ completedId: categoryId, result, categories })
  if (nav.action === 'finish-section') redirect(`/app/${churchId}/answer/${nav.targetId}`)
  if (nav.action === 'done') redirect(`/app/${churchId}/done`)

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-6 py-12">
      <h1 className="font-display text-2xl text-ink">{`You've completed ${nav.completedName}.`}</h1>
      <p className="font-body text-sm text-ink-soft">{`Continue to complete ${nav.nextName}.`}</p>
      <div className="flex flex-wrap gap-3">
        <Link
          href={`/app/${churchId}/answer/${categoryId}`}
          className="inline-block rounded-md border border-line px-4 py-2 font-body text-sm text-ink transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Go back
        </Link>
        <Link
          href={`/app/${churchId}/answer/${nav.nextId}`}
          className="inline-block rounded-md border border-line bg-ink px-4 py-2 font-body text-sm text-paper transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Continue
        </Link>
      </div>
    </main>
  )
}
