import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/20260810000100_churches_profile_columns.sql', 'utf8')
const body = sql.replace(/--[^\n]*$/gm, '')

describe('20260810000100 churches profile columns', () => {
  it('adds the four nullable columns to public.churches', () => {
    expect(body).toContain('alter table public.churches')
    expect(body).toContain('add column if not exists campuses_band text')
    expect(body).toContain('add column if not exists facility_status text')
    expect(body).toContain('add column if not exists leadership_history text')
    expect(body).toContain('add column if not exists consultant_notes text')
  })

  it('constrains facility_status to the four known values, null allowed', () => {
    expect(body).toContain('facility_status is null or facility_status in')
    expect(body).toContain("'owned','rented','portable','mixed'")
  })

  it('does not drop or rewrite the table', () => {
    expect(body).not.toContain('drop table')
    expect(body).not.toContain('drop column')
  })
})
