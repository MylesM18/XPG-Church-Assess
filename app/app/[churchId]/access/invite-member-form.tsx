'use client'

import { useActionState } from 'react'
import { inviteMember, type InviteResult } from './actions'
import { LiveStatus } from '@/components/live-status'

const initial: InviteResult = { link: null, emailed: false, error: null }
const inputClass =
  'rounded-md border border-line bg-paper px-3 py-2 font-body text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

export function InviteMemberForm({ churchId }: { churchId: string }) {
  const [state, formAction, pending] = useActionState(inviteMember, initial)
  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-line bg-paper p-4">
      <input type="hidden" name="church_id" value={churchId} />
      <h2 className="font-display text-lg text-ink">Invite a leader</h2>

      <label className="flex flex-col gap-1 font-body text-sm text-ink-soft">
        Their email
        <input name="email" type="email" required className={inputClass} />
      </label>

      <label className="flex flex-col gap-1 font-body text-sm text-ink-soft">
        Role
        <select name="role" required defaultValue="Viewer" className={inputClass}>
          <option value="Viewer">Viewer</option>
          <option value="Co-admin">Co-admin</option>
        </select>
      </label>

      <button type="submit" disabled={pending}
        className="mt-1 rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
        {pending ? 'Inviting…' : 'Send invitation'}
      </button>

      <LiveStatus tone="error" message={state.error} className="font-body text-sm text-berry" />

      {/* Announcement only — the visible sentence and the <code> below are unchanged. The URL is
          deliberately excluded so a screen reader does not spell out a ~60-character token. */}
      <LiveStatus
        tone="status"
        className="sr-only"
        message={
          state.link
            ? state.emailed
              ? 'Invitation emailed. The link is shown below.'
              : 'Invitation created but not emailed. The link is shown below.'
            : null
        }
      />

      {state.link && (
        <div className="flex flex-col gap-1 rounded-md border border-line bg-paper p-3">
          <p className="font-body text-sm text-ink">
            {state.emailed ? 'Invitation emailed. Link:' : "Invitation created — we couldn’t email it, so share this link:"}
          </p>
          <code className="break-all font-body text-xs text-ink-soft">{state.link}</code>
        </div>
      )}
    </form>
  )
}
