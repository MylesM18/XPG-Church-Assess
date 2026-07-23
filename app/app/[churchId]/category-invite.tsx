'use client'

import { useActionState } from 'react'
import { createInvitation, type InviteResult } from './actions'
import { useDisclosure } from '@/components/inline-disclosure'
import { LiveStatus } from '@/components/live-status'

export interface ChurchInvitee {
  invited_name: string | null
  invited_contact: string | null
  pending_category_ids: string[]
}

const initial: InviteResult = { link: null, emailed: false, error: null }

const inputClass =
  'rounded-md border border-line bg-paper px-3 py-2 font-body text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

function LinkNote({ state }: { state: InviteResult }) {
  if (!state.link) return null
  return (
    <div className="mt-1 flex flex-col gap-1 rounded-md border border-line bg-paper p-3">
      <p className="font-body text-sm text-ink">
        {state.emailed ? 'Invitation emailed. Link:' : 'Invitation created — we couldn’t email it, so share this link:'}
      </p>
      <code className="break-all font-body text-xs text-ink-soft">{state.link}</code>
    </div>
  )
}

export function CategoryInvite({
  churchId,
  categoryId,
  categoryName,
  invitees,
}: {
  churchId: string
  categoryId: string
  categoryName: string
  invitees: ChurchInvitee[]
}) {
  const { triggerProps, regionProps } = useDisclosure()
  // One shared state for the one-click re-invite rows (only one is clicked at a time) and one for
  // the new-person form. Both drive the UNCHANGED createInvitation action; revalidation refreshes
  // the list so a just-invited contact flips to "Already pending here".
  const [reState, reAction, rePending] = useActionState(createInvitation, initial)
  const [newState, newAction, newPending] = useActionState(createInvitation, initial)

  const known = invitees.filter((i) => i.invited_name || i.invited_contact)

  return (
    <div className="mt-3">
      <button
        {...triggerProps}
        className="py-1.5 font-body text-sm text-ink underline underline-offset-2 hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        Invite someone
      </button>

      <div {...regionProps} className="mt-2 rounded-md border border-line bg-paper p-3">
        <h3 className="font-body text-sm text-ink">Invite someone to answer {categoryName}</h3>

        {known.length > 0 && (
          <div className="mt-2 flex flex-col gap-2">
            <p className="font-body text-xs text-ink-soft">People already invited to your church</p>
            <ul className="flex flex-col gap-1">
              {known.map((person, idx) => {
                const label = person.invited_name ?? person.invited_contact ?? 'Someone'
                const pendingHere = person.pending_category_ids.includes(categoryId)
                return (
                  <li key={`${person.invited_contact ?? person.invited_name}-${idx}`} className="flex items-center justify-between gap-2">
                    <span className="font-body text-sm text-ink">{label}</span>
                    {pendingHere ? (
                      <span className="flex items-center gap-2">
                        <span className="font-body text-xs text-ink-soft">Already pending here</span>
                        <button
                          type="button"
                          aria-disabled="true"
                          className="rounded-md border border-line px-2 py-1 font-body text-xs text-ink-soft opacity-50"
                          onClick={(e) => e.preventDefault()}
                        >
                          Invited
                        </button>
                      </span>
                    ) : (
                      <form action={reAction}>
                        <input type="hidden" name="church_id" value={churchId} />
                        <input type="hidden" name="category_id" value={categoryId} />
                        <input type="hidden" name="invited_name" value={person.invited_name ?? ''} />
                        <input type="hidden" name="invited_contact" value={person.invited_contact ?? ''} />
                        <button
                          type="submit"
                          aria-disabled={rePending}
                          onClick={(e) => { if (rePending) e.preventDefault() }}
                          className="rounded-md border border-line bg-ink px-2 py-1 font-body text-xs text-paper hover:opacity-90 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                        >
                          Invite for this area
                        </button>
                      </form>
                    )}
                  </li>
                )
              })}
            </ul>
            <LinkNote state={reState} />
            <LiveStatus message={reState.error} tone="error" className="font-body text-sm text-ink" />
            <p className="font-body text-xs text-ink-soft">or invite someone new</p>
          </div>
        )}

        <form action={newAction} className="mt-2 flex flex-col gap-2">
          <input type="hidden" name="church_id" value={churchId} />
          <input type="hidden" name="category_id" value={categoryId} />
          <label className="flex flex-col gap-1 font-body text-sm text-ink-soft">
            Their name (optional)
            <input name="invited_name" type="text" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 font-body text-sm text-ink-soft">
            Their email (optional — we’ll email the link)
            <input name="invited_contact" type="email" className={inputClass} />
          </label>
          <button
            type="submit"
            aria-disabled={newPending}
            onClick={(e) => { if (newPending) e.preventDefault() }}
            className="rounded-md border border-line bg-ink px-3 py-1.5 font-body text-sm text-paper hover:opacity-90 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {newPending ? 'Sending…' : 'Send invite'}
          </button>
          <p className="font-body text-xs text-ink-soft">
            If the email doesn’t send, you’ll get a copyable link to share — same as today.
          </p>
          <LiveStatus message={newState.error} tone="error" className="font-body text-sm text-berry" />
          <LinkNote state={newState} />
        </form>
      </div>
    </div>
  )
}
