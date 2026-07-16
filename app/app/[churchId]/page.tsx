import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadMethodology } from '@/lib/methodology/load'
import { resolveBrand } from '@/lib/brand/resolve'
import { coverage, type CoverageRow, type CoverageStatus } from '@/lib/coverage/coverage'
import { ChainGlyph } from './chain-glyph'
import { InvitePanel } from './invite-panel'

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

// M5 stubs remain disabled; M4 stubs become links (rendered inline below).
const DISABLED_STUBS = [
  ['View diagnosis', 'M5'],
  ['Manage access', 'M5'],
] as const

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

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-6 py-10">
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
                className="mt-2 inline-block font-body text-sm text-ink underline underline-offset-2 hover:opacity-80"
              >
                Answer yourself
              </Link>
            </article>
          )
        })}
      </section>

      <InvitePanel churchId={churchId} categories={categories.map((c) => ({ id: c.id, name: c.name }))} />

      <section className="flex flex-wrap gap-2">
        {DISABLED_STUBS.map(([label, milestone]) => (
          <button
            key={label}
            type="button"
            disabled
            aria-disabled="true"
            className="cursor-not-allowed rounded-md border border-line px-3 py-1.5 font-body text-sm text-ink-soft opacity-60"
          >
            {label} <span className="text-xs">({milestone})</span>
          </button>
        ))}
      </section>
    </main>
  )
}
