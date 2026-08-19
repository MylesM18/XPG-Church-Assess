'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { loadMethodology } from '@/lib/methodology/load'
import { createClient } from '@/lib/supabase/server'
import { deriveDiagnosisForRun } from '@/lib/report/derive'
import type { Response } from '@/lib/engine/types'
import { responseHash } from '@/lib/report/response-hash'
import { buildFacts } from '@/lib/report/facts'
import { knownLabels } from '@/lib/report/anonymity'
import { clusterThemes } from '@/lib/ai/themes'
import { composeReport, isUsableCachedReport } from '@/lib/report/compose'
import { loadChurchProfile } from '@/lib/data/churches'
import type { ChurchProfile } from '@/lib/data/churches'
import { churchFactsFrom, reflectionRowsFor, reportInputs } from '@/lib/report/inputs-hash'
import { requireChurchAdmin } from '@/lib/auth/require-church-admin'
import { proseEnabled } from '@/lib/ai/prose-mode'

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

// regenerateReport's recency guard: a USABLE `reports` row at the live inputs hash written more
// recently than this is not regenerated again (see the dedup block in regenerateReport). Long
// enough to cover two admins / two tabs auto-firing on the same view, short enough that a
// deliberate later regenerate at the same hash still goes through.
const REGENERATE_DEDUP_WINDOW_MS = 10 * 60_000
// How far AHEAD of this function's clock a `reports.generated_at` (Postgres now()) may be and still
// count as "just written". Ordinary NTP skew is tens of ms; a minute is generous without letting a
// genuinely mis-set clock pin regenerate shut.
const REGENERATE_DEDUP_SKEW_TOLERANCE_MS = 60_000

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
  // SINGLE-RUN INVARIANT: this lookup and get_run_responses both now resolve through
  // current_run() — status-agnostic, `order by created_at asc limit 1` — since migration
  // 20260818000100 (ADR 0003), so they agree by construction. The multi-run warning still
  // applies: v1 seeds exactly one run per church (create_church; multi-run deferred by ADR
  // 0001), and under multi-run they could still resolve DIFFERENT rows if that resolution
  // logic ever diverges between the two call sites — and, unlike the prose-cache mismatch
  // this pre-dated, that edition is now baked into a persisted diagnosis. Any multi-run work
  // must thread one resolved run id through both.
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

  // Plan 3: best-effort executive report. Gated by the shared proseEnabled() helper
  // (lib/ai/prose-mode.ts: OPENAI_API_KEY present ⇒ on; PROSE_MODE=ai|fallback overrides), the
  // same function the diagnosis page reads, so the two can never disagree; when prose is off no
  // API call is made and nothing is logged under [report] (the helper logs its own single
  // `[prose-mode]` reason line). The diagnosis is already committed above, so this whole block is
  // wrapped: no SDK/network/RPC failure may break the saved diagnosis or the redirect below.
  //
  // (The M5b diagnosis-prose block that used to sit here — generateProse + save_prose, writing
  // `diagnoses.prose` — was retired in fix/auto-generate-hardening: nothing has rendered that
  // column since the report redesign, and once key-present meant on it was one paid serial model
  // call per Generate for dead data.)
  if (proseEnabled()) {
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
 * generation and would otherwise never call the model, whatever the env is later set to.
 * It is still not a general "regenerate" button: both triggers are "no usable AI prose".
 *
 * Since fix/prose-auto-generate-on-view the diagnosis page ALSO invokes this action AUTOMATICALLY
 * when an admin views the page and `needsGeneration || stale` holds while prose is enabled: it
 * passes `regenerateReport` as the `action` prop of the client component
 * app/app/[churchId]/diagnosis/auto-generate-report.tsx, which fires it once per browser session
 * per (church, inputs hash) — a sessionStorage latch keyed on the resolver's `inputsHash`, so a
 * later settings change is a new latch — with `auto=1` in the FormData, and only for a COMPLETED
 * run (the page passes `auto={!runIsOpen}`; on an open / reopened run every member submission is
 * a new hash). That component also owns the Generate / Regenerate button, which is the fallback
 * and retry path (a failed auto-run leaves the latch set, so the admin's next resort is the button,
 * not a loop) and sends no `auto` flag. This action revalidates the diagnosis path itself on every
 * path that changes what the page shows — the client does not refresh. Auto or manual, the same
 * admin gate below applies; an invitee viewing the page renders neither.
 *
 * That latch is per TAB, so two admins — or one admin in two tabs — viewing at once each pass
 * their own latch and each invoke this action for the same inputs (Greptile P1, PR #79). The
 * server therefore closes the post-write window itself: after the inputs hash is computed and
 * BEFORE any model call, it re-reads the `reports` row scoped to (run_id, inputs_hash) and skips
 * (logs, revalidates the page, returns without spending) when that row was written within
 * REGENERATE_DEDUP_WINDOW_MS and is USABLE (isUsableCachedReport — at least one AI section), or
 * — for an AUTO-triggered call, `auto=1` — was written within the window at all, usable or not
 * (a fresh all-fallback row means the model just failed for these inputs; auto-runs back off, the
 * button is the retry). See the inline block for the full rule set. No migration, no lock: truly
 * simultaneous in-flight calls can still both run — accepted; save_report's UPSERT makes that safe
 * and the only cost is duplicate spend. The skip DOES revalidate the page: a manual click from a
 * tab that rendered before another tab's write must see the fresh row, and Next does not
 * re-render a form action that neither revalidates nor redirects.
 *
 * Gate: `proseEnabled()` (lib/ai/prose-mode.ts) — OPENAI_API_KEY present ⇒ on, PROSE_MODE=ai
 * forces on, PROSE_MODE=fallback forces off. The page's affordances read the same function.
 *
 * Reads through get_completed_run_responses, kept for the report path per spec. Since ADR 0003
 * (migration 20260818000100) get_run_responses no longer filters status either — both RPCs are
 * status-agnostic via current_run(), so either one would now return the run's rows.
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

  if (!proseEnabled()) return

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

    // No cache check on CONTENT staleness. Regenerating is the point; save_report's on-conflict
    // UPSERT (migration 20260814000100) makes it both safe and effective — an unchanged inputs
    // hash overwrites the stored row rather than being discarded. The ONLY guard is the short
    // recency window below: the auto-generate component's sessionStorage latch is per TAB (and the
    // dashboard opens this page in a new tab), so two admins / two tabs viewing at once each pass
    // their own latch and would each spend the model on identical inputs. Same scoped read as
    // generation's cache check (run_id AND inputs_hash — unscoped, a sibling church's row could
    // suppress this one; unique (run_id, inputs_hash) ⇒ .maybeSingle() is safe).
    //
    // Two rules, by caller:
    //   - MANUAL (the button): only a USABLE fresh row skips. A row that is 100 % fallback never
    //     suppresses a manual regenerate — that is the H7 point, the button is the retry.
    //   - AUTO (`auto=1`, sent only by the diagnosis page's mount effect): ANY fresh row skips,
    //     usable or not. A fresh all-fallback row means the model just failed for these inputs;
    //     re-running it from every new tab / every dashboard click is unbounded spend with no
    //     signal, so auto-runs back off for the window and the button stays as the retry.
    // No migration and no lock: truly simultaneous in-flight calls can still both run (accepted —
    // the UPSERT keeps that safe, the only cost is duplicate spend); this closes the post-write
    // window. A skip STILL revalidates the page: the caller may have rendered before the other
    // tab's write, and Next does not re-render a form action that neither revalidates nor
    // redirects — without it a manual click in the window shows nothing at all.
    //
    // generated_at is Postgres now() and Date.now() is this function's clock: a row stamped a few
    // seconds AHEAD is "just written", not "not yet written", so the window tolerates a small
    // negative age; a far-future stamp is still ignored (fail closed against a bad clock — never
    // suppress regenerate until the wall clock catches up).
    const { data: cached, error: cachedErr } = await supabase
      .from('reports')
      .select('section_sources, generated_at')
      .eq('run_id', run.id)
      .eq('inputs_hash', inputsHash)
      .maybeSingle()
    if (cachedErr) {
      // Fails OPEN — one duplicate spend beats a silently pinned report — but say so. Reason only.
      console.warn('[report] reports read failed; regenerating anyway:', cachedErr.message)
    }
    const auto = formData.get('auto') === '1'
    if (cached && (auto || isUsableCachedReport(cached.section_sources))) {
      const writtenAt = cached.generated_at ? Date.parse(cached.generated_at) : NaN
      const ageMs = Date.now() - writtenAt
      if (
        Number.isFinite(ageMs) &&
        ageMs > -REGENERATE_DEDUP_SKEW_TOLERANCE_MS &&
        ageMs < REGENERATE_DEDUP_WINDOW_MS
      ) {
        // Seconds only — never the row, the sections, or any church / respondent data.
        console.warn(
          '[report] regenerate skipped: a report for these inputs was written ' +
            `${Math.max(0, Math.round(ageMs / 1000))}s ago${auto ? ' (auto-run backoff)' : ''}`,
        )
        revalidatePath(`/app/${churchId}/diagnosis`)
        return
      }
    }

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
