// app/app/[churchId]/diagnosis/report/chain.tsx
import type { EvidenceRef } from '@/lib/engine/types'
import type { StageView } from '@/lib/report/chain-walk'

export function StageTile({ stage }: { stage: StageView }) {
  const isConstraint = stage.bucket === 'constraint'
  const isDownstream = stage.bucket === 'downstream'
  const label = isConstraint ? 'Constraint' : isDownstream ? 'Downstream' : 'Holding'
  const barColor = isDownstream
    ? 'var(--color-ink-soft)'
    : isConstraint
      ? 'var(--color-berry)'
      : 'var(--color-sage)'
  return (
    <div
      className={[
        'flex flex-col gap-1 rounded-md border p-3',
        isConstraint ? 'border-l-4 border-berry' : 'border-line',
        isDownstream ? 'opacity-60' : '',
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <span className={['font-display text-base', isConstraint ? 'text-berry' : 'text-ink'].join(' ')}>
          {stage.name}
        </span>
        <span className={['font-body text-sm', isDownstream ? 'text-ink-soft' : 'text-ink'].join(' ')}>
          {label} · {stage.score}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-sand">
        <div className="h-1.5 rounded-full" style={{ width: `${stage.score}%`, backgroundColor: barColor }} />
      </div>
      {isConstraint && <p className="font-body text-sm text-berry">Your constraint — work here first.</p>}
      {isDownstream && stage.isDoNotWorkOn && (
        <span className="font-body text-xs text-ink-soft">Symptom of the constraint</span>
      )}
    </div>
  )
}

export function ChainWalk({ stages }: { stages: StageView[] }) {
  const anyDownstream = stages.some((s) => s.bucket === 'downstream')
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-xl text-ink">The chain walk</h2>
      <div className="flex flex-col gap-2">
        {stages.map((s) => (
          <StageTile key={s.category_id} stage={s} />
        ))}
      </div>
      {anyDownstream && (
        <p className="font-body text-sm text-ink-soft">Don’t work on the faded stages yet.</p>
      )}
    </section>
  )
}

export function EvidenceReceipt({ text, refs }: { text: string; refs: EvidenceRef[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-xl text-ink">The evidence</h2>
      <p className="font-body text-ink">{text}</p>
      {refs.length > 0 && (
        <ul className="flex flex-col gap-1">
          {refs.map((r) => (
            <li key={r.ref} className="font-body text-sm text-ink-soft">
              {r.ref}: {r.value ?? 'n/a'}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function CostSection({ cost, doNotWorkOn }: { cost: string; doNotWorkOn?: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-xl text-ink">What it’s costing you</h2>
      <p className="font-body text-ink">{cost}</p>
      {doNotWorkOn && <p className="font-body text-sm text-ink-soft">{doNotWorkOn}</p>}
    </section>
  )
}
