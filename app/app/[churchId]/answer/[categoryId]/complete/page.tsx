import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadMethodology } from '@/lib/methodology/load'
import { coverage, type CoverageRow } from '@/lib/coverage/coverage'
import { sectionCompleteNav } from '@/lib/coverage/section-complete'

export default async function SectionCompletePage({
  params,
}: {
  params: Promise<{ churchId: string; categoryId: string }>
}) {
  const { churchId, categoryId } = await params
  const supabase = await createClient()

  // Guard 1 — church by id: RLS hides churches the caller isn't a member of → 404;
  // an unauthenticated deep link is sent to sign-in with a next back to this page.
  const { data: church, error } = await supabase
    .from('churches')
    .select('id')
    .eq('id', churchId)
    .maybeSingle()
  if (error) throw error
  if (!church) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect(`/sign-in?next=/app/${churchId}/answer/${categoryId}/complete`)
    notFound()
  }

  // Guard 2 — membership (matches /done): only members reach this screen.
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membership } = await supabase
    .from('church_members')
    .select('role')
    .eq('church_id', churchId)
    .eq('user_id', user?.id ?? '')
    .maybeSingle()
  if (!membership) notFound()

  // Guard 3 — categoryId must be a real methodology category.
  const categories = loadMethodology().questions.categories
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
