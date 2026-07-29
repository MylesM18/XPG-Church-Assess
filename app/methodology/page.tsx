import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { bookingCta } from '@/lib/report/cta'

export const metadata: Metadata = {
  title: 'Methodology — How your diagnosis is built | XP Gathering',
  description:
    'A plain-English walkthrough of how the XP Gathering church assessment measures, scores, ' +
    'and diagnoses your ministry — what we measure, how a score is formed, and how we find the ' +
    'one thing to fix first.',
}

// The five sequential stages people move through, in order. This ordering is the heart of the
// diagnosis: the earliest weak stage governs how many people make it all the way through.
const STAGES = [
  { name: 'Guest Experience', note: 'the front door' },
  { name: 'Connection', note: 'belonging' },
  { name: 'Discipleship', note: 'growth' },
  { name: 'Volunteering', note: 'serving' },
  { name: 'Generosity', note: 'giving' },
]

// The three enablers sit underneath every stage. They never get their own headline verdict —
// they gate whether a fix can actually take hold.
const ENABLERS = [
  { name: 'Governance & Accountability', note: 'gates every stage' },
  { name: 'Communication', note: 'gates the front half' },
  { name: 'Structure & Systems', note: 'gates serving & growth' },
]

function Section({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-10">
      <p aria-hidden="true" className="mb-3 font-body text-sm font-semibold tabular-nums tracking-[0.18em] text-berry">
        {n}
      </p>
      <h2 className="mb-4 max-w-[22ch] font-display text-2xl leading-tight text-ink sm:text-3xl">
        {title}
      </h2>
      <div className="space-y-4 font-body text-[17px] leading-relaxed text-ink-soft">{children}</div>
    </section>
  )
}

export default function MethodologyPage() {
  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="font-display text-lg text-ink transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            +XP&nbsp;GATHERING
          </Link>
          <Link
            href="/"
            className="font-body text-sm text-ink-soft transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            ← Back to home
          </Link>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="mx-auto max-w-3xl px-6 py-14 sm:py-20">
        <p className="mb-4 font-body text-xs font-semibold uppercase tracking-[0.22em] text-berry">
          Methodology
        </p>
        <h1 className="max-w-[16ch] font-display text-4xl leading-[1.05] text-ink sm:text-5xl">
          How your diagnosis is built
        </h1>
        <p className="mt-6 max-w-[58ch] font-body text-lg leading-relaxed text-ink-soft">
          This assessment is a diagnosis, not a scorecard. Its whole job is to find the earliest
          place your ministry loses momentum — the one thing worth fixing first — and to tell you
          plainly where <em>not</em> to spend your energy yet. This page walks through exactly how it
          works, step by step, in the order the diagnosis is assembled.
        </p>

        <div className="mt-14 space-y-12">
          <Section n="01" title="What this assessment is">
            <p>
              Most church surveys hand you a wall of numbers and leave you to guess what matters.
              This one does the opposite. It treats your ministry as a journey people move
              through — from first-time guest to engaged, giving member — and looks for the first
              point where that journey stalls.
            </p>
            <p>
              That first stall is your <strong className="text-ink">primary constraint</strong>: the
              single place where effort will do the most good right now. Everything downstream of it
              is usually a symptom, not a cause. So the report is deliberately opinionated — it names
              one thing to work on, and just as importantly names the things to leave alone for now.
            </p>
          </Section>

          <Section n="02" title="What we measure">
            <p>
              We look at <strong className="text-ink">eight areas</strong>. Five are sequential{' '}
              <strong className="text-ink">stages</strong> — the journey itself, read in order:
            </p>

            <ol className="my-4 flex flex-wrap items-stretch gap-2" aria-label="The five sequential stages">
              {STAGES.map((s, i) => (
                <li key={s.name} className="flex items-center gap-2">
                  <div className="rounded-lg border border-line bg-sand/60 px-3 py-2">
                    <span className="block font-body text-xs font-semibold uppercase tracking-wide text-ink">
                      {s.name}
                    </span>
                    <span className="block font-body text-xs text-ink-soft">{s.note}</span>
                  </div>
                  {i < STAGES.length - 1 && (
                    <span aria-hidden="true" className="font-body text-line">
                      →
                    </span>
                  )}
                </li>
              ))}
            </ol>

            <p>
              The other three are <strong className="text-ink">enablers</strong> — the foundations
              that sit under every stage:
            </p>

            <ul className="my-4 grid gap-2 sm:grid-cols-3" aria-label="The three enablers">
              {ENABLERS.map((e) => (
                <li key={e.name} className="rounded-lg border border-line px-3 py-2">
                  <span className="block font-body text-xs font-semibold uppercase tracking-wide text-sage">
                    {e.name}
                  </span>
                  <span className="block font-body text-xs text-ink-soft">{e.note}</span>
                </li>
              ))}
            </ul>

            <p>
              Each area is measured by a small set of questions answered on a 1–10 scale. Every
              question is <strong className="text-ink">anchored</strong> — the 1, the middle, and the
              10 are each described in words — so a &ldquo;7&rdquo; means the same thing to everyone
              answering. Questions are also tagged as <strong className="text-ink">belief</strong>{' '}
              (&ldquo;what you think is true&rdquo;) or <strong className="text-ink">evidence</strong>{' '}
              (&ldquo;what&rsquo;s actually happening&rdquo;). That distinction powers the blind-spot
              check later on.
            </p>
          </Section>

          <Section n="03" title="How a score is formed">
            <p>
              An area&rsquo;s raw answers are averaged and rescaled to a familiar 0–100 range. But a
              simple average has a well-known flaw: some people rate everything harshly and some rate
              everything generously, so a score can say more about who answered than about the
              ministry itself.
            </p>
            <p>
              To correct for that, we separate the area&rsquo;s{' '}
              <strong className="text-ink">true level</strong> from each rater&rsquo;s personal{' '}
              <strong className="text-ink">tendency</strong>, and report the level. Two churches with
              identical ministries but different personalities on the team end up with comparable
              scores. We also only count a person toward an area once they&rsquo;ve answered{' '}
              <em>all</em> of that area&rsquo;s questions — partial responses are set aside rather than
              allowed to skew the result.
            </p>
          </Section>

          <Section n="04" title="The two headline numbers">
            <p>
              The report leads with two numbers. <strong className="text-ink">Capacity</strong> is
              how you&rsquo;re doing on average across all eight areas — your raw strength.{' '}
              <strong className="text-ink">Throughput</strong> is how well the whole chain actually
              moves people all the way through.
            </p>
            <p>
              Throughput is weighted <strong className="text-ink">heavily toward your weakest
              stage</strong>, on purpose — a chain is only as strong as its weakest link, and one
              blocked stage caps how many people reach the end no matter how strong the others are.
            </p>
            <p>
              The <strong className="text-ink">gap</strong> between Capacity and Throughput is the
              revealing part. A wide gap means you have real strength that isn&rsquo;t translating
              into end-to-end flow — hidden drag. A narrow gap means what you&rsquo;ve built is
              actually carrying people through.
            </p>
          </Section>

          <Section n="05" title="The chain and its dependencies">
            <p>
              Because the stages are a sequence, we read them in order. The{' '}
              <strong className="text-ink">first stage that falls below the line</strong> is your
              primary constraint — the one thing to fix first. Stages that break further down the
              chain are usually downstream symptoms, so the report tells you to leave them for now.
            </p>
            <p>
              Enablers don&rsquo;t get their own headline; instead they{' '}
              <strong className="text-ink">gate</strong> the fix. Weak governance can block progress
              everywhere; weak communication tends to hurt the front of the journey; weak structure
              tends to hurt serving and growth. If an enabler is holding a stage back, fixing the
              stage alone won&rsquo;t stick.
            </p>
            <p>We describe each dependency between two areas in plain words:</p>
            <ul className="my-2 space-y-2 border-l-2 border-line pl-4">
              <li>
                <strong className="text-ink">Load-bearing</strong> — both ends are weak, and the
                relationship is actively costing you.
              </li>
              <li>
                <strong className="text-ink">Clear</strong> — the upstream area is strong, so it
                isn&rsquo;t the explanation for what&rsquo;s downstream.
              </li>
              <li>
                <strong className="text-ink">At risk</strong> — downstream looks fine but rests on a
                weak upstream: you&rsquo;re running on borrowed time.
              </li>
              <li>
                <strong className="text-ink">Quiet</strong> — both ends are strong; nothing to flag.
              </li>
            </ul>
          </Section>

          <Section n="06" title="Benchmarks and bands">
            <p>
              A score on its own is hard to read, so we place each one against churches of{' '}
              <strong className="text-ink">similar weekly attendance</strong> and report it two
              ways: a plain-language <strong className="text-ink">band</strong> (for example Severe,
              Broken, Watch, or Strong) and a rough percentile — roughly where you sit in the pack.
            </p>
            <div className="my-4 rounded-lg border border-berry/30 bg-berry/5 p-4">
              <p className="font-body text-[15px] leading-relaxed text-ink">
                <strong>One honest caveat.</strong> These benchmarks are currently{' '}
                <strong>provisional</strong> working priors — our best informed estimates — and not
                yet drawn from a fully observed cohort of churches. Read the percentiles{' '}
                <em>directionally</em>: &ldquo;we&rsquo;re behind here, ahead there,&rdquo; not as
                precise rankings. They&rsquo;ll sharpen as real data arrives.
              </p>
            </div>
          </Section>

          <Section n="07" title="Blind spots: belief vs evidence">
            <p>
              Remember that each question is tagged as belief or evidence. When your{' '}
              <strong className="text-ink">belief runs well ahead of the evidence</strong>, that&rsquo;s
              a blind spot — you feel better about an area than what&rsquo;s actually happening
              supports. When the <strong className="text-ink">evidence runs ahead of belief</strong>,
              you may be underrating yourselves and missing a real strength.
            </p>
            <p>
              A few areas are measured by belief only, so they carry no evidence cross-check — the
              report is explicit about that rather than inventing a comparison.
            </p>
          </Section>

          <Section n="08" title="Agreement and confidence">
            <p>
              Before we ask whether your team genuinely disagrees about an area, we first remove each
              person&rsquo;s rating style — otherwise one habitually harsh rater looks like conflict
              when there is none. What&rsquo;s left is <strong className="text-ink">real
              disagreement</strong>, and we flag it when it&rsquo;s meaningful, because a split team
              often signals an area worth a closer look.
            </p>
            <p>
              We also lower our stated <strong className="text-ink">confidence</strong> when an area
              rests on very few responses. A verdict built on two answers is treated more cautiously
              than one built on twenty.
            </p>
          </Section>

          <Section n="09" title="The role of AI">
            <p>
              This matters, so we&rsquo;ll be direct. Every score, band, constraint, and verdict is
              decided by a <strong className="text-ink">deterministic engine</strong> — fixed rules
              and math that produce the same answer every time from the same answers.
            </p>
            <p>
              AI is used only to <strong className="text-ink">rephrase findings that are already
              decided</strong> into readable prose, and its wording is fact-checked back against the
              numbers. No model ever changes a score or a verdict. The diagnosis is the math; the AI
              just helps it read like a person wrote it.
            </p>
          </Section>

          <Section n="10" title="Versioning and honesty">
            <p>
              This methodology is <strong className="text-ink">versioned</strong>, and we treat its
              thresholds and benchmarks as tunable — they&rsquo;re being refined as more churches
              take the assessment and more real data comes in. We&rsquo;d rather tell you that
              openly than pretend the model is finished.
            </p>
            <p>
              If you&rsquo;d like to talk through your own results and turn them into a plan, the best
              next step is a conversation.
            </p>
          </Section>
        </div>

        <div className="mt-14 rounded-2xl border border-line bg-sand/50 p-6 sm:p-8">
          <h2 className="font-display text-2xl text-ink">Talk through your results</h2>
          <p className="mt-3 max-w-[52ch] font-body text-ink-soft">
            Book a free call with the XP Gathering team — we&rsquo;ll walk through your diagnosis
            together and map the next few moves for your church. No cost, no pressure.
          </p>
          <a
            href={bookingCta.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-block rounded-md border border-line bg-ink px-4 py-2 font-body text-sm text-paper transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {bookingCta.buttonLabel}
          </a>
        </div>

        <div className="mt-12 border-t border-line pt-6">
          <Link
            href="/"
            className="font-body text-sm text-ink-soft transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            ← Back to home
          </Link>
        </div>
      </main>
    </div>
  )
}
