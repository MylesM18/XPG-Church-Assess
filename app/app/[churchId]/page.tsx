import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadMethodology } from '@/lib/methodology/load'
import { resolveBrand } from '@/lib/brand/resolve'
import { coverage, type CoverageRow, type CoverageStatus } from '@/lib/coverage/coverage'
import { ChainGlyph } from './chain-glyph'
import { InvitePanel } from './invite-panel'
import { GenerateButton } from './generate-button'

function gatesLabel(gates: 'all' | string[] | undefined): string {
  if (gates === 'all') return 'all stages'
  if (Array.isArray(gates)) return gates.join(', ')
  return '—'
}

const STATUS_LABEL: Record<CoverageStatus, string> = {
  not_started: 'Not started',
  partial: 'In progress',
  covered: 'Covered',
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

  const { data: coverageData, error: coverageError } = await supabase.rpc('get_run_coverage', {
    p_church_id: churchId,
  })
  if (coverageError) throw coverageError
  const rows = (coverageData ?? []) as CoverageRow[]

  const methodology = loadMethodology()
  const brand = resolveBrand(church.name)
  const categories = methodology.questions.categories
  const enablers = methodology.rules.enablers

  const result = coverage(rows, categories)
  const statusById = new Map(result.categories.map((c) => [c.category_id, c.status]))
  const anyStarted = result.categories.some((c) => c.status !== 'not_started')
  const header = `${anyStarted ? 'Assessment in progress' : 'Assessment not started'} · ${result.coveredCount} of ${categories.length} areas`

  const { data: { user } } = await supabase.auth.getUser()
  const { data: membership } = await supabase
    .from('church_members')
    .select('role')
    .eq('church_id', churchId)
    .eq('user_id', user?.id ?? '')
    .maybeSingle()
  const role = membership?.role ?? null

  const { data: run } = await supabase
    .from('assessment_runs')
    .select('id')
    .eq('church_id', churchId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  let hasDiagnosis = false
  if (run) {
    const { data: diagRows } = await supabase
      .from('diagnoses')
      .select('id')
      .eq('run_id', run.id)
      .limit(1)
    hasDiagnosis = (diagRows?.length ?? 0) > 0
  }

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-6 py-10">
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
              <p className="mt-3 font-body text-sm text-ink-soft">{STATUS_LABEL[status]}</p>
              <Link
                href={`/app/${churchId}/answer/${cat.id}`}
                className="mt-2 inline-block py-1.5 font-body text-sm text-ink underline underline-offset-2 hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                Answer yourself
              </Link>
            </article>
          )
        })}
      </section>

      <InvitePanel churchId={churchId} categories={categories.map((c) => ({ id: c.id, name: c.name }))} />

      <section className="flex flex-wrap items-start gap-2">
        {hasDiagnosis ? (
          <Link
            href={`/app/${churchId}/diagnosis`}
            className="rounded-md border border-line bg-ink px-3 py-1.5 font-body text-sm text-paper transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            View diagnosis
          </Link>
        ) : result.coveredCount === categories.length && role === 'admin' ? (
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
    </main>
  )
}
