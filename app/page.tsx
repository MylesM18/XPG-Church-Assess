import { Archivo, Archivo_Black, IBM_Plex_Mono } from 'next/font/google'
import Image from 'next/image'
import Link from 'next/link'
import { Fragment } from 'react'

import { Faq } from '@/components/landing/faq'
import { HowTabs } from '@/components/landing/how-tabs'
import { IntroOverlay } from '@/components/landing/intro-overlay'
import { RevealManager } from '@/components/landing/reveal-manager'
import { WhyAccordion } from '@/components/landing/why-accordion'

import './landing.css'

const archivo = Archivo({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--xp-font-archivo' })
const archivoBlack = Archivo_Black({ subsets: ['latin'], weight: '400', variable: '--xp-font-archivo-black' })
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--xp-font-mono' })

const LIGHT_MARQUEE = [
  'NOT JUST ANOTHER SCORECARD. A CLEAR NEXT-STEP PRIORITY.',
  'THE EARLIEST MEANINGFUL GAP, NOT THE LOWEST SCORE.',
  'WE DON\'T SIMPLY GRADE YOUR CHURCH. WE HELP YOU DISCERN.',
]

const DARK_MARQUEE = [
  'YOUR GIVING ISN\'T YOUR PROBLEM. IT\'S YOUR SYMPTOM.',
  'AN ASSESSMENT HONEST ENOUGH TO TELL YOU NOTHING\'S WRONG.',
  'YOUR CEILING IS THE NUMBER OF DISCIPLES WHO CAN DISCIPLE OTHERS.',
]

const STAGES = [
  {
    src: '/landing/img/stage-guest.jpg',
    alt: 'Wooden pews inside a warm, light-filled sanctuary',
    badge: 'STAGE 01/05',
    title: 'Welcome',
    area: 'Guest Experience',
    hook: '"Are people being seen, known, and intentionally followed up with?"',
    body: 'Measures hospitality, follow-up, and first steps — whether the people God sends you are noticed, welcomed, and actually followed up with.',
  },
  {
    src: '/landing/img/stage-community.jpg',
    alt: 'Friends arm in arm watching the sunset',
    badge: 'STAGE 02/05',
    title: 'Belong',
    area: 'Community & Connection',
    hook: '"Are people moving from attendance into genuine biblical community?"',
    body: 'Measures connection, relationships, groups, assimilation, and care — and finds the quiet edge of people no one would notice leaving, before they do.',
  },
  {
    src: '/landing/img/stage-disciple.jpg',
    alt: 'People seated in rows taking notes',
    badge: 'STAGE 03/05',
    title: 'Become',
    area: 'Discipleship & Leadership Development',
    hook: '"Are people merely attending — or becoming mature disciples who can help others follow Jesus?"',
    body: 'Measures spiritual formation, biblical growth, discipleship clarity, and next steps — whether you have a real pathway to maturity and multiplication, not just participation in programs.',
  },
  {
    src: '/landing/img/stage-volunteer.jpg',
    alt: 'Volunteers moving crates together',
    badge: 'STAGE 04/05',
    title: 'Build',
    area: 'Serving, Calling & Leadership',
    hook: '"A serving culture — or a handful of heroes about to burn out?"',
    body: 'Measures serving, calling, volunteer health, leadership development, and ownership — whether people are equipped to use their gifts, receive care, and grow into greater Kingdom responsibility.',
  },
  {
    src: '/landing/img/stage-give.jpg',
    alt: 'Open hands holding coins and a handwritten note',
    badge: 'STAGE 05/05',
    title: 'Multiply',
    area: 'Generosity & Multiplication',
    hook: '"Is generosity being formed as a spiritual discipline and an expression of Kingdom trust?"',
    body: 'Measures generosity, evangelism, community impact, mission, and disciple-making — and whether weak giving is signalling a deeper break in belonging, formation, leadership, or vision.',
  },
]

const ENABLERS = [
  {
    num: 'E1',
    title: 'Governance & Accountability',
    hook: '"Does your leadership structure create clarity, trust, accountability, and faithful stewardship?"',
    body: 'Healthy governance protects the mission, strengthens leadership trust, and helps Kingdom priorities endure beyond personalities and seasons.',
  },
  {
    num: 'E2',
    title: 'Communication',
    hook: '"Can people clearly understand the vision, their next step, and how to participate?"',
    body: 'Healthy communication turns vision into shared ownership, and helps people move toward belonging, discipleship, serving, and mission.',
  },
  {
    num: 'E3',
    title: 'Organizational Structure & Systems',
    hook: '"Will your systems survive the growth you\'re praying for?"',
    body: 'Systems are not the mission — but weak systems can limit the mission. Measures whether your structure supports people, protects leaders, and creates capacity for sustainable Kingdom growth.',
  },
]

function MarqGroup({ items }: { items: string[] }) {
  return (
    <div className="xp-marq-group">
      {items.map((text) => (
        <Fragment key={text}>
          <span>{text}</span>
          <span>✚</span>
        </Fragment>
      ))}
    </div>
  )
}

export default function Home() {
  return (
    <div id="top" className={`${archivo.variable} ${archivoBlack.variable} ${plexMono.variable} xp-landing`}>
      <IntroOverlay />
      <noscript><style>{'.xp-intro{display:none}'}</style></noscript>
      <header className="xp-header">
        <a href="#top" aria-label="XP Gathering home" className="xp-header-home">
          <Image src="/landing/logo-dark.png" alt="+XP GATHERING" width={750} height={100} className="xp-header-logo" />
        </a>
        <Link href="/sign-in" className="xp-signin">SIGN IN</Link>
      </header>
      <main id="main-content" tabIndex={-1} className="xp-main">
        <section className="xp-hero">
          <div className="xp-hero-rule">
            <span>N°001</span>
            <span className="xp-hero-line" />
            <span>CHURCH HEALTH ASSESSMENT</span>
            <span className="xp-hero-dot" />
          </div>
          <h1 className="xp-h1">
            Is your church <span className="xp-hl">forming disciples</span> — or simply managing attendance?
          </h1>
          <div className="xp-hero-row">
            <p className="xp-hero-lead">
              Every person moves through a spiritual journey — from being welcomed, to finding belonging, growing
              as a disciple, serving with purpose, living generously, and helping others follow Jesus. This
              assessment identifies where that journey may be breaking down, what may be limiting Kingdom impact,
              and where your leaders should focus next.
            </p>
            <div className="xp-hero-ctas">
              <Link href="/sign-up" className="xp-cta">BEGIN THE ASSESSMENT →</Link>
              <a href="#how" className="xp-cta-ghost">HOW IT WORKS ↓</a>
            </div>
          </div>
          <figure data-reveal="0" className="xp-hero-fig">
            <Image
              src="/landing/img/hero.jpg"
              alt="A congregation in worship, hands raised in warm light"
              width={1600}
              height={1064}
              className="xp-hero-img"
              priority
            />
            <span className="xp-hero-badge">DIAGNOSTIC · V1</span>
            <figcaption className="xp-figcap">
              <span>FIG.01 — SUNDAY, 9:04 AM</span>
              <span className="xp-figcap-r">THE JOURNEY BEGINS AT THE FRONT DOOR</span>
            </figcaption>
          </figure>
          <div className="xp-stats">
            <div className="xp-stat">
              <div className="xp-stat-num">8</div>
              <div className="xp-stat-label">AREAS ASSESSED</div>
            </div>
            <div className="xp-stat-mid">
              <div className="xp-stat-num">5</div>
              <div className="xp-stat-label">STAGES OF THE JOURNEY</div>
            </div>
            <div className="xp-stat-last">
              <div className="xp-stat-num-hl">1</div>
              <div className="xp-stat-label">NEXT-STEP PRIORITY</div>
            </div>
          </div>
        </section>

        <section className="xp-section">
          <div className="xp-sechead">
            <span>✚</span>
            <span>WHY THIS MATTERS</span>
            <span>✚</span>
          </div>
          <blockquote data-reveal="0" className="xp-what-quote">
            <p className="xp-what-quote-p xp-what-quote-p-lede">
              Church health is not ultimately about bigger attendance, stronger systems, or larger budgets. It is
              about forming disciples, strengthening leaders, serving communities, and advancing the{' '}
              <span className="xp-hl">Kingdom&nbsp;of&nbsp;God.</span>
            </p>
            <p className="xp-what-quote-sub">
              Systems matter because people matter. Healthy structure creates greater capacity for discipleship,
              leadership, care, mission, and sustainable Kingdom growth.
            </p>
          </blockquote>
        </section>

        <div aria-hidden="true" className="xp-marq xp-marq-light">
          <div className="xp-marq-track">
            <MarqGroup items={LIGHT_MARQUEE} />
            <MarqGroup items={LIGHT_MARQUEE} />
          </div>
        </div>

        <section id="what" className="xp-section">
          <div className="xp-sechead">
            <span>n.001</span>
            <span>THE BIG IDEA</span>
            <span>n.001</span>
          </div>
          <div className="xp-what-cols">
            <div className="xp-what-copy">
              <h2 data-reveal="0" className="xp-h2">Every stage strengthens the next.</h2>
              <p data-reveal="60" className="xp-what-p">
                A report card can&apos;t form a disciple. A dozen numbers, all shouting at once, still leave you
                guessing what to strengthen first — and chasing the lowest score can pour a year into a symptom.
              </p>
              <p data-reveal="120" className="xp-what-p">
                People do not always move through church life in exactly the same order, but healthy churches
                consistently help people move from <em>encounter</em> to <em>belonging</em>, <em>formation</em>,{' '}
                <em>contribution</em>, and <em>multiplication</em>. When one stage is weak, progress elsewhere
                becomes harder to sustain. So the assessment walks that journey in order and looks for the{' '}
                <strong>earliest significant gap</strong>. Other concerns may still matter, but that earliest gap
                often explains why later stages are struggling.
              </p>
            </div>
            <div data-reveal="100" className="xp-what-card-col">
              <div className="xp-card">
                <div className="xp-cardhead">
                  <span>EXHIBIT A — THE JOURNEY, WALKED IN ORDER</span>
                  <span>ILLUSTRATIVE</span>
                </div>
                <div className="xp-chain">
                  <div className="xp-chain-row">
                    <span className="xp-chain-num">01</span>
                    <span className="xp-chain-name">Welcome</span>
                    <span className="xp-chain-tag">HEALTHY ✓</span>
                  </div>
                  <div className="xp-chain-link" />
                  <div className="xp-chain-row">
                    <span className="xp-chain-num">02</span>
                    <span className="xp-chain-name">Belong</span>
                    <span className="xp-chain-tag">HEALTHY ✓</span>
                  </div>
                  <div className="xp-chain-break">
                    <span className="xp-chain-bolt">⌁</span>
                    <span className="xp-chain-flag">EARLIEST MEANINGFUL GAP — START HERE</span>
                  </div>
                  <div className="xp-chain-row xp-chain-row-dim">
                    <span className="xp-chain-num">03</span>
                    <span className="xp-chain-name">Become</span>
                    <span className="xp-chain-tag">DOWNSTREAM</span>
                  </div>
                  <div className="xp-chain-link xp-chain-link-dim" />
                  <div className="xp-chain-row xp-chain-row-dim">
                    <span className="xp-chain-num">04</span>
                    <span className="xp-chain-name">Build</span>
                    <span className="xp-chain-tag">DOWNSTREAM</span>
                  </div>
                  <div className="xp-chain-link xp-chain-link-dim" />
                  <div className="xp-chain-row xp-chain-row-dim">
                    <span className="xp-chain-num">05</span>
                    <span className="xp-chain-name">Multiply</span>
                    <span className="xp-chain-tag">DOWNSTREAM</span>
                  </div>
                  <p className="xp-chain-note">
                    Strengthen the gap at 02, and the &quot;problems&quot; at 03–05 often begin resolving on
                    their own.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <blockquote data-reveal="0" className="xp-what-quote">
            <p className="xp-what-quote-p">
              A low giving number usually isn&apos;t a giving problem. It&apos;s often the last{' '}
              <span className="xp-hl">echo</span> of a gap higher up the journey.
            </p>
            <p className="xp-what-quote-sub">We help you find the gap — so you stop treating the echo.</p>
          </blockquote>
        </section>

        <HowTabs />

        <section id="areas" className="xp-areas">
          <div className="xp-areas-pad">
            <div className="xp-sechead">
              <span>n.003</span>
              <span>THE EIGHT AREAS</span>
              <span>n.003</span>
            </div>
            <div className="xp-areas-head">
              <h2 data-reveal="0" className="xp-h2">Eight areas.<br />One journey.</h2>
              <p data-reveal="60" className="xp-areas-lead">
                Five <strong>stages</strong> — Welcome → Belong → Become → Build → Multiply, the journey a person
                actually takes — and three <strong>enablers</strong>: what the organization does to make that
                journey work.
              </p>
            </div>
          </div>
          <div data-reveal="80" className="xp-stages">
            {STAGES.map((stage) => (
              <article key={stage.badge} className="xp-stage">
                <div className="xp-stage-imgwrap">
                  <Image src={stage.src} alt={stage.alt} width={900} height={600} className="xp-stage-img" />
                  <span className="xp-stage-badge">{stage.badge}</span>
                </div>
                <div className="xp-stage-body">
                  <h3 className="xp-stage-h3">{stage.title}</h3>
                  <p className="xp-stage-hook">{stage.hook}</p>
                  <p className="xp-stage-p">
                    <strong>{stage.area}.</strong> {stage.body}
                  </p>
                </div>
              </article>
            ))}
            <div className="xp-stage-spacer" />
          </div>
          <div className="xp-scroll-hint">
            <span className="xp-scroll-hint-label">SCROLL →</span>
          </div>
          <div data-reveal="0" className="xp-enablers">
            <div className="xp-enablers-label">✚ THE THREE ENABLERS — WHAT CREATES CAPACITY FOR THE MISSION</div>
            <div className="xp-enablers-list">
              {ENABLERS.map((enabler) => (
                <div key={enabler.num} className="xp-enabler">
                  <span className="xp-enabler-num">{enabler.num}</span>
                  <h3 className="xp-enabler-h3">{enabler.title}</h3>
                  <p className="xp-enabler-p">
                    <strong>{enabler.hook}</strong> {enabler.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="why" className="xp-section">
          <div className="xp-sechead">
            <span>n.004</span>
            <span>WHY BELIEVE IT</span>
            <span>n.004</span>
          </div>
          <div className="xp-why-cols">
            <WhyAccordion />
            <figure data-reveal="80" className="xp-why-fig">
              <Image
                src="/landing/img/why.jpg"
                alt="A congregation gathered in warm light"
                width={1200}
                height={951}
                className="xp-why-img"
              />
              <figcaption className="xp-figcap xp-figcap-sm">
                <span>FIG.02</span>
                <span className="xp-figcap-r">SAME QUESTIONS. SAME MATH. EVERY CHURCH.</span>
              </figcaption>
            </figure>
          </div>
        </section>

        <section id="foundation" className="xp-section">
          <div className="xp-sechead">
            <span>n.005</span>
            <span>BIBLICAL FOUNDATION</span>
            <span>n.005</span>
          </div>
          <h2 data-reveal="0" className="xp-h2 xp-h2-mt">
            Healthy churches bear <span className="xp-hl">healthy fruit.</span>
          </h2>
          <div className="xp-what-cols">
            <div className="xp-what-copy">
              <p data-reveal="60" className="xp-what-p">
                Jesus taught that a tree is recognized by its fruit. The early Church devoted itself to teaching,
                fellowship, prayer, generosity, care, witness, and the multiplication of disciples.
              </p>
              <p data-reveal="120" className="xp-what-p">
                The XPG Church Health Assessment examines the ministry systems and leadership practices that
                either support — or restrict — that fruit.
              </p>
              <div data-reveal="120" className="xp-gate">
                <span className="xp-gate-label">✚ SCRIPTURE</span>
                <p className="xp-gate-p">
                  Matthew 7:17–20 · Matthew 28:19–20 · Acts 2:42–47 · Ephesians 4:11–16 · 2 Timothy 2:2
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="moments" className="xp-moments">
          <div className="xp-moments-inner">
            <div className="xp-sechead xp-sechead-dark">
              <span>n.006</span>
              <span>THE SIGNATURE MOMENTS</span>
              <span>n.006</span>
            </div>
            <h2 data-reveal="0" className="xp-h2 xp-h2-mt">
              The moments you&apos;ll <span className="xp-hl xp-hl-ink">remember.</span>
            </h2>
            <p data-reveal="60" className="xp-moments-lead">
              Four things this report does that others won&apos;t. Every one is a real, built feature — not a slide.
            </p>
            <div className="xp-moments-grid">
              <article data-reveal="0" className="xp-moment">
                <div className="xp-moment-head">
                  <span>MOMENT 01</span>
                  <span>BUILT-IN</span>
                </div>
                <h3 className="xp-moment-h3">The blind-spot reveal</h3>
                <div className="xp-moment-box">
                  <div>
                    <div className="xp-meter-head">
                      <span>YOUR RATING</span>
                      <span>7.0</span>
                    </div>
                    <div className="xp-meter-track">
                      <div className="xp-meter-fill" />
                    </div>
                  </div>
                  <div>
                    <div className="xp-meter-head">
                      <span>THE EVIDENCE</span>
                      <span>3.2</span>
                    </div>
                    <div className="xp-meter-track">
                      <div className="xp-meter-fill-y" />
                    </div>
                  </div>
                  <div className="xp-moment-delta">Δ 3.8 — THE GAP, IN PLAIN NUMBERS</div>
                </div>
                <p className="xp-moment-p">
                  &quot;You rated your guest experience a 7 — but you can&apos;t see your return rate, and
                  attendance is flat.&quot; Belief sits here; the evidence sits there.
                </p>
              </article>
              <article data-reveal="70" className="xp-moment">
                <div className="xp-moment-head">
                  <span>MOMENT 02</span>
                  <span>BUILT-IN</span>
                </div>
                <h3 className="xp-moment-h3">The do-not-work-on list</h3>
                <div className="xp-moment-box-list">
                  <div className="xp-donot-row">
                    <span className="xp-donot-strike">Generosity campaign</span>
                    <span className="xp-donot-tag">NOT NOW</span>
                  </div>
                  <div className="xp-donot-row">
                    <span className="xp-donot-strike">Volunteer recruiting push</span>
                    <span className="xp-donot-tag">NOT NOW</span>
                  </div>
                  <div className="xp-donot-active-row">
                    <span className="xp-donot-name">Belong — community & connection</span>
                    <span className="xp-donot-start">● START HERE</span>
                  </div>
                </div>
                <p className="xp-moment-p">
                  Knowing what to leave for later is half the diagnosis. The report names the areas that sit
                  downstream of the real gap — and tells you, explicitly, <em>not</em> to spend a year on them.
                  Time and energy returned to the mission is the benefit leaders feel most.
                </p>
              </article>
              <article data-reveal="140" className="xp-moment">
                <div className="xp-moment-head">
                  <span>MOMENT 03</span>
                  <span>BUILT-IN</span>
                </div>
                <h3 className="xp-moment-h3">The generosity reframe</h3>
                <div className="xp-moment-box-quote">
                  <p className="xp-reframe-q">
                    &quot;Your giving isn&apos;t your <span className="xp-reframe-hl">problem.</span> It&apos;s
                    your <span className="xp-reframe-hl">symptom.</span>&quot;
                  </p>
                  <div className="xp-reframe-chain">
                    MULTIPLY ← BUILD ← BECOME ← <span className="xp-reframe-chain-hl">BELONG ⌁</span>
                  </div>
                </div>
                <p className="xp-moment-p">
                  When a leader wants a giving campaign but the real gap is upstream, the report says so — and
                  warns that a campaign into a belonging gap raises money once and changes nothing.
                </p>
              </article>
              <article data-reveal="210" className="xp-moment">
                <div className="xp-moment-head">
                  <span>MOMENT 04</span>
                  <span>BUILT-IN</span>
                </div>
                <h3 className="xp-moment-h3">The disagreement finding</h3>
                <div className="xp-moment-box-quote">
                  <div className="xp-slider">
                    <span className="xp-slider-dot" />
                    <span className="xp-slider-dot xp-slider-dot-y" />
                  </div>
                  <div className="xp-slider-labels">
                    <span>YOUTH LEAD — 4.0</span>
                    <span className="xp-slider-hl">LEAD PASTOR — 8.0</span>
                  </div>
                  <div className="xp-slider-delta">Δ 4.0 — THIS IS A FINDING</div>
                </div>
                <p className="xp-moment-p">
                  When two leaders answer the same area and diverge past a set margin, that disagreement becomes a
                  finding in itself — often more actionable than the score.
                </p>
              </article>
            </div>
            <div data-reveal="0" className="xp-gate">
              <span className="xp-gate-label">✚ THE GATING FLAG</span>
              <p className="xp-gate-p">
                When a broken enabler — like governance — would keep any fix from holding, the report attaches it
                to your next step: <strong>&quot;Before this can stick, start here.&quot;</strong>
              </p>
            </div>
          </div>
        </section>

        <div aria-hidden="true" className="xp-marq xp-marq-dark">
          <div className="xp-marq-track">
            <MarqGroup items={DARK_MARQUEE} />
            <MarqGroup items={DARK_MARQUEE} />
          </div>
        </div>

        <section id="faq" className="xp-section">
          <div className="xp-sechead">
            <span>n.007</span>
            <span>QUESTIONS</span>
            <span>n.007</span>
          </div>
          <div className="xp-faq-cols">
            <div className="xp-faq-intro">
              <h2 data-reveal="0" className="xp-faq-h2">FAQ</h2>
              <p data-reveal="60" className="xp-faq-lead">
                Plain answers to the questions church leaders actually ask.
              </p>
            </div>
            <Faq />
          </div>
        </section>

        <section id="start" className="xp-start-sec">
          <div className="xp-start-kicker">N°008 — BEGIN</div>
          <h2 data-reveal="0" className="xp-start-h2">
            Your next season of health starts with <span className="xp-hl">clarity.</span>
          </h2>
          <p data-reveal="60" className="xp-start-p">
            Invite your leadership team into an honest, prayerful assessment of your church&apos;s health.
            Discover where people are thriving, where the discipleship journey may be breaking down, and what
            your church should strengthen next to expand Kingdom impact.
          </p>
          <div data-reveal="120" className="xp-start-cta-row">
            <Link href="/sign-up" className="xp-cta xp-cta-lg">BEGIN THE ASSESSMENT →</Link>
            <a href="#how" className="xp-cta-ghost">SEE HOW THE ASSESSMENT WORKS ↓</a>
          </div>
        </section>
      </main>
      <footer className="xp-footer">
        <div className="xp-footer-inner">
          <div className="xp-footer-cols">
            <div className="xp-footer-brand">
              <Image src="/landing/logo-light.png" alt="+XP GATHERING" width={750} height={100} className="xp-footer-logo" />
              <p className="xp-footer-tag">We&apos;re greater together.</p>
            </div>
            <nav className="xp-footer-nav">
              <a href="#what" className="xp-footer-link">THE BIG IDEA</a>
              <a href="#how" className="xp-footer-link">HOW IT WORKS</a>
              <a href="#areas" className="xp-footer-link">EIGHT AREAS</a>
              <a href="#why" className="xp-footer-link">WHY TRUST IT</a>
              <a href="#foundation" className="xp-footer-link">BIBLICAL FOUNDATION</a>
              <a href="#faq" className="xp-footer-link">FAQ</a>
            </nav>
            <div className="xp-footer-nav">
              <a href="https://instagram.com/xpgathering" target="_blank" rel="noreferrer" className="xp-footer-link">
                INSTAGRAM ↗
              </a>
              <a
                href="https://www.facebook.com/XP-Gathering-108470714807240"
                target="_blank"
                rel="noreferrer"
                className="xp-footer-link"
              >
                FACEBOOK ↗
              </a>
              <a href="https://www.xpgathering.com" target="_blank" rel="noreferrer" className="xp-footer-link">
                XPGATHERING.COM ↗
              </a>
            </div>
            <div className="xp-footer-nav">
              <span className="xp-footer-heading">DOCUMENTATION</span>
              <Link href="/methodology" className="xp-footer-link">METHODOLOGY</Link>
              <Link href="/terms" className="xp-footer-link">TERMS OF SERVICE</Link>
              <Link href="/privacy" className="xp-footer-link">PRIVACY POLICY</Link>
            </div>
          </div>
          <div className="xp-footer-legal">
            <span>© 2026 XP GATHERING — CHURCH HEALTH ASSESSMENT · V1</span>
            <span>PHOTOS: UNSPLASH</span>
          </div>
        </div>
      </footer>
      <RevealManager />
    </div>
  )
}
