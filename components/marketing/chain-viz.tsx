const STAGES = [
  { n: 1, name: 'Guest Experience', broken: false },
  { n: 2, name: 'Community / Connection', broken: true },
  { n: 3, name: 'Discipleship / Leadership', broken: false },
  { n: 4, name: 'Volunteer', broken: false },
  { n: 5, name: 'Generosity', broken: false },
]

const ENABLERS = ['Governance', 'Communication', 'Systems']

export function ChainViz() {
  return (
    <div className="rounded-card border border-line bg-white px-[26px] py-7 shadow-sm">
      <h2 className="mb-5 font-body text-[10.5px] font-semibold uppercase tracking-[1.8px] text-ink-soft">
        How your church is read
      </h2>

      <ol>
        {STAGES.map((stage, i) => (
          <li key={stage.n} className="relative flex items-center gap-[13px] py-[9px]">
            <span
              aria-hidden="true"
              className={
                stage.broken
                  ? 'z-[2] flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-berry bg-berry font-body text-[11px] font-bold text-white'
                  : 'z-[2] flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink bg-white font-body text-[11px] font-bold'
              }
            >
              {stage.n}
            </span>

            <span
              className={
                stage.broken
                  ? 'font-body text-[13.5px] font-bold text-berry'
                  : 'font-body text-[13.5px] font-medium'
              }
            >
              {stage.name}
            </span>

            {stage.broken && (
              <span className="ml-auto rounded-[5px] border border-berry px-2 py-[3px] font-body text-[10px] font-semibold uppercase tracking-[1px] text-berry">
                the break
              </span>
            )}

            {i < STAGES.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute left-[12.5px] top-[26px] z-[1] h-5 w-[1.5px] bg-line"
              />
            )}
          </li>
        ))}
      </ol>

      <div className="mt-5 border-t border-dashed border-line pt-[18px]">
        <p className="mb-[10px] font-body text-[10px] font-semibold uppercase tracking-[1.4px] text-sage">
          Enablers — they hold the chain up
        </p>
        <div className="flex flex-wrap gap-[7px]">
          {ENABLERS.map((name) => (
            <span
              key={name}
              className="rounded-full border border-sage px-[11px] py-1 font-body text-[11.5px] font-medium text-sage opacity-90"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
