// Source-reading tripwire (node env, no DOM): the public FAQ's "What does the AI actually do?"
// answer must describe the product that ships. Since PR #79 (lib/ai/prose-mode.ts) a keyed
// deployment has AI ON by default and the report model runs when an admin views the diagnosis;
// the answer used to say "by default, nothing at all … ships with AI phrasing switched off. Turn
// it on…" — the only public statement of the AI default, and it said the opposite of what ships
// (post-merge review of PR #79, finding 7). Scoped to the Q.04 entry so a stray phrase elsewhere
// in the file can neither satisfy nor break it. What the answer MUST keep saying is the part that
// is still true and load-bearing: the AI's only job is wording, and it never decides the finding.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SOURCE = fs.readFileSync(path.join(ROOT, 'components', 'landing', 'faq.tsx'), 'utf8')

const start = SOURCE.indexOf("num: 'Q.04'")
const end = SOURCE.indexOf("num: 'Q.05'")
const q04 = start === -1 || end === -1 ? '' : SOURCE.slice(start, end)

describe('landing FAQ Q.04 — what the AI does', () => {
  it('finds the Q.04 entry (non-vacuity)', () => {
    expect(q04).toContain('What does the AI actually do?')
  })

  it('no longer claims AI is off by default or needs turning on', () => {
    expect(q04).not.toContain('switched off')
    expect(q04).not.toContain('by default, nothing')
    expect(q04).not.toContain('Turn it on')
    expect(q04).not.toMatch(/\boff by default\b/i)
    expect(q04).not.toMatch(/\bopt[- ]?in\b/i)
  })

  it('still says the AI only words the report and never decides the finding, and that the report stands without it', () => {
    expect(q04).toContain('only job is wording')
    expect(q04).toContain('never decides what is true about your church')
    expect(q04).toContain('reads fine without it')
    expect(q04).toContain('checked against the real numbers')
  })
})
