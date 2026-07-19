export function Hero() {
  return (
    <section className="grid items-center gap-[34px] pb-16 pt-[82px] min-[861px]:grid-cols-[1.15fr_.85fr] min-[861px]:gap-12">
      <div>
        <p className="font-body text-[11px] font-semibold uppercase tracking-[2.4px] text-ink-soft">
          A diagnostic instrument for church leadership
        </p>

        <h1 className="mt-[18px] font-display text-[44px] font-light leading-[1.02] tracking-[-.5px] min-[861px]:text-[60px]">
          Find the <em className="italic text-berry">one thing</em>
          <br className="hidden min-[861px]:block" />{' '}
          that&rsquo;s actually stuck.
        </h1>

        <p className="mb-8 mt-6 max-w-[30em] font-body text-[18px] leading-[1.55] text-ink-soft">
          Most church assessments hand you twelve scores and leave you to guess. XP Gathering reads
          how your ministry areas depend on each other, finds the earliest place the chain breaks,
          and tells you where to focus — and, just as often, where not to.
        </p>

        <div className="flex flex-wrap items-center gap-[14px]">
          <a
            href="/get-started"
            className="inline-flex items-center gap-[9px] rounded-full bg-ink px-6 py-3 font-body text-[14px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Get started
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M3 8h10M9 4l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>

          <a
            href="#how-it-works"
            className="inline-flex items-center rounded-full border border-line px-6 py-3 font-body text-[14px] font-semibold text-ink transition-colors hover:border-ink hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            See how it works
          </a>
        </div>

        <p className="mt-5 flex items-center gap-2 font-body text-[13px] text-ink-soft">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
            <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" strokeWidth="1.4" />
          </svg>
          Results are private to your church&rsquo;s leadership. You control who sees them.
        </p>
      </div>
    </section>
  )
}
