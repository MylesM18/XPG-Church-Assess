// The app's only live-region primitive (WCAG SC 4.1.3 "Status Messages").
//
// The <p> is ALWAYS rendered and only its text content changes. Screen readers register live
// regions on mount and announce subsequent mutations, so a region inserted at the same moment as
// its first message is silently missed — `{error && <p aria-live>}` does not work. This API makes
// the broken form inexpressible: a caller cannot conditionally mount the region.
//
// When there is no message the <p> collapses to sr-only rather than rendering empty: every parent
// here is a flex column with a gap, and an always-present empty child would add a phantom gap row.
// sr-only is position:absolute (so not a flex item, no gap contribution) and, unlike display:none,
// stays in the accessibility tree — which is exactly what a live region needs.
//
// role="alert" implies aria-live="assertive"; role="status" implies aria-live="polite". Both imply
// aria-atomic="true", which makes the whole message read out rather than just the changed run.
// Setting aria-live as well would be redundant.
//
// No 'use client' directive: no hooks, no handlers, so it compiles into whichever boundary imports
// it. All current consumers are already client components.
export function LiveStatus({
  message,
  tone,
  className,
}: {
  message: string | null
  tone: 'error' | 'status'
  className: string
}) {
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={message ? className : 'sr-only'}>
      {message}
    </p>
  )
}
