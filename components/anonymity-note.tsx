// A small, static, always-visible privacy callout. Single source of the approved copy so the two
// surfaces that show it (the answer page and the invite-accept 'ready' state) can never drift.
// Presentational only — no data, no async, no interactivity. Muted secondary styling mirrors the
// GatingFlags note in app/app/[churchId]/diagnosis/report/system.tsx: font-body text-sm text-ink-soft.
export function AnonymityNote({ className }: { className?: string }) {
  return (
    <p className={`font-body text-sm text-ink-soft${className ? ` ${className}` : ''}`}>
      <strong className="text-ink">Your answers are private.</strong>{' '}
      Your individual answers are never shown to anyone — the report shows only your church’s
      combined results, never who said what.
    </p>
  )
}
