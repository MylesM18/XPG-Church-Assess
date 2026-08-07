'use client'

import { useState } from 'react'

const ITEMS = [
  {
    num: 'Q.01',
    q: 'What is the Church Health Assessment, exactly?',
    a: 'A guided diagnostic for church leaders. You answer evidence-anchored questions across eight areas of ministry; instead of returning eight scores, it walks the discipleship journey in order — Welcome, Belong, Become, Build, Multiply — and looks for the earliest meaningful gap. You get one clear finding, the evidence behind it, and a single next step.',
  },
  {
    num: 'Q.02',
    q: 'Why one priority instead of eight scores?',
    a: 'Because eight numbers, all shouting at once, don\'t tell you where to start. Each stage of the journey strengthens the next, so the assessment walks it in order and names the earliest significant gap. Other concerns may still matter, but that earliest gap often explains why later stages are struggling — so it is where your leaders should focus first.',
  },
  {
    num: 'Q.03',
    q: 'Who answers the questions?',
    a: 'You can answer all eight areas yourself, or invite the leader who knows each area best to answer just that one — through a private email link, with no account to create. Invited leaders never see results or scores, so they answer honestly. Where two leaders disagree, that disagreement becomes a finding of its own.',
  },
  {
    num: 'Q.04',
    q: 'What does the AI actually do?',
    a: 'Less than you\'d think — on purpose. The finding, the scores, and the primary constraint are calculated the same way every time, straight from your answers. AI is used only to phrase the report in plain, warm language. Turn it off entirely and you get the identical finding, just in rougher words.',
  },
  {
    num: 'Q.05',
    q: 'Who can see our results?',
    a: 'Only your church\'s leadership and the viewers you approve — enforced at the data layer, not a settings toggle. Download the full diagnosis as a clean PDF for your elders, or send a private, revocable share link to a board member without an account — and switch it off the moment you want to.',
  },
  {
    num: 'Q.06',
    q: 'What if nothing is actually wrong?',
    a: 'Then it says so, plainly. If the journey is healthy the assessment won\'t invent a problem to sell you — it moves to a capacity conversation about the next ceiling you\'ll hit. An assessment that can say "you\'re fine" is one you can trust when it says "you\'re not."',
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
