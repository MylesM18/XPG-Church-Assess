export function SiteHeader() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-[1080px] items-center gap-[11px] px-[26px] py-3">
        <svg
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
          focusable="false"
          className="h-[26px] w-[26px] shrink-0 text-ink"
        >
          <circle cx="6" cy="16" r="3.4" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="16" cy="16" r="3.4" fill="currentColor" className="text-berry" />
          <circle cx="26" cy="16" r="3.4" stroke="currentColor" strokeWidth="1.6" />
          <line x1="9.4" y1="16" x2="12.6" y2="16" stroke="currentColor" strokeWidth="1.6" />
          <line x1="19.4" y1="16" x2="22.6" y2="16" stroke="currentColor" strokeWidth="1.6" />
        </svg>

        <div className="font-display text-[17px] font-medium leading-none tracking-[.1px]">
          XP Gathering
          <small className="mt-[3px] block font-body text-[8.5px] font-semibold uppercase tracking-[2.4px] text-ink-soft">
            Church Health
          </small>
        </div>

        <a
          href="/sign-in"
          className="ml-auto inline-flex items-center rounded-full border border-line px-[15px] py-2 font-body text-[12.5px] font-semibold text-ink transition-colors hover:border-ink hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Sign in
        </a>
      </div>
    </header>
  )
}
