import type { ReactNode } from 'react'

/**
 * The slim utility bar above the report cover (Part B decision 2): caps runline on the left,
 * the page's own actions on the right (Download PDF, and ShareControl for admins), a hairline
 * under it. Web-only chrome — the PDF has no equivalent — which is why it lives here and not
 * in sections.tsx. Rendered on the scoreable branch of the diagnosis page only.
 */
export function ReportToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-line pb-3 sm:flex-row sm:items-start sm:justify-between">
      <p className="font-body text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-ink-soft">
        XPG · CHURCH HEALTH ASSESSMENT
      </p>
      <div className="flex flex-col items-start gap-2 sm:items-end">{children}</div>
    </div>
  )
}

/**
 * An ink notice: sand box (the web token closest to the PDF's cream — cream itself is
 * indistinguishable from the paper ground), 4px ink left rule, body text. Wraps the stale +
 * Regenerate form and the not-scoreable StaleMethodologyNotice on the diagnosis page. It
 * styles ONLY the box — copy and actions belong to the children and are unchanged.
 */
export function ReportNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-l-4 border-ink bg-sand px-4 py-3 font-body text-base leading-[1.6] text-ink">
      {children}
    </div>
  )
}
