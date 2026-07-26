import type { Category } from '@/lib/methodology/schema'
import type { CoverageStatus } from '@/lib/coverage/coverage'
import type { MemberMatrixRow } from '@/lib/coverage/member-matrix'

// Local copy of the status vocabulary. page.tsx keeps its OWN STATUS_LABEL/STATUS_DOT because
// tests/dashboard/status-indicator.test.ts pins the bg-status-* tokens to page.tsx source; sharing
// would move those strings out of page.tsx and break that tripwire. A 3-entry duplication is the
// pragmatic choice. Colour is never the sole signal — the label text carries the meaning.
const STATUS_LABEL: Record<CoverageStatus, string> = {
  not_started: 'Not started',
  partial: 'In progress',
  covered: 'Completed',
}
const STATUS_DOT: Record<CoverageStatus, string> = {
  not_started: 'bg-status-red',
  partial: 'bg-status-amber',
  covered: 'bg-status-green',
}

export function MemberCoverageMatrix({
  matrix,
  categories,
  currentUserId,
}: {
  matrix: MemberMatrixRow[]
  categories: Category[]
  currentUserId: string | null
}) {
  if (matrix.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-lg text-ink">Member progress</h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse font-body text-sm">
          <caption className="sr-only">Each member’s progress across the assessment areas</caption>
          <thead>
            <tr>
              <th scope="col" className="p-2 text-left font-body text-xs text-ink-soft">Member</th>
              {categories.map((cat) => (
                <th key={cat.id} scope="col" className="p-2 text-left font-body text-xs text-ink-soft">
                  {cat.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row) => {
              const isSelf = row.member.user_id === currentUserId
              return (
                <tr key={row.member.user_id} className={isSelf ? 'bg-sand' : undefined}>
                  <th scope="row" className="p-2 text-left font-body text-sm text-ink">
                    {row.member.full_name ?? row.member.email ?? 'Unknown'}
                    {isSelf && <span className="text-ink-soft"> (you)</span>}
                  </th>
                  {row.cells.map((cell) => (
                    <td key={cell.category_id} className="p-2">
                      <span className="flex items-center gap-1.5">
                        <span
                          aria-hidden="true"
                          className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT[cell.status]}`}
                        />
                        <span className="text-xs text-ink-soft">{STATUS_LABEL[cell.status]}</span>
                      </span>
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
