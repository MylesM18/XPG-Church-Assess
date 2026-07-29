// Source-reading tripwire (node env, no DOM): the dashboard renders a visible Sign out control —
// a form that POSTs to /auth/signout (the existing route.ts POST → supabase.auth.signOut() → 303
// /sign-in) with a submit button labelled "Sign out". A form's action/method and a button label
// are invisible to a static render, so we assert against the source. Also a reverse guard against
// accidental removal. Comments are stripped so a prose mention can neither satisfy nor break it.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SOURCE = fs.readFileSync(path.join(ROOT, 'app', 'app', '[churchId]', 'page.tsx'), 'utf8')
// Strip comments so a comment mention can neither satisfy nor break a code assertion.
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('dashboard sign-out button', () => {
  it('renders a form that POSTs to the /auth/signout route', () => {
    expect(CODE, 'a form must target the /auth/signout route').toContain('action="/auth/signout"')
    expect(CODE, 'the sign-out form must submit via POST (route only handles POST)').toMatch(
      /method="post"/,
    )
  })

  it('has a submit button labelled "Sign out"', () => {
    expect(CODE, 'the sign-out control must be a submit button').toContain('type="submit"')
    expect(CODE, 'the button must carry the visible label "Sign out"').toContain('Sign out')
  })
})
