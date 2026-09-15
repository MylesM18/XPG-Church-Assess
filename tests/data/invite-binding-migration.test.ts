// Source-reading tripwire (node env): the agent cannot apply migrations or run pgTAP (owner-only),
// so these pin the SQL contract the app code depends on. See migration 20260914000100.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SQL = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '20260914000100_invite_account_binding.sql'),
  'utf8',
)
const PGTAP = fs.readFileSync(
  path.join(ROOT, 'supabase', 'tests', '28_invite_account_binding_test.sql'),
  'utf8',
)

describe('migration 20260914000100', () => {
  it('adds the binding column', () => {
    expect(SQL).toMatch(/alter table public\.member_invitations\s+add column invited_user_id uuid/)
  })

  it('makes bind_invited_member service-role only', () => {
    expect(SQL).toMatch(/revoke all on function public\.bind_invited_member\(uuid\) from public, anon, authenticated/)
    expect(SQL).toMatch(/grant execute on function public\.bind_invited_member\(uuid\) to service_role/)
  })

  it('leaves the completion clock unset at bind time', () => {
    const bind = SQL.slice(SQL.indexOf('create function public.bind_invited_member'), SQL.indexOf('create function public.settle_my_invitations'))
    expect(bind).not.toContain('assessment_deadline_at')
  })

  it('lets any signed-in member settle their own invitations', () => {
    expect(SQL).toMatch(/grant execute on function public\.settle_my_invitations\(\) to authenticated/)
  })

  it('stamps a null clock on accept instead of leaving a pre-bound member untimed', () => {
    const accept = SQL.slice(SQL.indexOf('create or replace function public.accept_member_invitation'))
    expect(accept).toMatch(/on conflict \(church_id, user_id\) do update/)
    expect(accept).toMatch(/coalesce\(public\.church_members\.assessment_deadline_at/)
  })
})

describe('pgTAP 28', () => {
  it('exists with a plan that matches its assertion count', () => {
    const plan = Number(PGTAP.match(/select plan\((\d+)\)/)?.[1])
    const assertions = (PGTAP.match(/select (is|ok|throws_ok|lives_ok|has_column)\(/g) ?? []).length
    expect(plan).toBe(assertions)
  })
})
