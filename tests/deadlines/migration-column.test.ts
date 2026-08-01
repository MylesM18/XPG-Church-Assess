import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const sql = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations/20260801000100_church_members_assessment_deadline.sql'),
  'utf8',
)

describe('assessment_deadline_at column migration', () => {
  it('adds a nullable timestamptz with no default', () => {
    expect(sql).toContain('alter table public.church_members')
    expect(sql).toContain('add column assessment_deadline_at timestamptz')
    expect(sql).not.toMatch(/assessment_deadline_at\s+timestamptz[^;]*default/i)
  })
})
