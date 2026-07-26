import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireChurchMembership } from '@/lib/auth/require-church-membership'
import { loadMethodology } from '@/lib/methodology/load'
import { coverage, type CoverageRow } from '@/lib/coverage/coverage'

export default async function DonePage({
  params,
}: {
  params: Promise<{ churchId: string }>
}) {
  const { churchId } = await params
  const supabase = await createClient()

  // Church + membership permission wall. No signInNext ⇒ an unauthenticated / non-member deep link
  // gets notFound() (never a sign-in redirect) — /done's behavior is unchanged.
  await requireChurchMembership(supabase, churchId)

  // Completion guard: this screen is only reachable once the CALLER has personally covered every
  // category. Own coverage comes from the security-definer RPC (responses stays default-deny). Anyone
  // landing here early — deep link, refresh mid-assessment — is bounced back to the dashboard.
  const { data: coverageData, error: coverageError } = await supabase.rpc('get_member_run_coverage', {
    p_church_id: churchId,
  })
  if (coverageError) throw coverageError
  const rows = (coverageData ?? []) as CoverageRow[]

  const categories = loadMethodology().questions.categories
  const result = coverage(rows, categories)
  if (result.coveredCount !== categories.length) redirect(`/app/${churchId}`)

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-6 py-12">
      <h1 className="font-display text-2xl text-ink">Thank you for completing the assessment.</h1>
      <p className="font-body text-sm text-ink-soft">
        {"Your responses go to your church's exec team, who use this assessment to strengthen the overall health and embodiment of your church."}
      </p>
      <p className="font-body text-sm text-ink-soft">
        {"We've let your church execs know you've completed the assessment — so nothing further is needed from you."}
      </p>
      <Link
        href={`/app/${churchId}`}
        className="inline-block self-start rounded-md border border-line bg-ink px-4 py-2 font-body text-sm text-paper transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        Back to your dashboard
      </Link>
    </main>
  )
}
