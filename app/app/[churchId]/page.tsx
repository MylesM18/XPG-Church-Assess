import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadMethodology } from '@/lib/methodology/load'
import { resolveBrand } from '@/lib/brand/resolve'
import { ChainGlyph } from './chain-glyph'

function gatesLabel(gates: 'all' | string[] | undefined): string {
  if (gates === 'all') return 'all stages'
  if (Array.isArray(gates)) return gates.join(', ')
  return '—'
}

const STUBS = [
  ['Invite leaders', 'M4'],
  ['Answer yourself', 'M4'],
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

  // RLS: a non-member gets zero rows here → 404 (server-side permission wall).
  const { data: church } = await supabase
    .from('churches')
    .select('id, name, brand_color')
    .eq('id', churchId)
    .maybeSingle()

  if (!church) notFound()

  const methodology = loadMethodology()
  const brand = resolveBrand(church.name)
  const categories = methodology.questions.categories
  const enablers = methodology.rules.enablers

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
          <p className="font-body text-sm text-ink-soft">Assessment not started · 0 of 8 areas</p>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {categories.map((cat) => (
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
            <p className="mt-3 font-body text-sm text-ink-soft">Not started</p>
          </article>
        ))}
      </section>

      <section className="flex flex-wrap gap-2">
        {STUBS.map(([label, milestone]) => (
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
