import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { GetStartedForm } from './form'

export default async function GetStartedPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in?next=/get-started')

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6 py-12">
      <h1 className="font-display text-3xl text-ink">Add your church</h1>
      <p className="font-body text-ink-soft">
        Just the name to start — everything else is optional and editable later.
      </p>
      <GetStartedForm />
    </main>
  )
}
