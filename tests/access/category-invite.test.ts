import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8').replace(/\/\/.*$/gm, '')
const PANEL = read('app/app/[churchId]/category-invite.tsx')
const PAGE = read('app/app/[churchId]/page.tsx')

describe('CategoryInvite panel', () => {
  it('fixes category_id via a hidden input (no category select)', () => {
    expect(PANEL).toContain('type="hidden"')
    expect(PANEL).toContain('name="category_id"')
    expect(PANEL, 'per-card panel must not reintroduce a category chooser').not.toContain('<select')
  })
  it('reuses the existing createInvitation server action', () => {
    expect(PANEL).toContain("from './actions'")
    expect(PANEL).toContain('createInvitation')
  })
  it('guards duplicates from the pending category ids', () => {
    expect(PANEL).toContain('pending_category_ids')
    expect(PANEL).toContain('Already pending here')
  })
  it('opens inline via the shared disclosure', () => {
    expect(PANEL).toContain("from '@/components/inline-disclosure'")
  })
  it('never uses the reserved berry token for neutral UI', () => {
    const berryCount = (PANEL.match(/berry/g) ?? []).length
    expect(berryCount, 'only a LiveStatus error may keep berry').toBeLessThanOrEqual(1)
  })
})

describe('dashboard page', () => {
  it('no longer renders the blanket InvitePanel', () => {
    expect(PAGE).not.toContain('InvitePanel')
  })
  it('renders the per-card CategoryInvite for admins from the invitee lookup', () => {
    expect(PAGE).toContain('CategoryInvite')
    expect(PAGE).toContain('list_church_invitees')
    expect(PAGE).toContain("role === 'admin'")
  })
})
