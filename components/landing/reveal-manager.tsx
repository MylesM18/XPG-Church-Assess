'use client'

import { useEffect } from 'react'

// Ports the prototype's [data-reveal] logic verbatim: only elements below 92%
// of the viewport at mount are hidden (no flash on above-fold content), then
// an IntersectionObserver reveals each once. Mounted last inside the wrapper.
// Runs under reduced motion too — the globals.css kill switch makes it instant.
export function RevealManager() {
  useEffect(() => {
    let io: IntersectionObserver | undefined
    const raf = requestAnimationFrame(() => {
      const els = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'))
      const vh = window.innerHeight
      const below = els.filter((el) => el.getBoundingClientRect().top > vh * 0.92)
      below.forEach((el) => {
        el.style.opacity = '0'
        el.style.transform = 'translateY(26px)'
        el.style.transition = 'opacity .7s ease, transform .7s cubic-bezier(.22,.61,.2,1)'
        el.style.transitionDelay = (el.getAttribute('data-reveal') || '0') + 'ms'
      })
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const el = entry.target as HTMLElement
              el.style.opacity = '1'
              el.style.transform = 'none'
              io?.unobserve(el)
            }
          })
        },
        { threshold: 0.08 }
      )
      below.forEach((el) => io?.observe(el))
    })
    return () => {
      cancelAnimationFrame(raf)
      io?.disconnect()
    }
  }, [])

  return null
}
