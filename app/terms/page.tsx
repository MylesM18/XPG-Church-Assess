import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Terms of Service | XP Gathering',
  description:
    'The terms that govern use of the XP Gathering Church Health Assessment: who may use it, ' +
    'who owns what, what the results are (and are not), and how we handle disagreements.',
}

// Every operative claim on this page is grounded in the codebase: passwordless auth
// (app/sign-in/page.tsx), admin/viewer roles (schema.sql church_members), respondent anonymity
// (lib/report/view.ts + lib/report/pdf/render.ts guard), optional AI prose (lib/ai/sections.ts +
// lib/ai/themes.ts, gated by lib/ai/prose-mode.ts proseEnabled(): on iff OPENAI_API_KEY is set, PROSE_MODE=fallback
// opts out), no payments and no analytics (audited: zero hits). Keep it that way — if the
// product gains payments, analytics, or new data flows, this document must change in the same PR.
function Section({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-10">
      <p aria-hidden="true" className="mb-3 font-body text-sm font-semibold tabular-nums tracking-[0.18em] text-berry">
        {n}
      </p>
      <h2 className="mb-4 max-w-[26ch] font-display text-2xl leading-tight text-ink sm:text-3xl">
        {title}
      </h2>
      <div className="space-y-4 font-body text-[17px] leading-relaxed text-ink-soft">{children}</div>
    </section>
  )
}

export default function TermsPage() {
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
          Legal
        </p>
        <h1 className="max-w-[16ch] font-display text-4xl leading-[1.05] text-ink sm:text-5xl">
          Terms of Service
        </h1>
        <p className="mt-4 font-body text-sm text-ink-soft">Last updated: August 7, 2026</p>
        <p className="mt-6 max-w-[58ch] font-body text-lg leading-relaxed text-ink-soft">
          These Terms are the agreement between you and XP Gathering for using the Church Health
          Assessment. We&rsquo;ve written them in plain English on purpose, because we&rsquo;d
          rather you actually read them. The short version: the Service is free, your church&rsquo;s
          data stays your church&rsquo;s, the results are a conversation starter rather than
          professional advice, and we ask you to use the tool honestly.
        </p>

        <div className="mt-14 space-y-12">
          <Section n="01" title="Who we are, and your agreement with us">
            <p>
              The Church Health Assessment (the <strong className="text-ink">Service</strong>) is
              operated by <strong className="text-ink">XP Gathering</strong>, a 501(c)(3) nonprofit
              ministry (<strong className="text-ink">&ldquo;XP Gathering,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;</strong>).
              You can reach us any time at{' '}
              <a href="mailto:info@xpgathering.com" className="text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
                info@xpgathering.com
              </a>
              .
            </p>
            <p>
              By accessing or using the Service, whether as a church administrator or as an invited
              member, you agree to these Terms and to our{' '}
              <Link href="/privacy" className="text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
                Privacy Policy
              </Link>
              , which explains how we handle information. If you don&rsquo;t agree, please don&rsquo;t
              use the Service.
            </p>
          </Section>

          <Section n="02" title="Who may use the Service">
            <p>
              You must be at least <strong className="text-ink">18 years old</strong> to use the
              Service. It is built for ministry leaders and adult church members, and it is offered
              for churches in the United States.
            </p>
            <p>
              If you use the Service as a church administrator, you represent that you are
              authorized to act on your church&rsquo;s behalf, to accept these Terms for your
              church, and to invite its members. Please only invite{' '}
              <strong className="text-ink">adult members</strong> of your church.
            </p>
          </Section>

          <Section n="03" title="What the Service is">
            <p>
              The Service lets a church take a structured health assessment: an administrator sets
              up the church and invites members, members answer anchored survey questions, and the
              Service produces a church-level diagnosis report. How the diagnosis is built is
              explained openly on our{' '}
              <Link href="/methodology" className="text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
                Methodology
              </Link>{' '}
              page.
            </p>
            <p>
              The Service is currently provided{' '}
              <strong className="text-ink">free of charge</strong>. We never ask for payment
              information. Because it&rsquo;s free, we don&rsquo;t promise a particular service
              level, and we may improve, change, or discontinue features, though we&rsquo;ll aim to
              give reasonable notice of anything significant.
            </p>
          </Section>

          <Section n="04" title="Your account and keeping it secure">
            <p>
              Sign-in is <strong className="text-ink">passwordless</strong>: you use a magic link
              sent to your email or your Google account. We never create or store a password for
              you. That means your account is only as secure as your email inbox and Google
              account, so protect them, and don&rsquo;t forward or share a magic-link email with
              anyone.
            </p>
            <p>
              If you suspect someone has accessed your account without permission, tell us right
              away at{' '}
              <a href="mailto:info@xpgathering.com" className="text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
                info@xpgathering.com
              </a>
              . We may suspend an account when we reasonably believe it&rsquo;s necessary to protect
              the Service or its users.
            </p>
          </Section>

          <Section n="05" title="Invitations and taking part">
            <p>
              Invitation and reminder emails are sent{' '}
              <strong className="text-ink">at your church&rsquo;s instruction</strong>, when an
              administrator invites a member or sets an assessment window. Administrators must have
              their church&rsquo;s permission to submit members&rsquo; email addresses.
            </p>
            <p>
              Participation is <strong className="text-ink">voluntary</strong>. If you&rsquo;re
              invited and would rather not take part, you can simply ignore the invitation, and it
              expires on its own. You can also ask your church&rsquo;s administrator to revoke it,
              or ask us to remove your email from our records.
            </p>
          </Section>

          <Section n="06" title="Acceptable use">
            <p>Use the Service honestly and lawfully. In particular, you agree not to:</p>
            <ul className="my-2 space-y-2 border-l-2 border-line pl-4">
              <li>break the law, or misrepresent who you are or which church you belong to;</li>
              <li>
                attempt to <strong className="text-ink">re-identify anonymized respondents</strong>{' '}
                or work out who gave which answers — respondent anonymity is a core promise of the
                Service;
              </li>
              <li>probe, scan, or test the security of the Service, or access data that isn&rsquo;t yours;</li>
              <li>scrape the Service or access it with automated tools;</li>
              <li>copy the assessment instrument or methodology to build a competing product;</li>
              <li>interfere with the Service or with another church&rsquo;s assessment.</li>
            </ul>
          </Section>

          <Section n="07" title="Your church&rsquo;s data, and the license you give us">
            <p>
              Your church and its members <strong className="text-ink">own their assessment data</strong>:
              the answers submitted and the information provided about the church. You give us a
              non-exclusive, royalty-free license to host, process, analyze, and display that data{' '}
              <strong className="text-ink">solely to operate and provide the Service</strong>,
              including generating your church&rsquo;s diagnosis report. We don&rsquo;t use it for
              advertising, and we don&rsquo;t sell it.
            </p>
            <p>
              Plain-language visibility promise: church administrators see who has been invited and
              whether each member has completed the assessment, and they see{' '}
              <strong className="text-ink">church-level results only</strong>. No report surface
              shows an individual&rsquo;s answers, scores, or name. Our{' '}
              <Link href="/privacy" className="text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
                Privacy Policy
              </Link>{' '}
              covers this in detail.
            </p>
          </Section>

          <Section n="08" title="Our intellectual property">
            <p>
              The Service itself, including the assessment instrument, question sets, scoring
              methodology, software, report design, and XP Gathering branding, belongs to XP
              Gathering or its licensors. We grant your church a limited, non-transferable license
              to use and share <strong className="text-ink">its own generated reports</strong> for
              internal ministry purposes, including through the report-sharing links built into the
              Service.
            </p>
            <p>
              If you send us feedback or suggestions, we may use them to improve the Service without
              owing you anything — though we&rsquo;re grateful all the same.
            </p>
          </Section>

          <Section n="09" title="The services we build on">
            <p>
              The Service runs on third-party infrastructure: Supabase (database and
              authentication), Resend (email delivery), Vercel (hosting), Google (optional sign-in),
              and, when enabled, OpenAI (AI phrasing of report prose). Availability and
              performance depend in part on those providers, and we aren&rsquo;t responsible for
              their outages.
            </p>
            <p>
              Some report prose may be <strong className="text-ink">machine-generated</strong>. As
              our Methodology page explains, every score and verdict is decided by a deterministic
              engine; AI only rephrases findings that are already decided, and its wording is
              checked against the numbers. Even so, generated text can contain awkward or imprecise
              phrasing, and no human professional reviews each report before delivery.
            </p>
          </Section>

          <Section n="10" title="Results are a conversation starter, not professional advice">
            <p>
              The assessment and its reports are provided{' '}
              <strong className="text-ink">for informational and discussion purposes only</strong>.
              They reflect nothing more than the answers your team submitted, read through our
              methodology. They are not a validated clinical or diagnostic instrument, and they are
              not legal, financial, tax, mental-health, counseling, or pastoral advice. Your church
              remains solely responsible for its decisions and should consult qualified advisors
              where decisions matter.
            </p>
            <p>
              Using the Service creates{' '}
              <strong className="text-ink">no counseling, pastoral, clergy-penitent, fiduciary, or
              church-membership relationship</strong> between you and XP Gathering. Survey answers
              are data submissions, not privileged or confessional communications. And the report
              passes no doctrinal judgment: it reflects a methodology and framework, not a verdict
              on your church&rsquo;s faithfulness.
            </p>
          </Section>

          <Section n="11" title="No warranties">
            <p>
              TO THE FULLEST EXTENT PERMITTED BY LAW, THE SERVICE IS PROVIDED{' '}
              <strong className="text-ink">&ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE,&rdquo;</strong>{' '}
              WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING IMPLIED WARRANTIES OF
              MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, AND ACCURACY. WE
              DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE, OR THAT
              RESULTS WILL MEET YOUR EXPECTATIONS.
            </p>
            <p>
              Some jurisdictions don&rsquo;t allow certain warranty disclaimers, so parts of the
              paragraph above may not apply to you.
            </p>
          </Section>

          <Section n="12" title="Limits on our liability">
            <p>
              TO THE FULLEST EXTENT PERMITTED BY LAW, XP GATHERING AND ITS LEADERS, STAFF, AND
              VOLUNTEERS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, CONSEQUENTIAL, SPECIAL,
              PUNITIVE, OR EXEMPLARY DAMAGES, OR FOR LOST PROFITS, REVENUE, OR DATA, ARISING FROM
              YOUR USE OF (OR INABILITY TO USE) THE SERVICE OR RELIANCE ON ITS RESULTS. OUR TOTAL
              AGGREGATE LIABILITY FOR ALL CLAIMS RELATING TO THE SERVICE IS LIMITED TO THE GREATER
              OF <strong className="text-ink">ONE HUNDRED U.S. DOLLARS ($100)</strong> AND THE
              AMOUNTS YOU PAID US FOR THE SERVICE IN THE TWELVE MONTHS BEFORE THE CLAIM.
            </p>
            <p>
              These limits don&rsquo;t apply where the law doesn&rsquo;t allow them to, such as for
              gross negligence, willful misconduct, or fraud, and nothing in these Terms deprives
              you of consumer protections you&rsquo;re entitled to under the law of your home state.
            </p>
          </Section>

          <Section n="13" title="Your responsibility for misuse">
            <p>
              If a third party brings a claim against XP Gathering because you broke these Terms,
              used the Service unlawfully, or submitted data you had no right to submit (for
              example, inviting people without your church&rsquo;s authority), you agree to
              indemnify us for the reasonable costs and damages of that claim. This is deliberately
              narrow: it covers your misuse, not your ordinary use of the Service.
            </p>
          </Section>

          <Section n="14" title="Ending things">
            <p>
              You can stop using the Service at any time, and you can ask us to close your account
              and delete your data by emailing{' '}
              <a href="mailto:info@xpgathering.com" className="text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
                info@xpgathering.com
              </a>
              . We may suspend or terminate access for a breach of these Terms, and we may wind down
              the free Service with reasonable notice.
            </p>
            <p>
              Sections that by their nature should survive termination (ownership, disclaimers,
              liability limits, indemnity, and dispute terms) survive it.
            </p>
          </Section>

          <Section n="15" title="Disagreements, governing law, and venue">
            <p>
              If something goes wrong, <strong className="text-ink">talk to us first</strong>: email{' '}
              <a href="mailto:info@xpgathering.com" className="text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
                info@xpgathering.com
              </a>{' '}
              describing the problem, and we&rsquo;ll try in good faith to resolve it with you
              within 60 days before either of us files anything in court. Either party may always
              bring an individual claim in small-claims court.
            </p>
            <p>
              These Terms are governed by the laws of the State of{' '}
              <strong className="text-ink">[State to be confirmed]</strong>, United States, without
              regard to conflict-of-laws rules, and any dispute that can&rsquo;t be resolved
              informally will be brought in the state or federal courts located there.
            </p>
          </Section>

          <Section n="16" title="Changes to these Terms">
            <p>
              If we make material changes, we&rsquo;ll email account holders before the changes take
              effect and update the &ldquo;Last updated&rdquo; date at the top of this page. Minor
              changes may be posted with a date update alone. Continuing to use the Service after
              changes take effect means you accept the updated Terms.
            </p>
          </Section>

          <Section n="17" title="The fine print">
            <p>
              These Terms, together with the Privacy Policy, are the entire agreement between you
              and XP Gathering about the Service. If a court finds part of them unenforceable, the
              rest still stands, and the unenforceable part is replaced with a valid one closest to
              its intent. Our not enforcing a provision isn&rsquo;t a waiver of it. You may not
              assign these Terms; we may assign them as part of a ministry reorganization or
              successor arrangement. Neither party is liable for delays caused by events outside
              reasonable control, including internet or cloud-provider failures. We&rsquo;ll send
              notices to your account email, and you consent to receiving agreements and notices
              electronically. Except for the protections extended to XP Gathering&rsquo;s leaders,
              staff, and volunteers above, these Terms create no third-party rights.
            </p>
          </Section>

          <Section n="18" title="Contact us">
            <p>
              Questions about these Terms are welcome:{' '}
              <a href="mailto:info@xpgathering.com" className="text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
                info@xpgathering.com
              </a>
              .
            </p>
          </Section>
        </div>

        <div className="mt-14 rounded-2xl border border-line bg-sand/50 p-6 sm:p-8">
          <h2 className="font-display text-2xl text-ink">How we handle information</h2>
          <p className="mt-3 max-w-[52ch] font-body text-ink-soft">
            What we collect, why respondent answers stay anonymous, and the choices you have, all in
            the same plain English.
          </p>
          <Link
            href="/privacy"
            className="mt-5 inline-block rounded-md border border-line bg-ink px-4 py-2 font-body text-sm text-paper transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Read the Privacy Policy
          </Link>
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
