import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadMethodology } from '@/lib/methodology/load'
import { SelfForm } from './self-form'

export default async function AnswerPage({
  params,
}: {
  params: Promise<{ churchId: string; categoryId: string }>
}) {
  const { churchId, categoryId } = await params
  const supabase = await createClient()

  // Permission wall: RLS hides churches the caller isn't a member of → 404.
  const { data: church, error } = await supabase
    .from('churches')
    .select('id')
    .eq('id', churchId)
    .maybeSingle()
  if (error) throw error
  if (!church) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect(`/sign-in?next=/app/${churchId}/answer/${categoryId}`)
    notFound()
  }

  const methodology = loadMethodology()
  const category = methodology.questions.categories.find((c) => c.id === categoryId)
  if (!category) notFound()

  const items = category.items.map((i) => ({ id: i.id, text: i.text, anchors: i.anchors }))

  // Resume: pull the caller's OWN saved answers for this category (own-data only; responses stays
  // default-deny — the read goes through the security-definer RPC). Empty on the first visit.
  const { data: savedRows, error: savedError } = await supabase.rpc('get_my_category_answers', {
    p_church_id: churchId,
    p_category_id: categoryId,
  })
  if (savedError) throw savedError
  const initialValues: Record<string, number> = {}
  for (const row of (savedRows ?? []) as { item_id: string; value: number }[]) {
    initialValues[row.item_id] = row.value
  }

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-6 py-12">
      <Link
        href={`/app/${churchId}`}
        className="py-1.5 font-body text-sm text-ink-soft underline underline-offset-2 hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        ← Back to menu
      </Link>
      <SelfForm
        churchId={churchId}
        categoryId={categoryId}
        categoryName={category.name}
        items={items}
        initialValues={initialValues}
      />
    </main>
  )
}
