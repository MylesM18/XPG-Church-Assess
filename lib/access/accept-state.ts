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

export function roleLabel(role: string): string {
  if (role === 'admin') return 'co-admin'
  if (role === 'viewer') return 'viewer'
  return role
}
