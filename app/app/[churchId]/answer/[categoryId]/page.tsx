import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireChurchMembership } from '@/lib/auth/require-church-membership'
import { currentRun, canAcceptAnswers } from '@/lib/runs/current-run'
import { closedReadOnlyCopy } from '@/lib/runs/close-reopen'
import { sectionNav } from '@/lib/review/section-nav'
import { loadMethodology } from '@/lib/methodology/load'
import { effectiveMethodologyForRun } from '@/lib/methodology/effective'
import { SelfForm } from './self-form'
import { AnonymityNote } from '@/components/anonymity-note'

export default async function AnswerPage({
  params,
}: {
  params: Promise<{ churchId: string; categoryId: string }>
}) {
  const { churchId, categoryId } = await params
  const supabase = await createClient()

  // Permission wall: church must be visible (RLS) AND the caller must hold a church_members row
  // (defense-in-depth — no longer RLS-only). An unauthenticated deep link is sent to sign-in with a
  // next back to this page.
  await requireChurchMembership(supabase, churchId, {
    signInNext: `/app/${churchId}/answer/${categoryId}`,
  })

  // The run's edition governs which items this member is ever offered (owner ruling, 2026-08-08):
  // assessment_runs.methodology_version is stamped once at church creation and never updated (ADR
  // 0001 — exactly one run per church), so a pre-0.3.0 run must never serve the 10 outreach items —
  // any reflection written on one would be stored and then never render anywhere
  // (effectiveMethodologyForRun already excludes them from SCORING, lib/report/derive.ts; this
  // closes the matching gap on what's SERVED). Resolved status-agnostically here; `writable` below
  // is a separate, later concern over this SAME run.
  const run = await currentRun(supabase, churchId)
  const methodology = loadMethodology()
  const effectiveMethodology = effectiveMethodologyForRun(methodology, run?.methodology_version ?? null)
  const category = effectiveMethodology.questions.categories.find((c) => c.id === categoryId)
  if (!category) notFound()

  const items = category.items.map((i) => ({ id: i.id, text: i.text, anchors: i.anchors, reflection: i.reflection }))

  // Resume: pull the caller's OWN saved answers for this category (own-data only; responses stays
  // default-deny — the read goes through the security-definer RPC). Empty on the first visit. A row
  // for an item outside the effective list above (possible if this run once offered it before the
  // owner ruling — the outreach items were servable from Task 3 until this fix) is simply never
  // looked up by id anywhere below: harmless, never rendered, never blocks resume.
  const { data: savedRows, error: savedError } = await supabase.rpc('get_my_category_answers', {
    p_church_id: churchId,
    p_category_id: categoryId,
  })
  if (savedError) throw savedError
  const initialValues: Record<string, number> = {}
  const initialReflections: Record<string, string> = {}
  for (const row of (savedRows ?? []) as { item_id: string; value: number; reflection: string | null }[]) {
    initialValues[row.item_id] = row.value
    if (row.reflection) initialReflections[row.item_id] = row.reflection
  }

  // Review-only once an admin has CLOSED the run (close_run, ADR 0003 — reversible via reopen_run;
  // amends ADR 0001's terminal completion). Gate the editable form on the named write policy —
  // rendering SelfForm on a closed run is exactly what produced the "no active run" write throw on
  // the old "Take Again" path.
  const writable = canAcceptAnswers(run)
  // Categories themselves are invariant across editions (effectiveMethodologyForRun only ever drops
  // items, never categories), so prev/next section navigation is correct off the raw methodology.
  const nav = sectionNav(methodology.questions.categories, categoryId)

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-6 py-12">
      <Link
        href={`/app/${churchId}`}
        className="py-1.5 font-body text-sm text-ink-soft underline underline-offset-2 hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        ← Back to menu
      </Link>
      {writable ? (
        <>
          <AnonymityNote />
          <SelfForm
            churchId={churchId}
            categoryId={categoryId}
            categoryName={category.name}
            items={items}
            initialValues={initialValues}
            initialReflections={initialReflections}
          />
        </>
      ) : (
        <section aria-labelledby="review-heading" className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            {nav.index >= 0 && (
              <p className="font-body text-xs uppercase tracking-wide text-ink-soft">
                Area {nav.index + 1} of {nav.total}
              </p>
            )}
            <h1 id="review-heading" className="font-display text-2xl text-ink">
              {category.name}
            </h1>
            <p className="font-body text-sm text-ink-soft">
              {run?.closed_at
                ? closedReadOnlyCopy(run.closed_at)
                : 'This assessment is complete, so your answers are read-only.'}
            </p>
          </div>
          <ol className="flex flex-col gap-4">
            {items.map((item) => (
              <li key={item.id} className="flex flex-col gap-1 border-b border-line pb-4">
                <p className="font-body text-sm text-ink">{item.text}</p>
                <p className="font-display text-lg text-ink">
                  {item.id in initialValues ? initialValues[item.id] : '—'}
                </p>
              </li>
            ))}
          </ol>
          {(nav.prev || nav.next) && (
            <nav aria-label="Review sections" className="flex items-center justify-between gap-4 pt-2">
              {nav.prev ? (
                <Link
                  href={`/app/${churchId}/answer/${nav.prev.id}`}
                  className="rounded-md border border-line px-3 py-1.5 font-body text-sm text-ink transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  ← {nav.prev.name}
                </Link>
              ) : (
                <span />
              )}
              {nav.next ? (
                <Link
                  href={`/app/${churchId}/answer/${nav.next.id}`}
                  className="rounded-md border border-line px-3 py-1.5 font-body text-sm text-ink transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  {nav.next.name} →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </section>
      )}
    </main>
  )
}
