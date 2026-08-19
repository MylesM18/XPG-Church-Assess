import { createClient } from '@/lib/supabase/server'
import { loadMethodology } from '@/lib/methodology/load'
import { resolveBrand } from '@/lib/brand/resolve'
import { resolveScoreability } from '@/lib/report/view'
import { deriveDiagnosisForRun } from '@/lib/report/derive'
import { renderReportDocument } from '@/lib/report/pdf/render'
import { resolveReportSections } from '@/lib/report/resolve'
import { readPersistedReport } from '@/lib/data/reports'
import { knownLabels } from '@/lib/report/anonymity'
import { churchFactsFrom, reflectionRowsFor } from '@/lib/report/inputs-hash'
import { responseHash } from '@/lib/report/response-hash'
import { loadChurchProfile } from '@/lib/data/churches'
import type { ChurchProfile } from '@/lib/data/churches'
import type { Response } from '@/lib/engine/types'

// renderReportDocument (renderToBuffer) is Node-only (Yoga WASM + Buffer). Edge would fail at runtime.
export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Raw shape of one get_completed_run_responses row (supabase.rpc returns it untyped).
interface RunResponseRow {
  category_id: string
  item_id: string
  value: number
  respondent_label: string
  respondent_user_id: string | null
  reflection: string | null
}

/** Filename-safe ASCII slug. There is no slug column; derive from the name. */
function slugify(name: string): string {
  const s = name.normalize('NFKD').replace(/[^\x20-\x7E]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return s || 'church'
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params

  // Malformed id: fail before touching the database.
  if (!UUID.test(runId)) return new Response('Not found', { status: 404 })

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  // RLS gates this select. A non-member and a nonexistent run both yield no
  // row (no error), and both return 404 — never a 403, which would let a
  // caller probe which run ids exist. A real query failure sets `error`
  // instead, which we surface as a 500 so it isn't invisible in logs.
  // The diagnoses row is read ONLY for row existence (404). Its `payload` is NOT the view's
  // source: CT-2(c) re-derives the Diagnosis from the run's responses under the current
  // methodology instead, so a payload cached under an older methodology can never drive what
  // renders.
  const { data: diag, error: diagError } = await supabase
    .from('diagnoses')
    .select('prose')
    .eq('run_id', runId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (diagError) {
    console.warn('[m5c] PDF route: diagnoses query failed:', diagError.message)
    return new Response('Could not generate the PDF', { status: 500 })
  }
  if (!diag) return new Response('Not found', { status: 404 })

  const { data: run, error: runError } = await supabase
    .from('assessment_runs')
    .select('church_id, churches(name, brand_color, attendance_band), methodology_version, completed_at')
    .eq('id', runId)
    .maybeSingle()

  if (runError) {
    console.warn('[m5c] PDF route: assessment_runs query failed:', runError.message)
    return new Response('Could not generate the PDF', { status: 500 })
  }

  const church = run?.churches as unknown as
    | { name: string; brand_color: string; attendance_band: string | null }
    | undefined
  if (!church) return new Response('Not found', { status: 404 })

  try {
    const methodology = loadMethodology()

    // CT-2(c): re-derive the Diagnosis from the run's RESPONSES under the CURRENT methodology
    // rather than trusting diag.payload. Same member-gated RPC + stable-identity mapping the
    // authenticated page uses.
    const { data: rawResponses } = await supabase.rpc('get_completed_run_responses', {
      p_church_id: run!.church_id,
    })
    const responses: Response[] = (rawResponses ?? []).map((r: RunResponseRow) => ({
      category_id: r.category_id,
      item_id: r.item_id,
      value: r.value,
      respondent_label: r.respondent_label,
      respondent_id: r.respondent_user_id ?? r.respondent_label,
    }))
    // A second, separate array from the SAME raw rows — never merged into `responses` above
    // (Response has no reflection field). No respondent identifier travels alongside: buildAreas
    // (lib/report/view.ts) groups these by item_id only, so outreachVoices carries free text and
    // nothing that could attribute it to a person. Mirrors app/app/[churchId]/diagnosis/page.tsx.
    const reflections = (rawResponses ?? []).map((r: RunResponseRow) => ({
      item_id: r.item_id,
      reflection: r.reflection,
    }))
    const derived = deriveDiagnosisForRun(
      responses,
      methodology,
      { attendance_band: church.attendance_band ?? '' },
      run!.methodology_version ?? null,
    )

    // The edition the scoring actually used (see app/app/[churchId]/diagnosis/page.tsx): the PDF
    // must be built from the same methodology the re-derived diagnosis is stamped with, or an
    // exported legacy report would describe questions that run never asked. Never read on the
    // not-ok arm — that path 409s below without building a view.
    const reportMethodology = derived.ok ? derived.effectiveMethodology : methodology

    // D-P4-5: catch to null so this route degrades EXACTLY as generation and the page do. An
    // asymmetric degradation would make the surfaces disagree about `profile` precisely when the
    // database is flaky — permanent silent staleness under the one condition nobody smoke-tests.
    let churchProfile: ChurchProfile | null = null
    try {
      churchProfile = await loadChurchProfile(supabase, run!.church_id)
    } catch {
      churchProfile = null
    }

    // The same export both pages use (D-P4-6). A run that cannot be scored under the current
    // methodology cannot be exported — distinct 409, not the generic 500.
    const resolution = resolveScoreability(derived)
    if (!resolution.scoreable) {
      return new Response(
        'This report cannot be scored under the current methodology and cannot be exported until the assessment is completed.',
        { status: 409 },
      )
    }

    // Mirrors actions.ts and the diagnosis page argument-for-argument: `.methodology_version` off
    // the diagnosis object itself, never run.methodology_version. Hash parity across all three
    // sites depends on this, or the persisted report is judged stale forever.
    const hash = responseHash(responses, resolution.diagnosis.methodology_version)

    // ONE label source per request, threaded to BOTH the resolver and the document props. The
    // fail-closed guard in render.ts checks the sections against exactly this list; a second,
    // separately-computed label source that could disagree is the labelSource finding class.
    const labelSource = knownLabels(responses)

    const { sections, stale, cover } = await resolveReportSections({
      diagnosis: resolution.diagnosis,
      methodology: reportMethodology,
      responses,
      church: churchFactsFrom(churchProfile, church.name),
      completedAt: run!.completed_at,
      labelSource,
      responseHash: hash,
      reflections, // the KEYLESS array
      hashReflections: reflectionRowsFor(rawResponses ?? []), // the KEYED array
      audience: 'pdf', // this surface is private — respondents' verbatim reflections render here
      readPersisted: (inputsHash) => readPersistedReport(supabase, runId, inputsHash),
    })

    const brand = resolveBrand(church.name)
    const generatedAt = new Date()

    const buffer = await renderReportDocument({
      sections,
      churchName: church.name,
      brandColor: church.brand_color,
      monogram: brand.monogram,
      generatedAt,
      labels: labelSource.kind === 'known' ? labelSource.labels : [],
      stale,
      cover,
    })

    const filename = `xpg-diagnosis-${slugify(church.name)}-${generatedAt.toISOString().slice(0, 10)}.pdf`

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    // Reason only — never the Diagnosis, the blocks, or respondent data.
    console.warn('[m5c] PDF render failed:', err instanceof Error ? err.message : 'unknown error')
    return new Response('Could not generate the PDF', { status: 500 })
  }
}
