'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { loadMethodology } from '@/lib/methodology/load'
import { createClient } from '@/lib/supabase/server'
import { deriveDiagnosisForRun } from '@/lib/report/derive'
import type { Response } from '@/lib/engine/types'
import { responseHash } from '@/lib/report/response-hash'
import { generateProse } from '@/lib/ai/prose'

// Raw shape of one get_run_responses row (supabase.rpc returns it untyped). respondent_user_id
// is null for a row predating the 20260728000100 migration or a submission the RPC never
// resolved to a member id; the map below falls back to the label in that case.
interface RunResponseRow {
  category_id: string
  item_id: string
  value: number
  respondent_label: string
  respondent_user_id: string | null
  reflection: string | null
}

export async function generateDiagnosis(churchId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You must be signed in.' }

  const methodology = loadMethodology()
  const categories = methodology.questions.categories

  // Raw per-respondent rows — server-side ONLY, never returned to the browser.
  const { data: raw, error: respError } = await supabase.rpc('get_run_responses', {
    p_church_id: churchId,
  })
  if (respError) return { ok: false, error: respError.message }
  const responses: Response[] = (raw ?? []).map((r: RunResponseRow) => ({
    category_id: r.category_id,
    item_id: r.item_id,
    value: r.value,
    respondent_label: r.respondent_label,
    respondent_id: r.respondent_user_id ?? r.respondent_label,
  }))

  const { data: church } = await supabase
    .from('churches')
    .select('attendance_band')
    .eq('id', churchId)
    .maybeSingle()

  // The run row, read BEFORE scoring rather than inside the AI-prose block below, because its
  // `methodology_version` decides which edition of the questions this run is scored against
  // (deriveDiagnosisForRun → effectiveMethodologyForRun). Same filters as before; `run.id` is
  // reused for the prose cache-check further down.
  //
  // A READ ERROR MUST NOT FALL THROUGH. It yields run === null → a null version → a CURRENT run
  // scored as if it predated the outreach questions: its outreach answers silently dropped, the
  // diagnosis stamped '0.2.0', and then persisted by save_diagnosis below with no error shown. So
  // bail on `runError`. `!run` is deliberately NOT guarded: the genuine no-row case is
  // self-limiting, because get_run_responses resolves its own run the same way and returns nothing,
  // which blocks every area at the gate and produces a friendly error before any save.
  //
  // SINGLE-RUN INVARIANT: this lookup is status-agnostic while get_run_responses resolves
  // `status = 'in_progress' order by created_at asc limit 1`. They agree only because v1 seeds
  // exactly one run per church (create_church; multi-run deferred by ADR 0001). Under multi-run
  // they could resolve DIFFERENT rows and a run's responses would be scored against another run's
  // edition — and, unlike the prose-cache mismatch this pre-dated, that edition is now baked into
  // a persisted diagnosis. Any multi-run work must thread one resolved run id through both.
  const { data: run, error: runError } = await supabase
    .from('assessment_runs')
    .select('id, methodology_version')
    .eq('church_id', churchId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (runError) return { ok: false, error: runError.message }

  // normalize → diagnosis gate → attendance-band guard → assemble, the SAME sequence the three
  // report surfaces re-derive with at render (deriveDiagnosisForRun, lib/report/derive.ts). Sharing
  // it here is what guarantees generateDiagnosis and the render path can never disagree about what
  // "complete" means or which bands are known. HARD GATE (spec §4.6): never diagnose a run where
  // some area has zero fully-covered respondents (a phantom constraint), and never assemble() with
  // an unknown band (benchmarkFor() throws) — both surface as friendly errors here, not a 500.
  const derived = deriveDiagnosisForRun(
    responses,
    methodology,
    { attendance_band: church?.attendance_band ?? '' },
    run?.methodology_version ?? null,
  )
  if (!derived.ok) {
    if (derived.reason === 'incomplete_areas') {
      const names = derived.blockedAreas
        .map((id) => categories.find((c) => c.id === id)?.name ?? id)
        .join(', ')
      return {
        ok: false,
        error: `Every area needs at least one person who answered all its questions. Still waiting on: ${names}.`,
      }
    }
    return { ok: false, error: 'Set your church’s weekend attendance band before generating a diagnosis.' }
  }

  const diagnosis = derived.diagnosis
  const hash = responseHash(responses, diagnosis.methodology_version)

  const { error: saveError } = await supabase.rpc('save_diagnosis', {
    p_church_id: churchId,
    p_response_hash: hash,
    p_methodology_version: diagnosis.methodology_version,
    p_payload: diagnosis,
  })
  if (saveError) return { ok: false, error: saveError.message }

  // M5b: best-effort AI prose. Gated by PROSE_MODE to match the report page's read gate
  // exactly (diagnosis/page.tsx), so an unset mode makes no API call. The diagnosis is
  // already committed above, so this whole block is wrapped: no SDK/network/RPC failure
  // may break the saved diagnosis or the redirect below.
  if ((process.env.PROSE_MODE ?? 'fallback') !== 'fallback') {
    try {
      // Cache-check: array-tolerant SELECT (RLS permits member SELECT on diagnoses).
      // Regenerate only when no 'ai' row exists for this hash; the hash changes iff the
      // answer set changes, so resubmitting identical answers is a no-op.
      //
      // Scoped to THIS church's run — `run`, resolved above the derive because its
      // methodology_version selects the scoring edition. responseHash carries no church
      // identifier (lib/report/response-hash.ts) and `diagnoses` has no church_id column — the
      // church link is run_id → assessment_runs.church_id. Unscoped, an identically-answered
      // sibling church's 'ai' row is visible under RLS to a shared admin and would suppress
      // generation here permanently. The lookup resolves the same run the report actually
      // renders. (save_prose narrows server-side too, by church_id + response_hash; the two
      // coincide while v1 keeps one run per church.) No status filter, so hoisting the read to
      // before save_diagnosis flips the run to 'complete' selects the same row either way.
      //
      // An unresolvable run degrades to a cache MISS (generate), never a skip: generateDiagnosis
      // is one-shot per church — save_diagnosis completes the run, so get_run_responses' own
      // in_progress filter then returns nothing, normalize() sees zero responses, diagnosisGate
      // blocks every area, and a second attempt never reaches this block. Forfeiting here on a
      // transient read failure would reproduce the very harm this scoping fixes. save_prose
      // resolves its own row from church_id + response_hash, so it needs no run id.
      let alreadyAi = false
      if (run) {
        const { data: rows } = await supabase
          .from('diagnoses')
          .select('prose_source')
          .eq('run_id', run.id)
          .eq('response_hash', hash)
        alreadyAi = (rows ?? []).some((r) => r.prose_source === 'ai')
      }
      if (!alreadyAi) {
        // The run's OWN edition, not the current one: `diagnosis` is stamped with it, so prose
        // written against the current question set would describe items this run never asked.
        const blocks = await generateProse(diagnosis, derived.effectiveMethodology) // never throws → ReportBlocks | null
        if (blocks) {
          await supabase.rpc('save_prose', {
            p_church_id: churchId,
            p_response_hash: hash,
            p_prose: blocks,
            p_prose_source: 'ai',
          })
        }
      }
    } catch (err) {
      // Backstop for the Supabase calls around generateProse (cache-check SELECT,
      // save_prose RPC) — NOT for generateProse itself, which never throws: its
      // SDK/network/parse/fact-check failures are already caught and logged inside
      // lib/ai/prose.ts. Swallow everything here too so the committed diagnosis and the
      // redirect below are never affected. No secrets, no church/respondent data — reason only.
      console.warn('[m5b] AI prose persistence failed, falling back to deterministic prose:', err instanceof Error ? err.message : 'unknown error')
    }
  }

  revalidatePath(`/app/${churchId}`)
  revalidatePath(`/app/${churchId}/diagnosis`)
  redirect(`/app/${churchId}/diagnosis`)
}
