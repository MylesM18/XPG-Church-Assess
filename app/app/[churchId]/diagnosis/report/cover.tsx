// app/app/[churchId]/diagnosis/report/cover.tsx
import { confidenceBand } from './shared'

export function VerdictHeader({
  name, brandColor, monogram, verdict, throughput, confidence,
}: {
  name: string
  brandColor: string
  monogram: string
  verdict: string
  throughput: number
  confidence: number
}) {
  const band = confidenceBand(confidence)
  return (
    <header className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-md font-display text-lg text-white"
          style={{ backgroundColor: brandColor }}
        >
          {monogram}
        </div>
        <div>
          <h1 className="font-display text-2xl text-ink">{name}</h1>
          <p className="font-body text-sm text-ink-soft">Overall {throughput} · Confidence: {band.label}</p>
        </div>
      </div>
      <p className="font-body text-lg text-ink">{verdict}</p>
      {band.low && (
        <p className="font-body text-sm text-ink-soft">
          Based on limited responses — add respondents to sharpen this.
        </p>
      )}
    </header>
  )
}
