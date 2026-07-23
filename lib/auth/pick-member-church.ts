/**
 * Pick the church a returning member should land on, from their `church_members` rows.
 *
 * Used by `app/get-started/page.tsx` to route an existing member to their assessment
 * dashboard instead of the church-creation form. Empty → null (no membership, so the
 * create form is correct). One → that church. Many → the first row: the page queries
 * ordered by `created_at` ascending, so this is the earliest-joined church and stays
 * stable across requests.
 */
export function pickMemberChurch(rows: { church_id: string }[]): string | null {
  return rows[0]?.church_id ?? null
}
