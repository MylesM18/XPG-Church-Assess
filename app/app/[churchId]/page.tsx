import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadChurchForMember } from '@/lib/data/churches'
import { churchMembers, memberDeadline } from '@/lib/data/members'
import {
  completionWindowState, completionBannerText,
  inviteWindowState, inviteBannerText, type InviteWindow,
} from '@/lib/deadlines/countdown'
import { earliestInviteAt } from '@/lib/data/invitations'
import { DeadlineBanner } from '@/components/deadline-banner'
import { loadMethodology } from '@/lib/methodology/load'
import { effectiveMethodologyForRun } from '@/lib/methodology/effective'
import { resolveBrand } from '@/lib/brand/resolve'
import { coverage, type CoverageRow, type CoverageStatus } from '@/lib/coverage/coverage'
import { assessmentCta } from '@/lib/coverage/assessment-cta'
import { diagnosisGateFromMatrix } from '@/lib/coverage/diagnosis-gate'
import { isExemptMember } from '@/lib/coverage/exemption'
import { ChainGlyph } from './chain-glyph'
import { GenerateButton } from './generate-button'
import { CloseReopenControls } from './close-reopen-controls'
import { RefreshOnFocus } from './refresh-on-focus'
import { InviteMemberForm } from './access/invite-member-form'
import { buildMemberMatrix, type MatrixMember, type MemberCategoryCoverageRow, type MemberMatrixRow } from '@/lib/coverage/member-matrix'
import { partialNudges } from '@/lib/coverage/partial-nudge'
import { finishedMemberCount } from '@/lib/coverage/finished-members'
import { MemberCoverageMatrix } from './member-coverage-matrix'
import { AnonymityNote } from '@/components/anonymity-note'

/** Report generation runs inside a Server Action on this segment: 7 concurrent model calls,
 *  worst case two rounds. Measured worst case is 181 s (docs/superpowers/plans/
 *  2026-08-17-2a-measurements.md); on Vercel Pro the fluid default is already 300 s, so this
 *  export is numerically identical to what was in force — it changes nothing today. It is here
 *  to PIN that value: the ceiling survives a plan or platform-default change, and is positively
 *  verifiable in .next/server/functions-config-manifest.json. It matters because exceeding it
 *  kills the Server Action OUTSIDE the try/catch in actions.ts, so save_report never runs and
 *  nothing at all is persisted — strictly worse than a 100%-fallback report. */
export const maxDuration = 300

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

  const { data: { user } } = await supabase.auth.getUser()
  const { church, role } = await loadChurchForMember(supabase, churchId, user?.id ?? '')
  if (!church) notFound()
  const isAdmin = role === 'admin'

  const now = new Date()
  const deadlineAt = await memberDeadline(supabase, churchId, user?.id ?? '')
  const completion = completionWindowState(deadlineAt ? new Date(deadlineAt) : null, now)
  const completionText = completionBannerText(completion)

  let inviteWindow: InviteWindow | null = null
  if (isAdmin) {
    const earliest = await earliestInviteAt(supabase, churchId)
    inviteWindow = inviteWindowState(earliest ? new Date(earliest) : null, now)
  }
  const inviteText = inviteWindow ? inviteBannerText(inviteWindow) : null

  // Run fetch, hoisted above the coverage RPC: RLS runs_select lets any church member (admin or
  // viewer) read it, so this is legitimate for both roles. methodology_version feeds the exemption
  // check below; `id` is reused by the admin hasDiagnosis probe further down instead of a second,
  // duplicate select; status + closed_at feed the admin Close / Reopen control (ADR 0003).
  const { data: run } = await supabase
    .from('assessment_runs')
    .select('id, methodology_version, status, closed_at')
    .eq('church_id', churchId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

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

  // Task 2's pre-0.3.0 item list for THIS run: a property of the shared church run
  // (assessment_runs is one row per church — 20260727000100), not of whichever user is viewing
  // the page. Safe to reuse unconditionally for every roster member in the matrix below — every
  // member's OWN exemption (opts.isExempt there) now resolves to this SAME run-level fact.
  // effectiveMethodologyForRun no-ops (returns the SAME categories reference) when the run
  // doesn't predate 0.3.0.
  const runEffectiveCategories = effectiveMethodologyForRun(methodology, run?.methodology_version ?? null).questions.categories

  // "Old edition, old test" (lib/coverage/exemption.ts): exemption is a fact about the shared
  // church run, not about the CURRENT user's own deadline (owner ruling, 2026-08-08) — the answer
  // page never serves the outreach items to any member of a pre-0.3.0 run, open window or closed,
  // so there is no longer a "still has time to answer them" case a deadline could distinguish.
  // Gates the viewer's own progress views (header count, whole-assessment CTA, per-card counters)
  // ONLY. The admin church-wide header/dots/gate below deliberately stay on the full `categories`
  // — an accepted conservative mismatch — and the matrix below applies this SAME run-level fact to
  // every roster member via opts.isExempt, never gated by whichever admin/viewer is looking.
  const exempt = isExemptMember(run?.methodology_version ?? null)
  const exemptAwareCats = exempt ? runEffectiveCategories : categories

  // Admin: church-wide result, never exempted (drives the header, status dots, and diagnosis
  // gate below). Viewer: own result, exempt-aware — this IS their own progress.
  const result = isAdmin ? coverage(rows, runEffectiveCategories) : coverage(rows, exemptAwareCats)

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
    ctaResult = coverage((memberCoverageData ?? []) as CoverageRow[], exemptAwareCats)
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
  // Per-card denominator, exempt-aware: the CURRENT user's own total, not always the full item
  // count (Task 20's totals.get(cat.id) ?? cat.items.length fallback landmine — deriving this
  // from exemptAwareCats rather than hand-assembling it is what keeps that fallback dead here).
  const ownTotalById = new Map(exemptAwareCats.map((c) => [c.id, c.items.length]))

  // Admin-only Member × Category matrix (RPC is admin-gated).
  let memberMatrix: MemberMatrixRow[] = []
  if (isAdmin) {
    const rosterRows = await churchMembers<MatrixMember>(supabase, churchId)
    const { data: matrixRows } = await supabase.rpc('get_member_category_coverage', { p_church_id: churchId })
    memberMatrix = buildMemberMatrix(
      rosterRows,
      (matrixRows ?? []) as MemberCategoryCoverageRow[],
      categories,
      {
        isExempt: () => isExemptMember(run?.methodology_version ?? null),
        effectiveCategories: runEffectiveCategories,
      },
    )
  }

  // "N of M members have finished" for the Close confirm (ADR 0003): a member has finished when
  // every cell in their matrix row is 'covered' — the per-member notion assessmentCta maps to
  // 'complete'. Viewers get an empty matrix (0 of 0), but the control never renders for them.
  const finishedMembers = finishedMemberCount(memberMatrix)

  // Mirrors the server-side diagnosisGate() in actions.ts: an area is only covered if some ONE
  // member finished every item in it, not merely that the area has responses somewhere across
  // the church. This page only has coverage RPCs, not raw responses, so it reads the same
  // "covered" cells the member matrix below already renders, rather than recomputing fit.n.
  const dashboardGate = diagnosisGateFromMatrix(memberMatrix, categories)
  const blockedAreaNames = dashboardGate.blockedAreas
    .map((id) => categories.find((c) => c.id === id)?.name ?? id)
    .join(', ')

  // A partial respondent (started an area, didn't finish it) is dropped from that area's score,
  // not down-weighted (spec §4.5) — so the admin should know what it cost. Derived from the
  // member matrix rather than the diagnosis, so it shows up before a diagnosis exists.
  const partialNudgeRows = partialNudges(memberMatrix, categories).map((n) => ({
    ...n,
    name: categories.find((c) => c.id === n.category_id)?.name ?? n.category_id,
  }))

  let hasDiagnosis = false
  if (isAdmin && run) {
    const { data: diagRows } = await supabase
      .from('diagnoses')
      .select('id')
      .eq('run_id', run.id)
      .limit(1)
    hasDiagnosis = (diagRows?.length ?? 0) > 0
  }

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-6 py-10">
      <RefreshOnFocus />
      {completionText && (
        <DeadlineBanner text={completionText} tone={completion.open ? 'info' : 'closed'} />
      )}
      {inviteWindow && inviteText && (
        <DeadlineBanner text={inviteText} tone={inviteWindow.open ? 'info' : 'closed'} />
      )}
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
        <form action="/auth/signout" method="post" className="ml-auto">
          <button
            type="submit"
            className="rounded-md border border-line px-3 py-1.5 font-body text-sm text-ink-soft transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Sign out
          </button>
        </form>
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
        <AnonymityNote variant="short" className="mt-3 max-w-prose" />
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
                {ownAnsweredById.get(cat.id) ?? 0} out of {ownTotalById.get(cat.id) ?? cat.items.length} Questions
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
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-line bg-ink px-3 py-1.5 font-body text-sm text-paper transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              View diagnosis <span aria-hidden="true">↗</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </Link>
          ) : dashboardGate.ok ? (
            <GenerateButton churchId={churchId} />
          ) : (
            <button
              type="button"
              aria-disabled="true"
              className="cursor-not-allowed rounded-md border border-line px-3 py-1.5 font-body text-sm text-ink-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Generate diagnosis{' '}
              <span className="text-xs">
                (Every area needs at least one person who answered all its questions. Still waiting on: {blockedAreaNames}.)
              </span>
            </button>
          )
        )}

        {isAdmin && run && (
          <CloseReopenControls
            churchId={churchId}
            status={run.status}
            closedAt={run.closed_at}
            finished={finishedMembers.finished}
            total={finishedMembers.total}
          />
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
          {inviteWindow && <InviteMemberForm churchId={churchId} inviteWindow={inviteWindow} />}
        </section>
      )}

      {isAdmin && (
        <MemberCoverageMatrix matrix={memberMatrix} categories={categories} currentUserId={user?.id ?? null} />
      )}

      {isAdmin && partialNudgeRows.length > 0 && (
        <div className="flex flex-col gap-1">
          {partialNudgeRows.map((n) => (
            <p key={n.category_id} className="font-body text-sm text-ink-soft">
              {n.count === 1
                ? `1 person has unfinished answers in ${n.name} that aren't counting.`
                : `${n.count} people have unfinished answers in ${n.name} that aren't counting.`}
            </p>
          ))}
        </div>
      )}
    </main>
  )
}
