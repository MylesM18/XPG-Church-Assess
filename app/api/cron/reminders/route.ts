import type { NextRequest } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  planCompletionReminders, planInviteReminders,
  type CompletionCandidate, type InviteCandidate,
} from '@/lib/deadlines/reminders'
import { sendReminderEmail } from '@/lib/email/send-reminder'
import { todayISODate } from '@/lib/deadlines/countdown'

// Trusted server job: must run on Node (service-role key) and never be cached.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Daily reminder fan-out, invoked by Vercel Cron (see vercel.json). Gated by CRON_SECRET
 * (Authorization: Bearer <secret>). Degrades to an inert 200 when CRON_SECRET or the service-role
 * client is unconfigured — in-app banners cover users regardless. Best-effort, at-least-once: a
 * per-recipient same-day date guard (recorded only after a successful send) avoids most double-sends.
 *
 * Unlike a bare `{ ok: true, sent }`, the response also surfaces `attempted`/`failed` — createServiceRoleClient()
 * returning null and sendReminderEmail returning { ok: false } are both silent-by-default, so the cron
 * summary must report soft-fails rather than let them disappear into a successes-only count.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return Response.json({ ok: false, skipped: 'CRON_SECRET not set' })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createServiceRoleClient()
  if (!supabase) {
    return Response.json({ ok: false, skipped: 'service role not configured' })
  }

  const now = new Date()
  const today = todayISODate(now)

  const { data: compRows } = await supabase.rpc('completion_reminder_recipients')
  const { data: invRows } = await supabase.rpc('invite_reminder_recipients')

  const completionSends = planCompletionReminders((compRows ?? []) as CompletionCandidate[], now)
  const inviteSends = planInviteReminders((invRows ?? []) as InviteCandidate[], now)

  let attempted = 0
  let sent = 0
  let failed = 0

  for (const s of completionSends) {
    attempted++
    const { ok } = await sendReminderEmail({ to: s.to, subject: s.subject, text: s.text })
    if (ok) {
      await supabase
        .from('church_members')
        .update({ last_reminded_on: today })
        .eq('church_id', s.church_id)
        .eq('user_id', s.user_id)
      sent++
    } else {
      failed++
    }
  }

  for (const s of inviteSends) {
    attempted++
    const { ok } = await sendReminderEmail({ to: s.to, subject: s.subject, text: s.text })
    if (ok) {
      await supabase
        .from('church_members')
        .update({ last_invite_reminded_on: today })
        .eq('church_id', s.church_id)
        .eq('user_id', s.user_id)
      sent++
    } else {
      failed++
    }
  }

  return Response.json({ ok: true, attempted, sent, failed })
}
