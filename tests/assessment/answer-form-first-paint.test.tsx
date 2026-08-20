// What the member actually SEES on an untouched question. The sibling tripwires in
// tests/a11y/answer-form-wizard.test.ts read the source; this one renders the real component
// (react-dom/server — no DOM, no new deps) so the behaviour is asserted, not the spelling.
// The bug it pins: the thumb sat at 5 while the readout said "—" and Next stayed disabled, so a
// member who meant 5 had to drag off the midpoint and back before the form would take it.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AnswerForm } from '@/components/answer-form'

const items = [
  {
    id: 'GEN1',
    text: 'Our leaders can name the specific people they are discipling right now.',
    anchors: { lo: 'No one could name a person.', mid: 'A few could.', hi: 'Every leader could.' },
  },
  { id: 'GEN2', text: 'Second question.', anchors: { lo: 'lo', mid: 'mid', hi: 'hi' } },
]

function paint(initialValues: Record<string, number>) {
  return renderToStaticMarkup(
    <AnswerForm
      categoryName="Disciple-Making"
      items={items}
      initialValues={initialValues}
      onSaveAnswer={async () => ({ ok: true })}
      onComplete={() => {}}
    />,
  )
}

describe('first paint of an untouched question', () => {
  const html = paint({})
  it('sets the range input to 5', () => {
    expect(html).toMatch(/type="range"[^>]*value="5"/)
  })
  it('shows the number 5, not an em-dash', () => {
    expect(html).toContain('>5</span>')
    expect(html).not.toContain('—</span>')
  })
  it('lights the Developing band (4–7) from the start', () => {
    const devCard = html.slice(html.indexOf('Developing') - 400, html.indexOf('Developing') + 200)
    expect(devCard).toContain('border-ink bg-sand text-ink')
  })
  it('leaves Next enabled', () => {
    expect(html).toContain('aria-disabled="false"')
    expect(html).not.toMatch(/aria-disabled="true"[^>]*>Next/)
  })
  it('still honours a saved answer on resume (Take Again opens at step 0)', () => {
    // Both answered => firstUnansweredStep returns 0, so we see GEN1's own saved 9, not the default.
    const resumed = paint({ GEN1: 9, GEN2: 2 })
    expect(resumed).toMatch(/type="range"[^>]*value="9"/)
    expect(resumed).toContain('>9</span>')
    expect(resumed).toContain('Strong <span class="text-xs">(8\u201310)</span></span><span class="sr-only"> \u2014 where you land')
  })
  it('opens at the first UNANSWERED question, which shows the default', () => {
    const partial = paint({ GEN1: 9 })
    expect(partial).toContain('Question 2 of 2')
    expect(partial).toMatch(/type="range"[^>]*value="5"/)
  })
})
