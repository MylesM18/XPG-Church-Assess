import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export type RunStatus = 'in_progress' | 'complete'

export interface Run {
  id: string
  status: RunStatus
}

/**
 * The named write policy that used to hide inside the run-lookup's `where status = 'in_progress'`
 * clause. A run may receive answers only while it is in progress; once `save_diagnosis` completes
 * the run (terminal in v1), answers are read-only. Splitting this out of the run lookup is what stops
 * every call site from re-deciding the policy — see docs/adr/0001-review-only-completion-defer-multi-run.md.
 */
export function canAcceptAnswers(run: Pick<Run, 'status'> | null): boolean {
  return run?.status === 'in_progress'
}

/**
 * The church's single assessment run, resolved STATUS-AGNOSTICALLY. v1 is single-run:
 * `create_church_with_admin` seeds exactly one run (earliest by creation) and no path recreates it.
 * Reads, the dashboard, the report, and the read-only review all mean *this* run regardless of its
 * status; writability is a separate concern (see `canAcceptAnswers`). Returns null if the church has
 * no run.
 */
export async function currentRun(
  supabase: SupabaseServerClient,
  churchId: string,
): Promise<Run | null> {
  const { data, error } = await supabase
    .from('assessment_runs')
    .select('id, status')
    .eq('church_id', churchId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data as Run | null) ?? null
}
