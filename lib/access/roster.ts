/**
 * Split a church's roster into people who have joined and people who were invited but have not
 * signed in yet.
 *
 * Since invite = account creation (spec 2026-09-14), an invitee holds a `church_members` row from
 * the moment the invitation is sent. `get_church_members` therefore returns them alongside real
 * joiners, and listing them under "Members" would tell the admin they had arrived. The pending
 * invitations are the source of truth for "not yet signed in": `settle_my_invitations` flips a
 * row to `accepted` on the invitee's first sign-in. The match is by e-mail, case-insensitively —
 * the invitation stores a lower-cased address, auth keeps what the person typed — so no RPC
 * return shape has to change. A member with no e-mail never matches.
 */
export function splitRoster<M extends { email: string | null }>(
  members: M[],
  pending: { invited_email: string }[],
): { joined: M[]; waiting: M[] } {
  const pendingEmails = new Set(
    pending.map((p) => p.invited_email.trim().toLowerCase()).filter((e) => e.length > 0),
  )
  const joined: M[] = []
  const waiting: M[] = []
  for (const m of members) {
    const email = m.email?.trim().toLowerCase() ?? ''
    if (email && pendingEmails.has(email)) waiting.push(m)
    else joined.push(m)
  }
  return { joined, waiting }
}
