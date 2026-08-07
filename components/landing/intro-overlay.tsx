'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'

import { useReducedMotion } from '@/components/landing/use-reduced-motion'

type Phase = 'idle' | 'leave' | 'done'

// Rendered during SSR ('idle') so the overlay is visible before hydration;
// reduced-motion users never see it thanks to the .xp-intro display:none
// media query in landing.css plus the reduced short-circuit below.
export function IntroOverlay() {
  const reduced = useReducedMotion()
  const [phase, setPhase] = useState<Phase>('idle')
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (reduced) return
    let c = 0
    let leaveId = 0
    let doneId = 0
    const countId = window.setInterval(() => {
      c = Math.min(100, c + 2 + Math.ceil(Math.random() * 4))
      setCount(c)
      if (c >= 100) {
        window.clearInterval(countId)
        leaveId = window.setTimeout(() => setPhase('leave'), 240)
        doneId = window.setTimeout(() => setPhase('done'), 950)
      }
    }, 26)
    return () => {
      window.clearInterval(countId)
      window.clearTimeout(leaveId)
      window.clearTimeout(doneId)
    }
  }, [reduced])

  if (reduced || phase === 'done') return null

  return (
    <div aria-hidden="true" className={phase === 'leave' ? 'xp-intro xp-intro-leave' : 'xp-intro'}>
      <div className="xp-intro-top">
        <Image
          src="/landing/logo-light.png"
          alt="XP Gathering"
          width={750}
          height={100}
          className="xp-intro-logo"
        />
        <span className="xp-intro-tag">CHURCH HEALTH ASSESSMENT</span>
      </div>
      <div className="xp-intro-bottom">
        <span className="xp-intro-walk">WALKING THE JOURNEY…</span>
        <span className="xp-intro-count">{String(count).padStart(3, '0')}</span>
      </div>
    </div>
  )
}
