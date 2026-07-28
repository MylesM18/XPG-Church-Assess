// app/app/[churchId]/diagnosis/report/system.tsx
export function GatingFlags({ text }: { text: string }) {
  // Flags never headline — a muted secondary note (spec §6.2 row 6).
  return (
    <section className="flex flex-col gap-1">
      <p className="font-body text-sm text-ink-soft">{text}</p>
    </section>
  )
}

export function Disagreement({
  text, respondents,
}: {
  text: string
  respondents: Array<{ label: string; mean: number }>
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-xl text-ink">Where your leaders disagree</h2>
      <p className="font-body text-ink">{text}</p>
      {respondents.length > 0 && (
        <ul className="flex flex-col gap-1">
          {respondents.map((r) => (
            <li key={r.label} className="font-body text-sm text-ink-soft">
              {r.label}: {r.mean.toFixed(1)}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
