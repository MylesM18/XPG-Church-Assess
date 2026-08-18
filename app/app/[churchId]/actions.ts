'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { loadMethodology } from '@/lib/methodology/load'
import { createClient } from '@/lib/supabase/server'
import { deriveDiagnosisForRun } from '@/lib/report/derive'
import type { Response } from '@/lib/engine/types'
import { responseHash } from '@/lib/report/response-hash'
import { generateProse } from '@/lib/ai/prose'
import { buildFacts } from '@/lib/report/facts'
import { knownLabels } from '@/lib/report/anonymity'
import { clusterThemes } from '@/lib/ai/themes'
import { composeReport, isUsableCachedReport } from '@/lib/report/compose'
import { loadChurchProfile } from '@/lib/data/churches'
import type { ChurchProfile } from '@/lib/data/churches'
import { churchFactsFrom, reflectionRowsFor, reportInputs } from '@/lib/report/inputs-hash'
import { requireChurchAdmin } from '@/lib/auth/require-church-admin'

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

  // D-P4-5: loadChurchProfile throws on an unexpected read error, where the inline select
  // this replaces silently degraded to an all-null ChurchFacts. This line sits outside both
  // try blocks, so an unguarded switch would turn a transient profile read failure into an
  // unhandled server-action error. Catching to null keeps generation's old behaviour AND
  // keeps it identical to the diagnosis page's, which is what preserves hash parity when
  // the database is flaky — the one condition nobody smoke-tests.
  let churchProfile: ChurchProfile | null = null
  try {
    churchProfile = await loadChurchProfile(supabase, churchId)
  } catch {
    churchProfile = null
  }
  const churchFacts = churchFactsFrom(churchProfile, '')

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
    { attendance_band: churchProfile?.attendance_band ?? '' },
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

  // Plan 3: best-effort executive report. A SECOND block, deliberately separate from the M5b
  // prose block above — the 10-block diagnosis page is still live until plan 4, so both run.
  // Same PROSE_MODE gate, so an unset mode makes no API call and logs nothing at all. The
  // diagnosis is already committed, so nothing in here may break it or the redirect.
  if ((process.env.PROSE_MODE ?? 'fallback') !== 'fallback') {
    try {
      // Reflection rows come from `raw`, NOT from `responses`: Response[] deliberately drops
      // `.reflection` and tests/outreach/ai-exclusion.test.ts pins that it stays dropped.
      // respondent_key is the STABLE identity (respondent_user_id ?? respondent_label), never
      // respondent_label alone, which is display-only and can collide across two people —
      // counting on labels would undercount and weaken the k>=3 gate.
      const reflectionRows = reflectionRowsFor(raw ?? [])

      const labelSource = knownLabels(responses)

      // INPUTS ONLY, and computed BEFORE the cache check: clustered themes are model output, so
      // they must never participate in the key that decides whether to call the model.
      const { inputsHash, baseFacts } = reportInputs({
        diagnosis,
        methodology: derived.effectiveMethodology,
        responses,
        church: churchFacts,
        completedAt: new Date().toISOString(),
        labelSource,
        responseHash: hash,
        reflections: reflectionRows,
      })

      // Cache check scoped to THIS church's run, for the same reason the prose cache above is:
      // an unscoped lookup lets a sibling church's row suppress generation permanently. An
      // unresolvable run degrades to a MISS (generate), never a skip.
      //
      // I9: a matching row alone is not enough — a row written when every AI section failed its
      // gate is 100% fallback, and treating it as a hit would pin that report to fallback
      // forever with no regenerate path. isUsableCachedReport requires at least one section to
      // have come from the model; unique (run_id, inputs_hash) means at most one row can match,
      // so .maybeSingle() is safe here.
      let alreadyReported = false
      if (run) {
        const { data: cached } = await supabase
          .from('reports')
          .select('section_sources')
          .eq('run_id', run.id)
          .eq('inputs_hash', inputsHash)
          .maybeSingle()
        alreadyReported = !!cached && isUsableCachedReport(cached.section_sources)
      }

      if (!alreadyReported) {
        // null = the task failed: S8 falls back to the per-area voices lists and no themes are
        // persisted. [] = determinate, the model answered and nothing survived the gates —
        // persist as-is; retrying would produce the same verdict.
        const themes = await clusterThemes(reflectionRows, derived.effectiveMethodology, labelSource)
        const facts = themes === null
          ? baseFacts
          : buildFacts({
              diagnosis,
              methodology: derived.effectiveMethodology,
              responses,
              church: churchFacts,
              completedAt: baseFacts.cover.completed_at,
              labelSource,
              themes,
            })

        const composed = await composeReport({
          facts,
          methodology: derived.effectiveMethodology,
          labels: labelSource.kind === 'known' ? labelSource.labels : [],
        })

        await supabase.rpc('save_report', {
          p_church_id: churchId,
          p_inputs_hash: inputsHash,
          p_methodology_version: diagnosis.methodology_version,
          p_payload: {
            archetype: facts.archetype,
            tier: facts.overall.tier.id,
            facts,
            sections: composed.sections,
            section_sources: composed.section_sources,
          },
        })
      }
    } catch (err) {
      // Backstop for the Supabase calls around composeReport (cache-check SELECT, save_report
      // RPC) — NOT for composeReport itself, which never throws. Swallow everything so the
      // committed diagnosis and the redirect are never affected. Reason only.
      console.warn('[report] generation failed:', err instanceof Error ? err.message : 'unknown error')
    }
  }

  revalidatePath(`/app/${churchId}`)
  revalidatePath(`/app/${churchId}/diagnosis`)
  redirect(`/app/${churchId}/diagnosis`)
}

/**
 * Rebuilds and re-persists the AI report for a church whose persisted row no longer matches its
 * live inputs (D-P5-4). Originally the recovery path for exactly one failure: an admin edited the
 * church profile after generation, the inputs hash moved, and every AI section silently reverted
 * to fallback with no way back. Since H7 (2026-08-18) the diagnosis page also offers it as
 * "Generate report" when NO AI section is usable for the live inputs — no `reports` row at all,
 * or a live-hash row that is 100 % fallback — because a completed run cannot re-enter first
 * generation and would otherwise never call the model, whatever PROSE_MODE is later set to.
 * It is still not a general "regenerate" button: both triggers are "no usable AI prose".
 *
 * Reads through get_completed_run_responses — the STATUS-AGNOSTIC RPC. Generation's
 * get_run_responses filters status='in_progress' and returns nothing once the run is complete,
 * so using it here would persist a report built from zero responses.
 *
 * save_report has no status filter, resolves the run via current_run(), and is
 * require_church_admin-gated. Since 20260814000100_rpc_save_report_upsert.sql it ends
 * `on conflict (run_id, inputs_hash) do update set ... generated_at = now()`, so a regenerate at
 * an UNCHANGED inputs hash now actually replaces the stored row instead of being silently
 * dropped. A double-click remains safe: the second write stores identical content and only moves
 * generated_at.
 *
 * Never throws to the user. A failed regenerate leaves the existing row and the existing notice
 * untouched, and logs a reason only — never payloads, church data, or respondent data.
 */
export async function regenerateReport(formData: FormData): Promise<void> {
  const churchId = String(formData.get('churchId') ?? '')
  if (!churchId) return

  if ((process.env.PROSE_MODE ?? 'fallback') === 'fallback') return

  try {
    const { supabase, error: authErr } = await requireChurchAdmin(churchId)
    if (authErr) {
      console.warn('[report] regenerate blocked:', authErr)
      return
    }
    const methodology = loadMethodology()

    const { data: raw } = await supabase.rpc('get_completed_run_responses', {
      p_church_id: churchId,
    })
    const responses: Response[] = (raw ?? []).map((r: RunResponseRow) => ({
      category_id: r.category_id,
      item_id: r.item_id,
      value: r.value,
      respondent_label: r.respondent_label,
      respondent_id: r.respondent_user_id ?? r.respondent_label,
    }))
    if (responses.length === 0) return

    const { data: run } = await supabase
      .from('assessment_runs')
      .select('id, methodology_version, completed_at')
      .eq('church_id', churchId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (!run) return

    // D-P4-5: catch to null so this degrades EXACTLY as generation and both render surfaces do.
    let churchProfile: ChurchProfile | null = null
    try {
      churchProfile = await loadChurchProfile(supabase, churchId)
    } catch {
      churchProfile = null
    }

    const { data: churchRow } = await supabase
      .from('churches')
      .select('name, attendance_band')
      .eq('id', churchId)
      .maybeSingle()
    if (!churchRow) return

    const derived = deriveDiagnosisForRun(
      responses,
      methodology,
      { attendance_band: churchRow.attendance_band ?? '' },
      run.methodology_version ?? null,
    )
    if (!derived.ok) return
    const diagnosis = derived.diagnosis

    const reflectionRows = reflectionRowsFor(raw ?? [])
    const labelSource = knownLabels(responses)
    const churchFacts = churchFactsFrom(churchProfile, churchRow.name)
    const hash = responseHash(responses, diagnosis.methodology_version)

    const { inputsHash, baseFacts } = reportInputs({
      diagnosis,
      methodology: derived.effectiveMethodology,
      responses,
      church: churchFacts,
      completedAt: run.completed_at,
      labelSource,
      responseHash: hash,
      reflections: reflectionRows,
    })

    // No cache check. Regenerating is the point; save_report's on-conflict UPSERT (migration
    // 20260814000100) makes it both safe and effective — an unchanged inputs hash overwrites the
    // stored row rather than being discarded.
    const themes = await clusterThemes(reflectionRows, derived.effectiveMethodology, labelSource)
    const facts = themes === null
      ? baseFacts
      : buildFacts({
          diagnosis,
          methodology: derived.effectiveMethodology,
          responses,
          church: churchFacts,
          completedAt: baseFacts.cover.completed_at,
          labelSource,
          themes,
        })

    const composed = await composeReport({
      facts,
      methodology: derived.effectiveMethodology,
      labels: labelSource.kind === 'known' ? labelSource.labels : [],
    })

    await supabase.rpc('save_report', {
      p_church_id: churchId,
      p_inputs_hash: inputsHash,
      p_methodology_version: diagnosis.methodology_version,
      p_payload: {
        archetype: facts.archetype,
        tier: facts.overall.tier.id,
        facts,
        sections: composed.sections,
        section_sources: composed.section_sources,
      },
    })
  } catch (err) {
    // Reason only — never the diagnosis, the facts, the composed sections, or respondent data.
    console.warn('[report] regenerate failed:', err instanceof Error ? err.message : 'unknown error')
    return
  }

  revalidatePath(`/app/${churchId}/diagnosis`)
}
