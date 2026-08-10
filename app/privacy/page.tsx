import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Privacy Policy | XP Gathering',
  description:
    'How the XP Gathering Church Health Assessment handles information: what we collect, why ' +
    'respondent answers stay anonymous, who we share with (and never sell to), and your choices.',
}

// Every factual claim on this page is grounded in the codebase and must stay true: email-only
// identity (profiles trigger writes id+email; full_name never written), admin/viewer roles
// (schema.sql), respondent anonymity (lib/report/view.ts strips + lib/report/pdf/render.ts:28
// fail-closed guard), Supabase session cookies only (no analytics — audited zero hits), Resend
// invitation/reminder emails, Vercel cron, optional OpenAI prose (PROSE_MODE, default off),
// no payments. If a feature changes any of these, this document must change in the same PR.
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

export default function PrivacyPage() {
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
          Privacy Policy
        </h1>
        <p className="mt-4 font-body text-sm text-ink-soft">Last updated: August 7, 2026</p>
        <p className="mt-6 max-w-[58ch] font-body text-lg leading-relaxed text-ink-soft">
          This policy explains what information the Church Health Assessment collects, what happens
          to it, and the choices you have. We&rsquo;ve kept it in plain English because privacy
          policies only protect people who can understand them.
        </p>

        <div className="mt-10 rounded-2xl border border-line bg-sand/50 p-6 sm:p-8">
          <h2 className="font-display text-2xl text-ink">The short version</h2>
          <ul className="mt-4 space-y-2 font-body text-ink-soft">
            <li>We collect the minimum the assessment needs: your email, your church and role, and your answers.</li>
            <li>
              We <strong className="text-ink">never sell personal information</strong>, run no ads,
              and use <strong className="text-ink">no analytics or tracking cookies</strong>.
            </li>
            <li>
              Individual answers stay <strong className="text-ink">anonymous on every report
              surface</strong>: your church sees church-level results, never who said what.
            </li>
            <li>The Service is free; we never ask for payment information.</li>
            <li>
              Questions or requests:{' '}
              <a href="mailto:info@xpgathering.com" className="text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
                info@xpgathering.com
              </a>
              .
            </li>
          </ul>
        </div>

        <div className="mt-14 space-y-12">
          <Section n="01" title="Who we are, and what this policy covers">
            <p>
              The Church Health Assessment (the <strong className="text-ink">Service</strong>) is
              operated by <strong className="text-ink">XP Gathering</strong>, a 501(c)(3) nonprofit
              ministry. This policy covers information handled by the Service, including its public
              pages, signed-in areas, and the emails it sends. Use of the Service is also governed
              by our{' '}
              <Link href="/terms" className="text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
                Terms of Service
              </Link>
              .
            </p>
          </Section>

          <Section n="02" title="What we collect">
            <p>We collect only what the assessment needs to work:</p>
            <ul className="my-2 space-y-2 border-l-2 border-line pl-4">
              <li>
                <strong className="text-ink">Your email address.</strong> It&rsquo;s how you sign in
                and how the Service identifies you. We don&rsquo;t require your name.
              </li>
              <li>
                <strong className="text-ink">Church membership and role.</strong> Which church you
                belong to and whether you&rsquo;re an administrator or a member, plus assessment
                windows and when reminder emails were last sent.
              </li>
              <li>
                <strong className="text-ink">Invitation emails.</strong> When an administrator
                invites someone, we store that person&rsquo;s email address, the intended role, and
                the invitation&rsquo;s status. Invitations expire after 14 days.
              </li>
              <li>
                <strong className="text-ink">Assessment answers.</strong> Your 1&ndash;10 ratings,
                linked to your account so you can pause and resume.
              </li>
              <li>
                <strong className="text-ink">Church profile.</strong> Information an administrator
                provides about the church itself, such as its name and optional context like
                denomination, setting, and size ranges. This describes the church, not individuals.
              </li>
              <li>
                <strong className="text-ink">Computed reports.</strong> The church-level scores and
                report prose the Service generates.
              </li>
              <li>
                <strong className="text-ink">Technical records.</strong> Sign-in events and
                timestamps kept by our authentication provider, and short-lived server logs (which
                include IP addresses) kept by our hosting provider.
              </li>
            </ul>
            <p>
              We don&rsquo;t collect payment information (the Service is free), demographic
              profiles, or precise location.
            </p>
          </Section>

          <Section n="03" title="Where information comes from">
            <p>
              Three places: directly from <strong className="text-ink">you</strong> (signing in,
              answering questions); from{' '}
              <strong className="text-ink">your church&rsquo;s administrator</strong>, who provides
              your email address when inviting you; and{' '}
              <strong className="text-ink">generated by your use</strong> of the Service, such as
              completion status and timestamps.
            </p>
          </Section>

          <Section n="04" title="How we use information">
            <p>
              We use information to sign you in, run your church&rsquo;s assessment, build
              church-level reports, send the emails the Service depends on (magic sign-in links,
              invitations, and deadline reminders), respond to support requests, and keep the
              Service secure.
            </p>
            <p>
              Just as important is what we <strong className="text-ink">don&rsquo;t</strong> do: no
              advertising, no marketing lists, no profiling, no secondary uses, and{' '}
              <strong className="text-ink">no selling or renting of personal information</strong>,
              ever. The emails we send are service emails only, sent because you asked to sign in or
              because your church arranged an assessment.
            </p>
          </Section>

          <Section n="05" title="What your church sees, and what it never sees">
            <p>
              Anonymity is built into the Service, not bolted on. Church administrators can see who
              has been invited and whether each member has{' '}
              <strong className="text-ink">completed</strong> the assessment, and they see the
              church-level diagnosis. But{' '}
              <strong className="text-ink">no report surface, on screen, in PDF, or via a shared
              link, ever shows an individual&rsquo;s answers, scores, or identity</strong>. Results
              are presented in aggregate, and the code that renders reports refuses to render if
              respondent identifiers are present.
            </p>
            <p>
              Your church can share its own report through revocable, expiring links. A shared
              report is the same anonymized, church-level view.
            </p>
          </Section>

          <Section n="06" title="A note on religious information">
            <p>
              We never ask for your religious beliefs. But we&rsquo;re honest about an inference:
              being a member of a named church, in a tool made for churches, can itself indicate
              religious affiliation, and several state privacy laws treat information revealing
              religious beliefs as sensitive. We treat it that way too:{' '}
              <strong className="text-ink">it is used solely to provide the assessment to you and
              your church</strong>, is never sold, and is never used for advertising or any other
              purpose.
            </p>
          </Section>

          <Section n="07" title="Who we share information with">
            <p>
              We share information only with the service providers that make the Service run, each
              limited to what its job requires:
            </p>
            <ul className="my-2 space-y-2 border-l-2 border-line pl-4">
              <li>
                <strong className="text-ink">Supabase</strong>: our database and authentication
                provider. It stores the information described above and delivers magic-link
                sign-in emails.
              </li>
              <li>
                <strong className="text-ink">Resend</strong>: delivers invitation and reminder
                emails, so it processes recipient email addresses and the church&rsquo;s name.
              </li>
              <li>
                <strong className="text-ink">Vercel</strong>: hosts the Service and runs its daily
                reminder scheduler; it keeps standard server logs.
              </li>
              <li>
                <strong className="text-ink">OpenAI</strong>: when AI phrasing is enabled, the
                already-computed report results are sent to OpenAI&rsquo;s API to be worded into
                readable prose. As our{' '}
                <Link href="/methodology" className="text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
                  Methodology
                </Link>{' '}
                page explains, AI never decides a score or verdict.
              </li>
              <li>
                <strong className="text-ink">Google</strong>: only if you choose to sign in with
                Google, acting as your sign-in provider.
              </li>
            </ul>
            <p>
              Beyond service providers, we would disclose information only if the law requires it,
              to protect the Service and its users, or as part of a ministry reorganization or
              successor arrangement, in which case this policy would continue to apply. We{' '}
              <strong className="text-ink">do not sell personal information, and we do not
              &ldquo;share&rdquo; it for cross-context behavioral advertising</strong> as California
              law uses that term.
            </p>
          </Section>

          <Section n="08" title="Cookies, tracking, and Do Not Track">
            <p>
              The Service sets only <strong className="text-ink">essential session cookies</strong>{' '}
              from our authentication provider, which keep you signed in; the signed-in areas
              can&rsquo;t work without them. There are no analytics cookies, no advertising cookies,
              no third-party trackers, and no cross-site tracking of any kind. Public pages work
              without any cookies at all.
            </p>
            <p>
              Because we don&rsquo;t track anyone, browser signals like Do Not Track or Global
              Privacy Control don&rsquo;t change how the Service behaves: everyone already gets the
              no-tracking treatment.
            </p>
          </Section>

          <Section n="09" title="How long we keep information">
            <p>
              Account information is kept while your account exists and deleted when you ask us to
              close it. Assessment answers are kept as part of your church&rsquo;s assessment
              record; note that if you leave or are removed from a church, answers you already
              submitted remain part of that record (always anonymized on report surfaces) unless you
              ask us to delete them. Invitation records are kept even after an invitation expires or
              is revoked, until deletion is requested. Server and sign-in logs are kept on short
              rolling windows by our providers.
            </p>
          </Section>

          <Section n="10" title="Your choices and rights">
            <p>
              Email{' '}
              <a href="mailto:info@xpgathering.com" className="text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
                info@xpgathering.com
              </a>{' '}
              to <strong className="text-ink">access</strong> a copy of your information,{' '}
              <strong className="text-ink">correct</strong> it,{' '}
              <strong className="text-ink">delete</strong> it, or ask questions about it. We honor
              these requests for everyone, regardless of which state you live in. We&rsquo;ll verify
              the request using the email address on the account and respond within 45 days, and if
              you disagree with our answer, reply and we&rsquo;ll take a second look.
            </p>
            <p>
              We do not sell personal information, so there is nothing to opt out of; Nevada
              residents may nonetheless submit do-not-sell requests to the same address. If
              you&rsquo;ve been invited to an assessment and would rather not participate, you can
              simply ignore the invitation or ask us to remove your email.
            </p>
          </Section>

          <Section n="11" title="How we protect information">
            <p>
              Information is encrypted in transit and at rest by our infrastructure providers.
              Access inside the Service is governed by database-level row security that denies by
              default, so a church&rsquo;s data is only reachable by its own members, and
              administrative credentials are kept to least privilege. Sign-in is passwordless, which
              means there is no password database to steal. No system is perfectly secure, and we
              don&rsquo;t promise otherwise, but if a breach ever affects your information we will
              notify you and the authorities as the law requires, without undue delay.
            </p>
          </Section>

          <Section n="12" title="Children">
            <p>
              The Service is intended for adults <strong className="text-ink">18 and older</strong>.
              It is not directed to children, and we do not knowingly collect personal information
              from children under 13. If you believe a child under 13 has provided us personal
              information, contact us at{' '}
              <a href="mailto:info@xpgathering.com" className="text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
                info@xpgathering.com
              </a>{' '}
              and we will promptly delete it.
            </p>
          </Section>

          <Section n="13" title="Changes to this policy">
            <p>
              If we make material changes, we&rsquo;ll email account holders before the changes take
              effect and update the &ldquo;Last updated&rdquo; date at the top of this page. Minor
              changes may be posted with a date update alone. We keep prior versions on file; ask if
              you&rsquo;d like one.
            </p>
          </Section>

          <Section n="14" title="Contact us">
            <p>
              For anything in this policy, including privacy requests:{' '}
              <a href="mailto:info@xpgathering.com" className="text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
                info@xpgathering.com
              </a>
              .
            </p>
          </Section>
        </div>

        <div className="mt-14 rounded-2xl border border-line bg-sand/50 p-6 sm:p-8">
          <h2 className="font-display text-2xl text-ink">The rules of the road</h2>
          <p className="mt-3 max-w-[52ch] font-body text-ink-soft">
            Who may use the Service, who owns what, and what the results are (and are not), in the
            same plain English.
          </p>
          <Link
            href="/terms"
            className="mt-5 inline-block rounded-md border border-line bg-ink px-4 py-2 font-body text-sm text-paper transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Read the Terms of Service
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
