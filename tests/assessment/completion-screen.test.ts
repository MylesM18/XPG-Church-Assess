// Source-reading tripwire (node env, no DOM): completing the whole assessment now routes to a
// dedicated done screen instead of dropping back on the dashboard. Pins (a) the new server page
// exists with the EXACT approved reassurance copy, (b) it guards itself — anyone not fully covered
// is redirected to the dashboard, so the screen can't be reached early or by deep link, and (c) the
// self-form's onComplete pushes to /done, not back to the bare dashboard. All invisible in a static
// render → the tripwire. Copy uses straight apostrophes + an em-dash to match the approved strings.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

const DONE = path.join(ROOT, 'app', 'app', '[churchId]', 'done', 'page.tsx')
const doneExists = fs.existsSync(DONE)
const done = doneExists ? stripComments(fs.readFileSync(DONE, 'utf8')) : ''

const selfForm = stripComments(
  fs.readFileSync(
    path.join(ROOT, 'app', 'app', '[churchId]', 'answer', '[categoryId]', 'self-form.tsx'),
    'utf8',
  ),
)

describe('assessment completion screen', () => {
  it('adds the dedicated done page', () => {
    expect(doneExists, 'app/app/[churchId]/done/page.tsx must exist').toBe(true)
  })

  it('shows the exact approved reassurance copy', () => {
    expect(done).toContain('Thank you for completing the assessment.')
    expect(done).toContain(
      "Your responses go to your church's exec team, who use this assessment to strengthen the overall health and embodiment of your church.",
    )
    expect(done).toContain(
      "We've let your church execs know you've completed the assessment — so nothing further is needed from you.",
    )
    expect(done, 'the dashboard return link text').toContain('Back to your dashboard')
  })

  it('guards itself: redirects to the dashboard unless every category is covered', () => {
    expect(done, 'must compute own coverage from get_member_run_coverage').toContain(
      'get_member_run_coverage',
    )
    expect(done, 'must classify coverage via the shared coverage() helper').toContain(
      'coverage(rows, categories)',
    )
    expect(done, 'must redirect to the dashboard when not fully covered').toContain(
      'redirect(`/app/${churchId}`)',
    )
    expect(done, 'the completeness guard must compare coveredCount to categories.length').toMatch(
      /coveredCount\s*!==\s*categories\.length/,
    )
  })

  it('is reached via the section-complete interstitial, not a direct self-form push', () => {
    // Finish now hands off to answer/${categoryId}/complete; that interstitial redirects here on
    // its `done` action. So self-form must NOT push straight to /done anymore. (The positive
    // interstitial wiring is pinned in self-form-complete-wiring.test.ts.)
    expect(
      selfForm,
      'Finish no longer pushes straight to /done — it routes through the interstitial; a revert must fail here',
    ).not.toContain('router.push(`/app/${churchId}/done`)')
    expect(
      selfForm,
      'and still must not drop back on the bare dashboard',
    ).not.toContain('router.push(`/app/${churchId}`)')
  })

  it('delegates the church + membership gate to the shared helper', () => {
    expect(done, 'imports the shared guard').toContain(
      "from '@/lib/auth/require-church-membership'",
    )
    expect(done, 'calls the shared guard').toContain('requireChurchMembership(')
    // Decision #3 reverse-guard: /done stays notFound()-only on unauth — it must NOT opt into a
    // sign-in redirect. Adding signInNext to the /done guard turns these red.
    expect(done, 'no sign-in redirect on /done').not.toContain('/sign-in?next=')
    expect(done, 'must not opt into signInNext').not.toContain('signInNext')
  })
})
