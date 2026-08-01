/**
 * Presentational deadline banner. `tone` picks the text colour only — copy comes from the shared
 * builders in lib/deadlines/countdown. role="status" so a screen reader announces it on sign-in.
 */
export function DeadlineBanner({ text, tone }: { text: string; tone: 'info' | 'closed' }) {
  const textColor = tone === 'closed' ? 'text-berry' : 'text-ink'
  return (
    <div role="status" className={`rounded-md border border-line bg-paper px-4 py-2 font-body text-sm ${textColor}`}>
      {text}
    </div>
  )
}
