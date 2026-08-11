import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const read = (...p: string[]) =>
  fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8').replace(/\/\/.*$/gm, '')

const FORM = read('app', 'app', '[churchId]', 'settings', 'settings-form.tsx')
const PAGE = read('app', 'app', '[churchId]', 'settings', 'page.tsx')
const ACTION = read('app', 'app', '[churchId]', 'settings', 'actions.ts')

const PROFILE_FIELDS = [
  'denomination', 'context', 'attendance_band', 'adults_band', 'staff_fte_band',
  'budget_band', 'church_age_band', 'growth_trajectory', 'campuses_band',
  'facility_status', 'leadership_history', 'consultant_notes',
] as const

describe('settings page is admin-gated (access/ idiom)', () => {
  it('resolves role via loadChurchForMember and 404s non-admins', () => {
    expect(PAGE).toContain('loadChurchForMember(')
    expect(PAGE).toContain("role !== 'admin'")
    expect(PAGE).toContain('notFound()')
  })
})

describe('settings form posts the full profile field set', () => {
  it('renders an input/select/textarea for all 12 profile fields', () => {
    // Fields rendered from a mapped tuple array appear in source as the single-quoted
    // tuple literal, not as name="…" (same caveat get-started-form.test.ts documents) —
    // accept either spelling.
    for (const name of PROFILE_FIELDS) {
      const present = FORM.includes(`name="${name}"`) || FORM.includes(`'${name}'`)
      expect(present, `missing field ${name}`).toBe(true)
    }
    expect(FORM).toContain('name="attendance_band"')
    expect(FORM).toContain('name="facility_status"')
  })
  it('carries the church id as a hidden field', () => {
    expect(FORM).toContain('name="church_id"')
    expect(FORM).toContain('type="hidden"')
  })
  it('facility status is the four-value select from the migration CHECK', () => {
    for (const slug of ['owned', 'rented', 'portable', 'mixed']) {
      expect(FORM, `missing facility option ${slug}`).toContain(`'${slug}'`)
    }
  })
  it('long-form fields render as textareas', () => {
    // The two long-form names live in the TEXTAREA_FIELDS tuples that feed the
    // <textarea> map — name= is a JSX binding, so assert the pieces, not the pair.
    expect(FORM).toContain('TEXTAREA_FIELDS')
    expect(FORM).toContain('<textarea')
    for (const name of ['leadership_history', 'consultant_notes']) {
      expect(FORM, `missing long-form field ${name}`).toContain(`'${name}'`)
    }
  })
  it('announces save state politely (role=status), errors via LiveStatus', () => {
    expect(FORM).toContain('role="status"')
    expect(FORM).toContain('<LiveStatus')
  })
})

describe('settings action enforces admin before writing', () => {
  it('checks the role server-side (RLS alone would silently match zero rows)', () => {
    expect(ACTION).toContain('loadChurchForMember(')
    expect(ACTION).toContain("role !== 'admin'")
  })
  it('requires attendance_band (the engine cannot benchmark without it)', () => {
    expect(ACTION).toContain('attendance_band')
    expect(ACTION).toMatch(/Weekend attendance is required/)
  })
})
