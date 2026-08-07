export type AcceptPreview = {
  church_name: string
  role: string
  invited_email: string
  status: string
  is_expired: boolean
}

export type AcceptState =
  | 'not_found' | 'revoked' | 'accepted' | 'expired' | 'sign_in' | 'wrong_email' | 'ready'

/**
 * Pure resolver for the /accept/[token] page. Precedence: terminal invite states
 * (not_found/revoked/accepted/expired) win over auth state; then signed-out →
 * sign_in; then a case-insensitive email mismatch → wrong_email; else ready.
 * The authoritative email gate is server-side in accept_member_invitation — this
 * is a friendly pre-check only.
 */
export function resolveAcceptState(input: {
  preview: AcceptPreview | null
  signedIn: boolean
  sessionEmail: string | null
}): AcceptState {
  const { preview, signedIn, sessionEmail } = input
  if (!preview) return 'not_found'
  if (preview.status === 'revoked') return 'revoked'
  if (preview.status === 'accepted') return 'accepted'
  if (preview.is_expired) return 'expired'
  if (!signedIn) return 'sign_in'
  if ((sessionEmail ?? '').toLowerCase() !== preview.invited_email.toLowerCase()) return 'wrong_email'
  return 'ready'
}

export function acceptLink(appUrl: string, token: string): string {
  return `${appUrl}/accept/${token}`
}

/**
 * DB role → the word an invitee reads. The DB value 'viewer' is an internal
 * permission name; everywhere a person sees it (the admin's access screen, the
 * invite form) it has always read "Member", so this is the one place that leaked
 * the raw value into invitee-facing copy. Keep this aligned with mapRoleInput
 * (lib/access/roles.ts), which maps the same pair in the other direction.
 */
export function roleLabel(role: string): string {
  if (role === 'admin') return 'co-admin'
  if (role === 'viewer') return 'member'
  return role
}
