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

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-6 py-12">
      <SelfForm churchId={churchId} categoryId={categoryId} categoryName={category.name} items={items} />
    </main>
  )
}
