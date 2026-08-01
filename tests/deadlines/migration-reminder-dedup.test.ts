import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const sql = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations/20260801000700_church_members_reminder_dedup.sql'),
  'utf8',
)

describe('reminder dedup columns', () => {
  it('adds two nullable date guards', () => {
    expect(sql).toContain('add column if not exists last_reminded_on date')
    expect(sql).toContain('add column if not exists last_invite_reminded_on date')
  })
})
