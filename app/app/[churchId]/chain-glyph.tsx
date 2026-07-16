export function ChainGlyph({
  position,
  broken = false,
}: {
  position: number
  broken?: boolean
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5"
      aria-label={`Chain stage ${position} of 5`}
    >
      {[1, 2, 3, 4, 5].map((p) => {
        const isHere = p === position
        const cls = broken && isHere ? 'bg-berry border-berry' : isHere ? 'bg-ink border-ink' : 'border-line'
        return <span key={p} className={`h-2 w-2 rounded-full border ${cls}`} />
      })}
    </span>
  )
}
