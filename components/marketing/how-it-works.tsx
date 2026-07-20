const STEPS = [
  {
    n: 1,
    title: 'Create your church profile',
    body: 'A quick overview of your church — size, staff, budget, context. It sets the benchmark every score is measured against, so you’re compared to churches like yours, not to megachurches.',
  },
  {
    n: 2,
    title: 'Answer, or hand it off',
    body: 'You can answer all eight categories yourself, or invite the right leader to weigh in on the area they know best. Invite more than one person per category — where they disagree is often the finding.',
  },
  {
    n: 3,
    title: 'Read your diagnosis',
    body: 'Not a scorecard. A verdict: the one constraint holding you back, the evidence behind it, what not to waste a year on, and the single next step. Visible only to you and whoever you approve.',
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" tabIndex={-1} className="pb-[90px] pt-5">
      <div className="mx-auto mb-11 max-w-[40em] text-center">
        <p className="mb-3 font-body text-[11px] font-semibold uppercase tracking-[2.4px] text-ink-soft">
          The flow
        </p>
        <h2 className="font-display text-[32px] font-normal tracking-[-.3px]">
          Built for the exec who owns it, and the leaders who help.
        </h2>
      </div>

      <ol className="grid gap-[22px] min-[861px]:grid-cols-3">
        {STEPS.map((step) => (
          <li key={step.n} className="rounded-card border border-line bg-white px-6 py-[26px]">
            <span
              aria-hidden="true"
              className="mb-4 flex h-[34px] w-[34px] items-center justify-center rounded-full border-[1.5px] border-ink font-display text-[15px] font-semibold text-ink"
            >
              {step.n}
            </span>
            <h3 className="mb-[9px] font-display text-[19px] font-medium">{step.title}</h3>
            <p className="font-body text-[13.5px] leading-[1.5] text-ink-soft">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
