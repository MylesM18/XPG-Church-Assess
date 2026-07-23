import { createClient } from '@/lib/supabase/server'
import { loadMethodology } from '@/lib/methodology/load'
import { RespondForm } from './respond-form'

export default async function RespondPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('get_invitation_context', { p_token: token })
  const ctx = Array.isArray(data) ? data[0] : null

  const invalid = (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-6 py-12">
      <h1 className="font-display text-2xl text-ink">This link isn’t valid</h1>
      <p className="font-body text-ink-soft">
        It may have expired, already been used, or been entered incorrectly. Please ask whoever
        invited you for a new link.
      </p>
    </main>
  )

  if (error || !ctx || !ctx.valid) return invalid

  const methodology = loadMethodology()
  const category = methodology.questions.categories.find((c) => c.id === ctx.category_id)
  if (!category) return invalid

  const items = category.items.map((i) => ({ id: i.id, text: i.text, anchors: i.anchors }))

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-6 py-12">
      <p className="font-body text-sm text-ink-soft">Helping {ctx.church_name}</p>
      <RespondForm token={token} categoryName={category.name} items={items} />
    </main>
  )
}
