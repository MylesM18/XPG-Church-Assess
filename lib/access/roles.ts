// UI role labels → DB role values. The DB stores 'admin' | 'viewer'; the UI shows
// 'Co-admin' | 'Member'. create_member_invitation validates p_role in ('admin','viewer'),
// so the mapped value must be one of those; an unrecognized input passes through and the
// RPC rejects it (surfaced as an error to the admin).
export function mapRoleInput(input: string): string {
  if (input === 'Co-admin') return 'admin'
  if (input === 'Member') return 'viewer'
  return input
}
