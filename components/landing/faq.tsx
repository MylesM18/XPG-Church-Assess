'use client'

import { useState } from 'react'

const ITEMS = [
  {
    num: 'Q.01',
    q: 'What is the Church Health Assessment, exactly?',
    a: 'A guided diagnostic for church leaders. You answer evidence-anchored questions across eight areas of ministry — five that make up the discipleship journey itself, Welcome through Multiply, and three that hold it up: governance, communication, and systems. Instead of handing back eight scores, it walks the five stages in order, finds the earliest meaningful gap, and checks whether one of the three foundations is quietly capping it. You get one clear finding, the evidence behind it, and a single next step.',
  },
  {
    num: 'Q.02',
    q: 'Why one priority instead of eight scores?',
    a: 'Because eight numbers, all shouting at once, don\'t tell you where to start. Each stage strengthens the next, so the assessment walks the journey in order and names the earliest real gap. The later ones may still matter — but they are often struggling because of that first one, which makes fixing them first effort you spend twice. Start where the journey first gives way, and the stages after it get easier.',
  },
  {
    num: 'Q.03',
    q: 'Who answers the questions?',
    a: 'You can answer all eight areas yourself, or invite other leaders to answer alongside you. An invitation arrives as a private email link; they sign in with it, answer the same eight areas, and that is the whole ask. Invited members never see the results — no scores, no findings — so nobody answers with one eye on how it will look. And where two leaders read the same area differently, that disagreement is not averaged away; it becomes a finding of its own.',
  },
  {
    num: 'Q.04',
    q: 'What does the AI actually do?',
    a: 'Less than you\'d think — and by default, nothing at all. Every score, the primary finding, and your next step are calculated the same way every time, straight from your answers. The assessment ships with AI phrasing switched off, and the report reads fine without it. Turn it on and its only job is wording — and even then, it is checked against the real numbers five separate ways before it reaches you. Any sentence that drifts from the data is thrown out and the plain version is used instead. The AI never decides what is true about your church.',
  },
  {
    num: 'Q.05',
    q: 'Who can see our results?',
    a: 'Only your admins and co-admins — enforced in the database itself, not by a settings toggle someone can flip. Everyone else you invite can answer, but the results page is simply not theirs to open. When you do want to share, you choose how: download the full diagnosis as a clean PDF for your elders, or mint a private link for a board member with no account — and switch that link off the moment you are done with it.',
  },
  {
    num: 'Q.06',
    q: 'What if nothing is actually wrong?',
    a: 'Then it says so, plainly. If no stage of the journey is breaking, the assessment will not manufacture a problem to justify itself — it moves to a capacity conversation instead: not what is broken, but how much your current structure can carry before it strains. An assessment willing to tell you that you are healthy is the only kind you can believe when it tells you that you are not.',
  },
]

export function Faq() {
  const [faq, setFaq] = useState(0)

  const toggle = (i: number) => {
    setFaq((f) => (f === i ? -1 : i))
  }

  return (
    <div className="xp-faq-list" data-reveal="80">
      {ITEMS.map((item, i) => (
        <div
          key={item.num}
          className={i === ITEMS.length - 1 ? 'xp-faq-item xp-faq-item-last' : 'xp-faq-item'}
        >
          <button className="xp-faq-btn" aria-expanded={faq === i} onClick={() => toggle(i)}>
            <span className="xp-faq-q">
              <span className="xp-faq-num">{item.num}</span>
              <span className="xp-faq-title">{item.q}</span>
            </span>
            <span aria-hidden="true" className={faq === i ? 'xp-faq-icon xp-faq-icon-open' : 'xp-faq-icon'}>
              ✚
            </span>
          </button>
          <div className={faq === i ? 'xp-collapse xp-collapse-open' : 'xp-collapse'}>
            <div className="xp-collapse-inner">
              <p className="xp-faq-a">{item.a}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
