// Source-reading tripwire (node env, no DOM): the answer page now guards itself with the shared
// church + membership helper (defense-in-depth — no longer RLS-only). Deleting the guard (regressing
// to RLS-only) removes the requireChurchMembership call → this turns red. Invisible in a static
// render → pinned here.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const answer = stripComments(
  fs.readFileSync(
    path.join(ROOT, 'app', 'app', '[churchId]', 'answer', '[categoryId]', 'page.tsx'),
    'utf8',
  ),
)

describe('answer page church + membership guard', () => {
  it('delegates the church + membership gate to the shared helper', () => {
    expect(answer, 'imports the shared guard').toContain(
      "from '@/lib/auth/require-church-membership'",
    )
    expect(answer, 'calls the shared guard').toContain('requireChurchMembership(')
  })

  it('opts into a sign-in redirect with a next back to the answer page', () => {
    expect(answer, 'passes signInNext (a revert to RLS-only removes this)').toContain('signInNext')
    expect(answer, 'unauth deep-link → sign-in with next back to this page').toContain(
      '/app/${churchId}/answer/${categoryId}',
    )
  })
})
