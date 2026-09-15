import type { EmailOtpType, SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

/**
 * The admin-API half of "invite = account creation, bound to the inviting church"
 * (docs/superpowers/specs/2026-09-14-invite-account-binding-design.md).
 *
 * Contract verified against the Supabase auth docs (GoTrue `/admin/generate_link`, 2026-09-14):
 *   - `type: 'invite'` creates the user if unknown, reuses an existing UNconfirmed one, and answers
 *     422 `email_exists` for a confirmed one. Either way the address now has an account to bind.
 *   - `type: 'magiclink'` returns a hashed token for any existing user (and is silently converted
 *     to `signup` for an unknown one). Spent with `verifyOtp({ token_hash })`, it starts a session
 *     and confirms a still-unconfirmed account.
 *
 * Every function here needs the service-role client and is server-only. Never import this from a
 * client component.
 */

type AuthErrorLike = { code?: string; message?: string; status?: number } | null | undefined

/** GoTrue's answer when the address already belongs to a confirmed account. */
export function isAlreadyRegistered(error: AuthErrorLike): boolean {
  if (!error) return false
  if (error.code === 'email_exists' || error.code === 'user_already_exists') return true
  return /already (been )?registered|already exists/i.test(error.message ?? '')
}

export type ProvisionResult = { ok: true; existed: boolean } | { ok: false; reason: string }

/**
 * Make sure an auth account exists for the invited address. `data.invited` lands in
 * `auth.users.raw_user_meta_data`, which the Supabase "Confirm signup" template reads as
 * `{{ .Data.invited }}` (PR #87) — setting it HERE, at invite time, closes that PR's documented
 * limit where a leader who clicked BEGIN before opening their invitation kept the admin's copy.
 */
export async function provisionInvitedAccount(
  admin: SupabaseClient,
  { email }: { email: string },
): Promise<ProvisionResult> {
  const { error } = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { data: { invited: true } },
  })
  if (!error) return { ok: true, existed: false }
  if (isAlreadyRegistered(error)) return { ok: true, existed: true }
  return { ok: false, reason: error.message }
}

export interface SignInToken {
  tokenHash: string
  type: EmailOtpType
  /** The account the token signs in — lets the caller check membership before spending it. */
  userId: string | null
}

const VERIFY_TYPES: ReadonlySet<string> = new Set(['signup', 'invite', 'magiclink', 'recovery', 'email'])

/** The `verification_type` generate_link reports, narrowed to what `verifyOtp` accepts. */
export function toVerifyType(verificationType: string | undefined): EmailOtpType {
  return (verificationType && VERIFY_TYPES.has(verificationType) ? verificationType : 'magiclink') as EmailOtpType
}

/**
 * Mint a sign-in token for the invited address at CLICK time. Minting on click (rather than
 * emailing a Supabase token at invite time) sidesteps the project's OTP expiry — one hour by
 * default, far shorter than the days most volunteers take to open an invitation. The token is
 * spent milliseconds later by the caller's own `verifyOtp`.
 */
export async function mintSignInToken(admin: SupabaseClient, email: string): Promise<SignInToken | null> {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  const tokenHash = data?.properties?.hashed_token
  if (error || !tokenHash) return null
  return { tokenHash, type: toVerifyType(data?.properties?.verification_type), userId: data?.user?.id ?? null }
}

/**
 * The first-sign-in hook. Marks the caller's pending invitations accepted (binding legacy ones by
 * e-mail) and stamps the completion clock — see migration 20260914000100. Best-effort: a failure
 * here must never turn a successful sign-in into an error page, so it returns 0 instead of throwing.
 */
export async function settleInvitations(supabase: Pick<SupabaseClient, 'rpc'>): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('settle_my_invitations')
    if (error) return 0
    return typeof data === 'number' ? data : 0
  } catch {
    return 0
  }
}

export type PrepareResult = { bound: true; existed: boolean } | { bound: false; reason: string }

/**
 * Provision the account and bind it to the church, in that order. Called by the invite server
 * action right after `create_member_invitation` succeeds (which is what proves admin authority —
 * `bind_invited_member` is service-role-only and trusts the invitation row).
 *
 * Returns `{ bound: false }` rather than throwing when the deployment has no service-role key:
 * the invitation still exists and is still emailed, and the caller is expected to SAY so — silent
 * degradation is the failure mode this whole change exists to remove.
 */
export async function prepareInvitedAccount(args: {
  invitationId: string
  email: string
  admin?: SupabaseClient | null
}): Promise<PrepareResult> {
  const admin = args.admin === undefined ? createServiceRoleClient() : args.admin
  if (!admin) return { bound: false, reason: 'service role not configured' }

  const provisioned = await provisionInvitedAccount(admin, { email: args.email })
  if (!provisioned.ok) return { bound: false, reason: provisioned.reason }

  const { error } = await admin.rpc('bind_invited_member', { p_invitation_id: args.invitationId })
  if (error) return { bound: false, reason: error.message }
  return { bound: true, existed: provisioned.existed }
}
