'use client'

import { useEffect, useState } from 'react'

import { registerRestart, restartAllTimers } from '@/components/landing/landing-timers'
import { useReducedMotion } from '@/components/landing/use-reduced-motion'

const TABS = [
  { step: 'STEP 01', name: 'PROFILE' },
  { step: 'STEP 02', name: 'HAND OFF' },
  { step: 'STEP 03', name: 'DIAGNOSIS' },
]

export function HowTabs() {
  const reduced = useReducedMotion()
  const [how, setHow] = useState(0)

  useEffect(() => {
    if (reduced) return
    let id = 0
    const start = () => {
      window.clearInterval(id)
      id = window.setInterval(() => {
        if (!document.hidden) setHow((h) => (h + 1) % 3)
      }, 5200)
    }
    start()
    const unregister = registerRestart(start)
    return () => {
      unregister()
      window.clearInterval(id)
    }
  }, [reduced])

  const select = (i: number) => {
    setHow(i)
    restartAllTimers()
  }

  const fillClass = (i: number) => {
    if (how !== i) return 'xp-howfill'
    return reduced ? 'xp-howfill xp-howfill-full' : 'xp-howfill xp-howfill-run'
  }

  return (
    <section id="how" className="xp-section">
      <div className="xp-sechead">
        <span>n.002</span>
        <span>HOW IT WORKS</span>
        <span>n.002</span>
      </div>
      <h2 data-reveal="0" className="xp-h2 xp-h2-mt">
        Three simple steps to the results.
      </h2>
      <div data-reveal="80" className="xp-how-wrap">
        <div className="xp-howtabs">
          {TABS.map((tab, i) => (
            <button
              key={tab.name}
              className={how === i ? 'xp-howtab xp-howtab-active' : 'xp-howtab'}
              aria-pressed={how === i}
              onClick={() => select(i)}
            >
              <span className="xp-howtab-step">{tab.step}</span>
              <span className="xp-howtab-name">{tab.name}</span>
              <span className="xp-howtab-bar">
                <span className={fillClass(i)} />
              </span>
            </button>
          ))}
        </div>
        <div className="xp-how-panels">
          {how === 0 && (
            <div className="xp-how-panel">
              <div className="xp-how-panel-card">
                <div className="xp-card">
                  <div className="xp-cardhead">
                    <span>YOUR CHURCH PROFILE</span>
                    <span>2 MIN</span>
                  </div>
                  <div className="xp-profile-body">
                    <div className="xp-profile-row">
                      <span className="xp-profile-key">Weekly attendance</span>
                      <span className="xp-profile-val">480</span>
                    </div>
                    <div className="xp-profile-row">
                      <span className="xp-profile-key">Staff</span>
                      <span className="xp-profile-val">6 full-time</span>
                    </div>
                    <div className="xp-profile-row">
                      <span className="xp-profile-key">Context</span>
                      <span className="xp-profile-val">Suburban</span>
                    </div>
                    <div className="xp-profile-badge-row">
                      <span className="xp-pill">BENCHMARK SET · YOUR SIZE BAND</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="xp-how-panel-copy">
                <h3 className="xp-h3">Create your church profile.</h3>
                <p className="xp-how-panel-p">
                  A quick overview — size, staff, budget, context. It sets the benchmark every
                  score is measured against, so a 600-person church is never measured against a
                  megachurch. You&apos;re compared to churches like yours.
                </p>
              </div>
            </div>
          )}
          {how === 1 && (
            <div className="xp-how-panel">
              <div className="xp-how-panel-card">
                <div className="xp-card">
                  <div className="xp-cardhead">
                    <span>INVITE BY AREA</span>
                    <span>PRIVATE LINKS</span>
                  </div>
                  <div className="xp-profile-body">
                    <div className="xp-invite-row">
                      <span>
                        <strong>Guest Experience</strong>
                        <span className="xp-invite-sub">welcome lead</span>
                      </span>
                      <span className="xp-invite-tag">ANSWERED ●</span>
                    </div>
                    <div className="xp-invite-row">
                      <span>
                        <strong>Volunteering</strong>
                        <span className="xp-invite-sub">serve-team lead — and the associate</span>
                      </span>
                      <span className="xp-invite-tag">2 INVITED ✓</span>
                    </div>
                    <div className="xp-invite-row">
                      <span>
                        <strong>Generosity</strong>
                        <span className="xp-invite-sub">answered by you</span>
                      </span>
                      <span className="xp-invite-tag xp-invite-tag-you">YOU</span>
                    </div>
                    <p className="xp-invite-note">
                      No account to create. Invited leaders never see results — so they answer
                      honestly.
                    </p>
                  </div>
                </div>
              </div>
              <div className="xp-how-panel-copy">
                <h3 className="xp-h3">Answer it yourself, or hand it off.</h3>
                <p className="xp-how-panel-p">
                  Answer all eight areas yourself, or invite the leader who knows each area best to
                  weigh in on just that one — through a private email link. You can invite more
                  than one person per area, and where they disagree is often the most useful
                  finding of all.
                </p>
              </div>
            </div>
          )}
          {how === 2 && (
            <div className="xp-how-panel">
              <div className="xp-how-panel-card">
                <div className="xp-card-dark">
                  <div className="xp-cardhead-dark">
                    <span>YOUR DIAGNOSIS</span>
                    <span>PRIVATE</span>
                  </div>
                  <div className="xp-diag-body">
                    <div>
                      <div className="xp-diag-label">PRIMARY FINDING</div>
                      <div className="xp-diag-verdict">
                        Your earliest gap is <span className="xp-diag-hl">Belong — community &amp; connection.</span>
                      </div>
                    </div>
                    <div className="xp-diag-row">
                      <span className="xp-diag-key">Not yet</span>
                      <span className="xp-diag-strike">Generosity — downstream</span>
                    </div>
                    <div className="xp-diag-row">
                      <span className="xp-diag-key">Next step</span>
                      <span className="xp-diag-val">One clear move, matched to you</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="xp-how-panel-copy">
                <h3 className="xp-h3">Read your diagnosis.</h3>
                <p className="xp-how-panel-p">
                  Not just another scorecard. A clear next-step priority: the one thing most
                  limiting health and discipleship right now, the evidence behind it, what{' '}
                  <em>not</em> to spend a year on, and the single next step. Visible only to you
                  and whoever you approve.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
