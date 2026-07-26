import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadMethodology } from '@/lib/methodology/load'
import { resolveBrand } from '@/lib/brand/resolve'
import { coverage, type CoverageRow, type CoverageStatus } from '@/lib/coverage/coverage'
import { assessmentCta } from '@/lib/coverage/assessment-cta'
import { ChainGlyph } from './chain-glyph'
import { GenerateButton } from './generate-button'
import { RefreshOnFocus } from './refresh-on-focus'
import { InviteMemberForm } from './access/invite-member-form'
import { buildMemberMatrix, type MatrixMember, type MemberCategoryCoverageRow, type MemberMatrixRow } from '@/lib/coverage/member-matrix'
import { MemberCoverageMatrix } from './member-coverage-matrix'

function gatesLabel(gates: 'all' | string[] | undefined): string {
  if (gates === 'all') return 'all stages'
  if (Array.isArray(gates)) return gates.join(', ')
  return '—'
}

const STATUS_LABEL: Record<CoverageStatus, string> = {
  not_started: 'Not started',
  partial: 'In progress',
  covered: 'Completed',
}

// Traffic-light dot beside each status word. Decorative (aria-hidden) — STATUS_LABEL carries
// the meaning, so colour is never the sole signal. Tokens live in app/globals.css @theme.
const STATUS_DOT: Record<CoverageStatus, string> = {
  not_started: 'bg-status-red',
  partial: 'bg-status-amber',
  covered: 'bg-status-green',
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ churchId: string }>
}) {
  const { churchId } = await params
  const supabase = await createClient()

  const { data: church, error } = await supabase
    .from('churches')
    .select('id, name, brand_color')
    .eq('id', churchId)
    .maybeSingle()
  if (error) throw error
  if (!church) notFound()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: membership } = await supabase
    .from('church_members')
    .select('role')
    .eq('church_id', churchId)
    .eq('user_id', user?.id ?? '')
    .maybeSingle()
  const role = membership?.role ?? null
  const isAdmin = role === 'admin'

  // Admins read the church-wide aggregate (needed to gate diagnosis generation on all-8-covered)
  // for the header, status dots, and gate below; viewers read their OWN coverage, which drives
  // everything for them. Admins additionally fetch their own coverage further down for the CTA.
  const { data: coverageData, error: coverageError } = await supabase.rpc(
    isAdmin ? 'get_run_coverage' : 'get_member_run_coverage',
    { p_church_id: churchId },
  )
  if (coverageError) throw coverageError
  const rows = (coverageData ?? []) as CoverageRow[]

  const methodology = loadMethodology()
  const brand = resolveBrand(church.name)
  const categories = methodology.questions.categories
  const enablers = methodology.rules.enablers

  const result = coverage(rows, categories)

  // The whole-assessment CTA always reflects the CURRENT user's own progress, so an admin
  // resumes where THEY left off. Church-wide coverage still drives the header, the status
  // dots, and the diagnosis-generation gate below.
  let ctaResult = result
  if (isAdmin) {
    const { data: memberCoverageData, error: memberCoverageError } = await supabase.rpc(
      'get_member_run_coverage',
      { p_church_id: churchId },
    )
    if (memberCoverageError) throw memberCoverageError
    ctaResult = coverage((memberCoverageData ?? []) as CoverageRow[], categories)
  }
  const cta = assessmentCta(ctaResult, categories)
  const statusById = new Map(result.categories.map((c) => [c.category_id, c.status]))
  const anyStarted = result.categories.some((c) => c.status !== 'not_started')
  const progressState = anyStarted ? 'Assessment in progress' : 'Assessment not started'
  const header = isAdmin
    ? `${progressState} · ${result.coveredCount} of ${categories.length} areas`
    : `${progressState} · You've completed ${result.coveredCount} of ${categories.length} areas`

  // The per-card counter always reflects the CURRENT user's own answers: viewers use `result`
  // (their get_member_run_coverage), admins use `ctaResult` (their own refetch). The card's dot
  // stays church-wide for admins (see status dot below), by design.
  const ownCoverage = isAdmin ? ctaResult : result
  const ownAnsweredById = new Map(ownCoverage.categories.map((c) => [c.category_id, c.answeredCount]))

  // Admin-only Member × Category matrix (RPC is admin-gated).
  let memberMatrix: MemberMatrixRow[] = []
  if (isAdmin) {
    const { data: rosterRows } = await supabase.rpc('get_church_members', { p_church_id: churchId })
    const { data: matrixRows } = await supabase.rpc('get_member_category_coverage', { p_church_id: churchId })
    memberMatrix = buildMemberMatrix(
      (rosterRows ?? []) as MatrixMember[],
      (matrixRows ?? []) as MemberCategoryCoverageRow[],
      categories,
    )
  }

  let hasDiagnosis = false
  if (isAdmin) {
    const { data: run } = await supabase
      .from('assessment_runs')
      .select('id')
      .eq('church_id', churchId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (run) {
      const { data: diagRows } = await supabase
        .from('diagnoses')
        .select('id')
        .eq('run_id', run.id)
        .limit(1)
      hasDiagnosis = (diagRows?.length ?? 0) > 0
    }
  }

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-6 py-10">
      <RefreshOnFocus />
      <header className="flex items-center gap-4">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-md font-display text-xl text-white"
          style={{ backgroundColor: church.brand_color }}
        >
          {brand.monogram}
        </div>
        <div>
          <h1 className="font-display text-2xl text-ink">{church.name}</h1>
          <p className="font-body text-sm text-ink-soft">{header}</p>
        </div>
      </header>

      <section>
        <Link
          href={`/app/${churchId}/answer/${cta.targetCategoryId}`}
          className="inline-block rounded-md border border-line bg-ink px-4 py-2 font-body text-sm text-paper transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {cta.label}
        </Link>
        <p className="mt-3 max-w-prose font-body text-sm text-ink-soft">
          {"Please complete the assessment for each category. We encourage you to provide honest and thoughtful feedback, as your responses will help us gain an accurate understanding of the church's overall health and well-being."}
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {categories.map((cat) => {
          const status = statusById.get(cat.id) ?? 'not_started'
          return (
            <article key={cat.id} className="rounded-lg border border-line bg-paper p-4">
              <h2 className="font-display text-lg text-ink">{cat.name}</h2>
              <div className="mt-2">
                {cat.position !== null ? (
                  <ChainGlyph position={cat.position} />
                ) : (
                  <span className="font-body text-xs text-sage">
                    Enabler · gates {gatesLabel(enablers[cat.id]?.gates)}
                  </span>
                )}
              </div>
              <p className="mt-3 flex items-center gap-2 font-body text-sm text-ink-soft">
                <span
                  aria-hidden="true"
                  className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT[status]}`}
                />
                {STATUS_LABEL[status]}
              </p>
              <p className="mt-2 text-right font-body text-xs text-ink-soft">
                {ownAnsweredById.get(cat.id) ?? 0} out of {cat.items.length} Questions
              </p>
            </article>
          )
        })}
      </section>

      <section className="flex flex-wrap items-start gap-2">
        {isAdmin && (
          hasDiagnosis ? (
            <Link
              href={`/app/${churchId}/diagnosis`}
              className="rounded-md border border-line bg-ink px-3 py-1.5 font-body text-sm text-paper transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              View diagnosis
            </Link>
          ) : result.coveredCount === categories.length ? (
            <GenerateButton churchId={churchId} />
          ) : (
            <button
              type="button"
              aria-disabled="true"
              className="cursor-not-allowed rounded-md border border-line px-3 py-1.5 font-body text-sm text-ink-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Generate diagnosis{' '}
              <span className="text-xs">
                (
                {result.coveredCount < categories.length
                  ? `Answer all 8 areas first — ${result.coveredCount} of ${categories.length}`
                  : 'Admins can generate the diagnosis'}
                )
              </span>
            </button>
          )
        )}

        {role === 'admin' && (
          <Link
            href={`/app/${churchId}/access`}
            className="rounded-md border border-line bg-ink px-3 py-1.5 font-body text-sm text-paper transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Manage access
          </Link>
        )}
      </section>

      {isAdmin && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-lg text-ink">Invite Member</h2>
          <p className="font-body text-sm text-ink-soft">
            {"Invite a member or co-admin to help with your church's assessment."}
          </p>
          <InviteMemberForm churchId={churchId} />
        </section>
      )}

      {isAdmin && (
        <MemberCoverageMatrix matrix={memberMatrix} categories={categories} currentUserId={user?.id ?? null} />
      )}
    </main>
  )
}
