'use client'

import { useActionState } from 'react'
import { inviteMember, type InviteResult } from './actions'
import { LiveStatus } from '@/components/live-status'
import { FieldInfo } from '@/app/get-started/field-info'

const initial: InviteResult = { link: null, emailed: false, error: null }
const inputClass =
  'rounded-md border border-line bg-paper px-3 py-2 font-body text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

export function InviteMemberForm({ churchId }: { churchId: string }) {
  const [state, formAction, pending] = useActionState(inviteMember, initial)
  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-line bg-paper p-4">
      <input type="hidden" name="church_id" value={churchId} />

      <label className="flex flex-col gap-1 font-body text-sm text-ink-soft">
        Their email
        <input name="email" type="email" required className={inputClass} />
      </label>

      <div className="flex flex-col gap-1 font-body text-sm text-ink-soft">
        <FieldInfo htmlFor="invite-role" label="Role">
          Co-admins can view the assessment results and send invites, in addition to answering. Members only answer the assessment.
        </FieldInfo>
        <select id="invite-role" name="role" required defaultValue="Member" className={inputClass}>
          <option value="Member">Member</option>
          <option value="Co-admin">Co-admin</option>
        </select>
      </div>

      <button type="submit" aria-disabled={pending}
        onClick={(e) => { if (pending) e.preventDefault() }}
        className="mt-1 rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
        {pending ? 'Inviting…' : 'Send invitation'}
      </button>

      <LiveStatus message={state.error} tone="error" className="font-body text-sm text-berry" />

      {/* Announcement only — the visible sentence and the <code> below are unchanged. The URL is
          deliberately excluded so a screen reader does not spell out a ~60-character token. */}
      <LiveStatus
        message={
          state.link
            ? state.emailed
              ? 'Invitation emailed. The link is shown below.'
              : 'Invitation created but not emailed. The link is shown below.'
            : null
        }
        tone="status"
        className="sr-only"
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
