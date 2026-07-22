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
  'NOT A SCORECARD. A VERDICT.',
  'THE EARLIEST BROKEN LINK, NOT THE LOWEST SCORE.',
  'WE DON\'T RATE YOUR CHURCH. WE DIAGNOSE IT.',
]

const DARK_MARQUEE = [
  'YOUR GIVING ISN\'T YOUR PROBLEM. IT\'S YOUR SYMPTOM.',
  'AN ASSESSMENT HONEST ENOUGH TO TELL YOU NOTHING\'S WRONG.',
  'YOUR CEILING IS THE NUMBER OF PEOPLE WHO CAN LEAD.',
]

const STAGES = [
  {
    src: '/landing/img/stage-guest.jpg',
    alt: 'Wooden pews inside a warm, light-filled sanctuary',
    badge: 'STAGE 01/05',
    title: 'Guest Experience',
    hook: '"Are you keeping the guests you\'re paying to reach?"',
    body: 'Stop buying guests through outreach that your front door quietly loses — noticed, welcomed, followed up within 48 hours.',
  },
  {
    src: '/landing/img/stage-community.jpg',
    alt: 'Friends arm in arm watching the sunset',
    badge: 'STAGE 02/05',
    title: 'Community & Connection',
    hook: '"Is your church as connected as it feels?"',
    body: 'Find the large, quiet edge of people no one would notice leaving — before they do.',
  },
  {
    src: '/landing/img/stage-disciple.jpg',
    alt: 'People seated in rows taking notes',
    badge: 'STAGE 03/05',
    title: 'Discipleship & Leadership',
    hook: '"Are you forming leaders, or just deepening attenders?"',
    body: 'See your real ceiling — the number of people who can lead.',
  },
  {
    src: '/landing/img/stage-volunteer.jpg',
    alt: 'Volunteers moving crates together',
    badge: 'STAGE 04/05',
    title: 'Volunteering',
    hook: '"A serving culture, or a handful of heroes about to burn out?"',
    body: 'Catch the burnout risk that\'s one resignation away from stopping three ministries.',
  },
  {
    src: '/landing/img/stage-give.jpg',
    alt: 'Open hands holding coins and a handwritten note',
    badge: 'STAGE 05/05',
    title: 'Generosity',
    hook: '"Is weak giving your problem — or your symptom?"',
    body: 'Know whether to disciple generosity or fix connection first — before a campaign that raises money once and changes nothing.',
  },
]

const ENABLERS = [
  {
    num: 'E1',
    title: 'Governance & Accountability',
    hook: '"Is this why past fixes didn\'t stick?"',
    body: 'Explains why previous improvements didn\'t hold — not a discipline problem, a governance one.',
  },
  {
    num: 'E2',
    title: 'Communication',
    hook: '"Can people even find the church you\'ve built?"',
    body: 'Reveals when a "guest problem" is really that no one can find the guest process you already have.',
  },
  {
    num: 'E3',
    title: 'Org Structure & Systems',
    hook: '"Will your systems survive the growth you\'re praying for?"',
    body: 'Names the next ceiling you\'ll hit — before you hit it.',
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
            Find the <span className="xp-hl">things</span> that are actually stuck.
          </h1>
          <div className="xp-hero-row">
            <p className="xp-hero-lead">
              Your ministry is a chain — welcomed, belonging, formed, serving, giving. This assessment walks that
              chain in order, finds the first break — and tells you where to focus, and just as often, where not to.
            </p>
            <div className="xp-hero-ctas">
              <Link href="/get-started" className="xp-cta">GET STARTED →</Link>
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
              <span className="xp-figcap-r">THE CHAIN BEGINS AT THE FRONT DOOR</span>
            </figcaption>
          </figure>
          <div className="xp-stats">
            <div className="xp-stat">
              <div className="xp-stat-num">8</div>
              <div className="xp-stat-label">AREAS ASSESSED</div>
            </div>
            <div className="xp-stat-mid">
              <div className="xp-stat-num">5</div>
              <div className="xp-stat-label">STAGES, WALKED IN ORDER</div>
            </div>
            <div className="xp-stat-last">
              <div className="xp-stat-num-hl">1</div>
              <div className="xp-stat-label">VERDICT — NOT A SCORECARD</div>
            </div>
          </div>
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
              <h2 data-reveal="0" className="xp-h2">Every stage depends on the one before it.</h2>
              <p data-reveal="60" className="xp-what-p">
                A report card can&apos;t fix a ministry. A dozen numbers, all shouting at once, still leave you
                guessing which one to fix first — and chasing the lowest score can pour a year into a symptom.
              </p>
              <p data-reveal="120" className="xp-what-p">
                A person has to be <em>welcomed</em> before they can <em>belong</em>, has to belong before
                they&apos;re <em>formed</em>, has to be formed before they&apos;ll <em>serve</em> and <em>give</em>.
                So the assessment walks that chain in order — and stops at the <strong>first</strong> place it
                breaks. That first break is your real constraint. Everything downstream of it is just a symptom.
              </p>
            </div>
            <div data-reveal="100" className="xp-what-card-col">
              <div className="xp-card">
                <div className="xp-cardhead">
                  <span>EXHIBIT A — THE CHAIN, WALKED IN ORDER</span>
                  <span>ILLUSTRATIVE</span>
                </div>
                <div className="xp-chain">
                  <div className="xp-chain-row">
                    <span className="xp-chain-num">01</span>
                    <span className="xp-chain-name">Guest Experience</span>
                    <span className="xp-chain-tag">HEALTHY ✓</span>
                  </div>
                  <div className="xp-chain-link" />
                  <div className="xp-chain-row">
                    <span className="xp-chain-num">02</span>
                    <span className="xp-chain-name">Community & Connection</span>
                    <span className="xp-chain-tag">HEALTHY ✓</span>
                  </div>
                  <div className="xp-chain-break">
                    <span className="xp-chain-bolt">⌁</span>
                    <span className="xp-chain-flag">FIRST BREAK — YOUR REAL CONSTRAINT</span>
                  </div>
                  <div className="xp-chain-row xp-chain-row-dim">
                    <span className="xp-chain-num">03</span>
                    <span className="xp-chain-name">Discipleship & Leadership</span>
                    <span className="xp-chain-tag">SYMPTOM</span>
                  </div>
                  <div className="xp-chain-link xp-chain-link-dim" />
                  <div className="xp-chain-row xp-chain-row-dim">
                    <span className="xp-chain-num">04</span>
                    <span className="xp-chain-name">Volunteering</span>
                    <span className="xp-chain-tag">SYMPTOM</span>
                  </div>
                  <div className="xp-chain-link xp-chain-link-dim" />
                  <div className="xp-chain-row xp-chain-row-dim">
                    <span className="xp-chain-num">05</span>
                    <span className="xp-chain-name">Generosity</span>
                    <span className="xp-chain-tag">SYMPTOM</span>
                  </div>
                  <p className="xp-chain-note">
                    Fix the break at 02, and the &quot;problems&quot; at 03–05 start resolving on their own.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <blockquote data-reveal="0" className="xp-what-quote">
            <p className="xp-what-quote-p">
              A low giving number usually isn&apos;t a giving problem. It&apos;s the last{' '}
              <span className="xp-hl">echo</span> of a break higher up the chain.
            </p>
            <p className="xp-what-quote-sub">We find the break — so you stop treating the echo.</p>
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
              <h2 data-reveal="0" className="xp-h2">Eight areas.<br />Detailed connections.</h2>
              <p data-reveal="60" className="xp-areas-lead">
                Five <strong>stages</strong> — the journey a person actually takes — and three{' '}
                <strong>enablers</strong>: what the organization does to make that journey work.
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
                  <p className="xp-stage-p">{stage.body}</p>
                </div>
              </article>
            ))}
            <div className="xp-stage-spacer" />
          </div>
          <div className="xp-scroll-hint">
            <span className="xp-scroll-hint-label">SCROLL →</span>
          </div>
          <div data-reveal="0" className="xp-enablers">
            <div className="xp-enablers-label">✚ THE THREE ENABLERS — THE GROUND EVERYTHING STANDS ON</div>
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

        <section id="moments" className="xp-moments">
          <div className="xp-moments-inner">
            <div className="xp-sechead xp-sechead-dark">
              <span>n.005</span>
              <span>THE SIGNATURE MOMENTS</span>
              <span>n.005</span>
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
                    <span className="xp-donot-name">Belonging & connection</span>
                    <span className="xp-donot-start">● START HERE</span>
                  </div>
                </div>
                <p className="xp-moment-p">
                  Knowing what to ignore is half the diagnosis. The report names the areas that are merely
                  symptoms — and tells you, explicitly, <em>not</em> to spend a year on them. Time and money saved
                  is the benefit leaders feel most.
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
                    GIVING ← SERVING ← FORMED ← <span className="xp-reframe-chain-hl">BELONGING ⌁</span>
                  </div>
                </div>
                <p className="xp-moment-p">
                  When a leader wants a giving campaign but the real break is upstream, the report says so — and
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
            <span>n.006</span>
            <span>QUESTIONS</span>
            <span>n.006</span>
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
          <div className="xp-start-kicker">N°007 — BEGIN</div>
          <h2 data-reveal="0" className="xp-start-h2">
            Your diagnosis starts <span className="xp-hl">here.</span>
          </h2>
          <p data-reveal="60" className="xp-start-p">
            Answer it yourself or hand areas to your team. One verdict, the evidence behind it, and the single
            next step.
          </p>
          <div data-reveal="120" className="xp-start-cta-row">
            <Link href="/get-started" className="xp-cta xp-cta-lg">GET STARTED →</Link>
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
