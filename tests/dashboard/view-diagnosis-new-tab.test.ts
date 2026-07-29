// Source-reading tripwire (node env, no DOM): the admin dashboard's "View diagnosis" control is a
// next/link that must open the report in a NEW browser tab — target="_blank" + rel="noopener
// noreferrer" — with a visible ↗ affordance and a screen-reader cue so the context switch isn't
// silent. target/rel/aria attributes and the sr-only span are invisible to a static render, so we
// assert against the source. Scoped to the diagnosis link's own JSX block (not the whole file) so
// an unrelated new-tab link elsewhere can't satisfy it, and it doubles as a reverse guard against
// accidental removal. Comments are stripped so a prose mention can neither satisfy nor break it.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SOURCE = fs.readFileSync(path.join(ROOT, 'app', 'app', '[churchId]', 'page.tsx'), 'utf8')
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

// Isolate the <Link ...>View diagnosis...</Link> block: from its diagnosis href to the next </Link>.
const linkStart = CODE.indexOf('`/app/${churchId}/diagnosis`')
const diagnosisLink =
  linkStart === -1 ? '' : CODE.slice(linkStart, CODE.indexOf('</Link>', linkStart) + '</Link>'.length)

describe('dashboard "View diagnosis" opens in a new tab', () => {
  it('anchors on the diagnosis link block', () => {
    expect(linkStart, 'the /app/[churchId]/diagnosis link must exist').not.toBe(-1)
    expect(diagnosisLink, 'the block must carry the visible "View diagnosis" label').toContain(
      'View diagnosis',
    )
  })

  it('opens in a new tab with a safe rel', () => {
    expect(diagnosisLink, 'the diagnosis link must open a new browser tab').toContain(
      'target="_blank"',
    )
    expect(diagnosisLink, 'a _blank link must carry rel="noopener" to sever window.opener').toMatch(
      /rel="noopener noreferrer"/,
    )
  })

  it('signals the new tab to sighted and screen-reader users', () => {
    expect(diagnosisLink, 'a visible ↗ affordance marks the new-tab link').toContain('↗')
    expect(diagnosisLink, 'a screen-reader-only cue announces the new tab').toMatch(
      /sr-only[^>]*>\s*\(opens in a new tab\)/,
    )
  })
})
