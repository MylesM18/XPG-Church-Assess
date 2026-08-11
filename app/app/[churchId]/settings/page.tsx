import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadChurchForMember, loadChurchProfile } from '@/lib/data/churches'
import { SettingsForm } from './settings-form'

export default async function SettingsPage({ params }: { params: Promise<{ churchId: string }> }) {
  const { churchId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { church, role } = await loadChurchForMember(supabase, churchId, user?.id ?? '')
  if (!church) notFound()
  if (role !== 'admin') notFound()

  const profile = await loadChurchProfile(supabase, churchId)
  if (!profile) notFound()

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link
          href={`/app/${churchId}`}
          className="py-1.5 font-body text-sm text-ink-soft underline underline-offset-2 hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          ← Back to {church.name}
        </Link>
        <h1 className="font-display text-2xl text-ink">Church settings</h1>
        <p className="font-body text-sm text-ink-soft">
          Optional profile details that calibrate your report. Anything left blank is simply
          omitted — nothing here is required except weekend attendance.
        </p>
      </header>

      <SettingsForm church={profile} />
    </main>
  )
}
