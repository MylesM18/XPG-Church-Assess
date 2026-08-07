'use client'

import { Fragment, useEffect, useState } from 'react'

import { registerRestart, restartAllTimers } from '@/components/landing/landing-timers'
import { useReducedMotion } from '@/components/landing/use-reduced-motion'

const ITEMS = [
  {
    num: 'P.01',
    title: 'EVIDENCE, NOT VIBES — PRAYERFUL DISCERNMENT, SUPPORTED BY HONEST DATA.',
    body: 'We believe spiritual discernment and measurable evidence should work together. Every question is anchored to observable behaviors, ownership, and outcomes — a real percentage, a real practice, a real "who owns this." Leaders locate their church on a defined 1-to-10 scale rather than rating a feeling, which helps them move beyond assumptions without removing prayer, wisdom, or pastoral context.',
  },
  {
    num: 'P.02',
    title: 'THE MATH IS FIXED.',
    body: 'The finding, the scores, and the primary constraint are calculated the same way every time, straight from your answers. AI only helps the report read well — it never decides your diagnosis. Turn it off entirely and you get the identical finding, in rougher words.',
  },
  {
    num: 'P.03',
    title: 'YOUR SIZE BAND.',
    body: 'Scores are benchmarked against churches your size — so a 600-person church isn\'t measured against a megachurch, and a church plant isn\'t graded like an institution.',
  },
  {
    num: 'P.04',
    title: 'HONEST ENOUGH TO SAY NOTHING\'S WRONG.',
    body: 'If the journey is healthy, it says so plainly and moves to a capacity conversation instead of inventing a problem to sell you. An assessment that can say "you\'re fine" is one you can trust when it says "you\'re not."',
  },
]

export function WhyAccordion() {
  const reduced = useReducedMotion()
  const [why, setWhy] = useState(0)

  useEffect(() => {
    if (reduced) return
    let id = 0
    const start = () => {
      window.clearInterval(id)
      id = window.setInterval(() => {
        if (!document.hidden) setWhy((w) => (w + 1) % 4)
      }, 6200)
    }
    start()
    const unregister = registerRestart(start)
    return () => {
      unregister()
      window.clearInterval(id)
    }
  }, [reduced])

  const select = (i: number) => {
    setWhy(i)
    restartAllTimers()
  }

  return (
    <div className="xp-why-col">
      <div data-reveal="0">
        {ITEMS.map((item, i) => (
          <Fragment key={item.num}>
            <button
              className={why === i ? 'xp-whyrow xp-whyrow-active' : 'xp-whyrow'}
              aria-expanded={why === i}
              onClick={() => select(i)}
            >
              <span className="xp-whyrow-num">{item.num}</span>
              {item.title}
            </button>
            <div className={why === i ? 'xp-collapse xp-collapse-open' : 'xp-collapse'}>
              <div className="xp-collapse-inner">
                <p className="xp-why-p">{item.body}</p>
              </div>
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  )
}
