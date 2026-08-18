'use server'

import { revalidatePath } from 'next/cache'
import { requireChurchAdmin } from '@/lib/auth/require-church-admin'
import { closeRun, reopenRun } from '@/lib/data/runs'
import { CLOSE_REOPEN_ERRORS, mapCloseReopenError, type RunActionResult } from '@/lib/runs/close-reopen'

type RunOp = typeof closeRun

/**
 * Shared body of the two admin run actions (ADR 0003). App-side admin guard first (the same
 * requireChurchAdmin the access + diagnosis actions use), then the single-RPC data op, then
 * revalidate the two surfaces that read run status. Revalidation ALSO runs on a stale-state refusal
 * ("run is already closed" / "run is not closed" — spec §7): that refusal means the page the admin
 * is looking at is out of date, so its next render must be fresh. Never on an auth failure — a
 * non-admin's request must not churn the admin's cache. No redirect: the dashboard re-renders in
 * place and the client control shows the mapped error inline.
 */
async function runAction(churchId: string, op: RunOp): Promise<RunActionResult> {
  const { supabase, error: authErr } = await requireChurchAdmin(churchId)
  if (authErr) return { ok: false, error: CLOSE_REOPEN_ERRORS.notAllowed }

  const { error } = await op(supabase, churchId)
  revalidatePath(`/app/${churchId}`)
  revalidatePath(`/app/${churchId}/diagnosis`)
  if (error) return { ok: false, error: mapCloseReopenError(error) }
  return { ok: true }
}

export async function closeAssessment(churchId: string): Promise<RunActionResult> {
  return runAction(churchId, closeRun)
}

export async function reopenAssessment(churchId: string): Promise<RunActionResult> {
  return runAction(churchId, reopenRun)
}
