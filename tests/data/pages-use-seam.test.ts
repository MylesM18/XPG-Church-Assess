// Source-reading tripwire (node env). Slice 1b of the data-access seam (ADR 0002): the member-facing
// pages resolve church + role via loadChurchForMember, the roster via churchMembers, and church
// creation via createChurchWithAdmin — the raw `.from('church_members')` / `.rpc('get_church_members')`
// / `.rpc('create_church_with_admin')` strings no longer appear at these call sites (they live only
// under lib/data/). Re-inlining any of them turns this red.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const read = (...p: string[]) => stripComments(fs.readFileSync(path.join(ROOT, ...p), 'utf8'))

const dashboard = read('app', 'app', '[churchId]', 'page.tsx')
const access = read('app', 'app', '[churchId]', 'access', 'page.tsx')
const diagnosis = read('app', 'app', '[churchId]', 'diagnosis', 'page.tsx')
const getStarted = read('app', 'get-started', 'actions.ts')

const pages = [
  ['dashboard', dashboard],
  ['access', access],
  ['diagnosis', diagnosis],
] as const

describe('member-facing pages use the data seam for church + role', () => {
  it('resolve church + role via loadChurchForMember', () => {
    for (const [name, src] of pages) {
      expect(src, `${name} imports the churches data module`).toContain("from '@/lib/data/churches'")
      expect(src, `${name} calls loadChurchForMember`).toContain('loadChurchForMember(')
    }
  })
  it('no longer inline the church_members role lookup', () => {
    for (const [name, src] of pages) {
      expect(src, `${name} must not query church_members directly`).not.toContain(
        ".from('church_members')",
      )
    }
  })
})

describe('roster + church creation go through the seam', () => {
  it('dashboard and access read the roster via churchMembers, not the raw RPC', () => {
    for (const [name, src] of [['dashboard', dashboard], ['access', access]] as const) {
      expect(src, `${name} calls churchMembers`).toContain('churchMembers')
      expect(src, `${name} must not call get_church_members directly`).not.toContain(
        "rpc('get_church_members'",
      )
    }
  })
  it('get-started creates the church via createChurchWithAdmin, not the raw RPC', () => {
    expect(getStarted).toContain('createChurchWithAdmin(')
    expect(getStarted).not.toContain("rpc('create_church_with_admin'")
  })
})
