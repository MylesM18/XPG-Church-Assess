'use client'

import { useActionState } from 'react'
import { createInvitation, type InviteResult } from './actions'

const initial: InviteResult = { link: null, emailed: false, error: null }

const inputClass =
  'rounded-md border border-line bg-paper px-3 py-2 font-body text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

export function InvitePanel({
  churchId,
  categories,
}: {
  churchId: string
  categories: Array<{ id: string; name: string }>
}) {
  const [state, formAction, pending] = useActionState(createInvitation, initial)

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-line bg-paper p-4">
      <input type="hidden" name="church_id" value={churchId} />
      <h2 className="font-display text-lg text-ink">Invite a leader</h2>

      <label className="flex flex-col gap-1 font-body text-sm text-ink-soft">
        Category
        <select name="category_id" required defaultValue="" className={inputClass}>
          <option value="" disabled>Choose a category…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </label>

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
        disabled={pending}
        className="mt-1 rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? 'Creating…' : 'Create invitation'}
      </button>

      {state.error && <p className="font-body text-sm text-berry">{state.error}</p>}

      {state.link && (
        <div className="flex flex-col gap-1 rounded-md border border-line bg-paper p-3">
          <p className="font-body text-sm text-ink">
            {state.emailed ? 'Invitation emailed. Link:' : "Invitation created — we couldn't email it, so share this link:"}
          </p>
          <code className="break-all font-body text-xs text-ink-soft">{state.link}</code>
        </div>
      )}
    </form>
  )
}
