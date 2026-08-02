import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const sql = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations/20260801000600_rpc_get_church_members_add_deadline.sql'),
  'utf8',
)

describe('get_church_members adds deadline column', () => {
  it('drops then re-creates the function with assessment_deadline_at in the return', () => {
    expect(sql).toContain('drop function public.get_church_members(uuid)')
    expect(sql.indexOf('drop function')).toBeLessThan(sql.indexOf('create function'))
    expect(sql).toContain('create function public.get_church_members(p_church_id uuid)')
    expect(sql).toMatch(/returns table\([^)]*assessment_deadline_at timestamptz[^)]*\)/s)
    expect(sql).toContain('cm.assessment_deadline_at')
    expect(sql).toContain('grant execute on function public.get_church_members(uuid) to authenticated')
  })
})
