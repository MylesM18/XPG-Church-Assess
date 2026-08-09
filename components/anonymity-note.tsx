// A small, static, always-visible privacy callout. Single source of the approved copy so the
// surfaces that show it (the answer page, the invite-accept 'ready' state, and the dashboard under
// the primary CTA) can never drift. Presentational only — no data, no async, no interactivity.
// Muted secondary styling mirrors the GatingFlags note in
// app/app/[churchId]/diagnosis/report/system.tsx: font-body text-sm text-ink-soft.
//
// `variant` selects the body after the shared "Your answers are private." lead: 'full' (default)
// carries the "never shown to anyone" clause; 'short' drops it for tighter surfaces like the
// dashboard intro. Both keep the same lead and the same combined-results tail.
export function AnonymityNote({
  className,
  variant = 'full',
}: {
  className?: string
  variant?: 'full' | 'short'
}) {
  return (
    <p className={`font-body text-sm text-ink-soft${className ? ` ${className}` : ''}`}>
      <strong className="text-ink">Your answers are private.</strong>{' '}
      {variant === 'short'
        ? 'The report shows only your church’s combined results, never who said what.'
        : 'Your individual answers are never shown to anyone — the report shows only your church’s combined results, never who said what. If you add an optional reflection, though, it appears in the report exactly as written, unattributed — never with your name.'}
    </p>
  )
}
