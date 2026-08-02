// Source-reading tripwire (node env — no RSC render): the dashboard wires the completion banner.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')
const page = read('app', 'app', '[churchId]', 'page.tsx')
const members = read('lib', 'data', 'members.ts')
const banner = read('components', 'deadline-banner.tsx')

describe('member completion banner', () => {
  it('exports a DeadlineBanner presentational component', () => {
    expect(banner).toContain('export function DeadlineBanner')
    expect(banner).toContain("tone")
  })
  it('adds a memberDeadline read helper', () => {
    expect(members).toContain('export async function memberDeadline')
    expect(members).toContain('assessment_deadline_at')
  })
  it('dashboard computes and renders the completion banner', () => {
    expect(page).toContain('memberDeadline')
    expect(page).toContain('completionWindowState')
    expect(page).toContain('completionBannerText')
    expect(page).toContain('<DeadlineBanner')
  })
})
