// Source-reading tripwire (node env, no DOM). The action-facing admin guard was cloned byte-for-byte
// in access/actions.ts and diagnosis/actions.ts. Both must now route through the SINGLE shared
// requireChurchAdmin — re-introducing a local `requireAdmin` (the duplication) turns this red.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const read = (...p: string[]) => stripComments(fs.readFileSync(path.join(ROOT, ...p), 'utf8'))

const access = read('app', 'app', '[churchId]', 'access', 'actions.ts')
const diagnosis = read('app', 'app', '[churchId]', 'diagnosis', 'actions.ts')

describe('shared action admin guard', () => {
  it('both action files import the single shared guard', () => {
    for (const [name, src] of [['access', access], ['diagnosis', diagnosis]] as const) {
      expect(src, `${name}/actions.ts imports requireChurchAdmin`).toContain(
        "from '@/lib/auth/require-church-admin'",
      )
      expect(src, `${name}/actions.ts calls requireChurchAdmin`).toContain('requireChurchAdmin(')
    }
  })
  it('neither file re-declares a local requireAdmin clone', () => {
    for (const [name, src] of [['access', access], ['diagnosis', diagnosis]] as const) {
      expect(src, `${name}/actions.ts must not redefine the guard locally`).not.toMatch(
        /function\s+requireAdmin\s*\(/,
      )
    }
  })
})
