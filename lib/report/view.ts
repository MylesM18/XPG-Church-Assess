import type { Diagnosis, DiagnosisCategory, DisagreementFlag, EvidenceRef } from '../engine/types';
import type { CorrelationAnnotation } from '../engine/correlation';
import type { ReportBlocks } from '../ai/fallback';
import type { Methodology } from '../methodology/schema';
import type { DeriveResult } from './derive';
import { chainWalk, type StageView } from './chain-walk';

export type ReportAudience = 'screen' | 'pdf' | 'shared';

export interface CoverView {
  throughput: number;
  capacity: number;
  gap: number;
  constraintName: string | null;
  gatedBy: Array<{ name: string; score: number }>;
}

/**
 * One reflection-prompted item's unattributed free-text "voices on outreach" for a single
 * dossier area. itemId/reflectionPrompt let Tasks 15-17 render which prompt each entry
 * answered; entries is the trimmed, non-empty, deterministically-sorted respondent text —
 * never attributed to a respondent (the same anonymity discipline the rest of this file's
 * dispersion/disagreement fields already follow).
 */
export interface OutreachVoicesGroup {
  itemId: string;
  reflectionPrompt: string;
  entries: string[];
}

export interface AreaDossierView {
  category_id: string;
  name: string;
  score: number;
  n: number;
  reading: string;
  readingLabel: string;
  insideIt: string | null;
  agreement: string | null;
  position: string | null;
  dependsOn: string[];
  watchFor: string | null;
  // Present only when this area has at least one non-empty voice AND buildReportView's
  // audience gate let them through (never 'shared') — absent, not an empty array, when there
  // is nothing to show, so renderers can branch on simple presence.
  outreachVoices?: OutreachVoicesGroup[];
}

export interface SystemView {
  dependencies: Array<{
    from: string; to: string; kind: string; statement: string;
    read: string; fromName: string; toName: string;
    fromScore: number; toScore: number;
    // Pre-interpolated read sentence (spec §6.1). Built in buildSystem from
    // methodology.copy.dependency_reads so the two report surfaces (system.tsx,
    // pdf/document.tsx) render one string and cannot drift — the byte-for-byte
    // duplication their comments used to lament is gone.
    readSentence: string;
  }>;
  correlations: CorrelationAnnotation[];
  calibrationSpread: number;
  calibrationText: string; // the rendered sentence — Calibration({ spread, text }) needs it,
                           // and Task 17 can only prove "no names on any surface" if it is here
  disagreement?: { text: string; respondents: Array<{ label: string; mean: number }> };
  gating?: string;
}

export interface ReportView {
  verdict: string;
  throughput: number;
  capacity: number;
  gap: number;
  confidence: number;
  stages: StageView[];
  evidence?: { text: string; refs: EvidenceRef[] };
  cost?: { cost: string; doNotWorkOn?: string };
  gating?: string;
  dispersion?: { text: string; respondents: Array<{ label: string; mean: number }> };
  nextStep?: { callType: string; hook: string; text: string };
  appendix: { categories: Array<DiagnosisCategory & { name: string }>; benchmarkNote: string; dependencyNote: string };
  cover: CoverView;
  areas: AreaDossierView[];
  system: SystemView;
}

/**
 * {token} substitution, identical contract to lib/ai/fallback.ts's private `interp`
 * (missing keys are left as the literal token — fail-open, never throws). Kept as
 * its own copy rather than importing fallback.ts's: that module's export surface is
 * the AI-prose draft/reword pipeline, and the dossier layer reading from it would
 * couple two things that change for different reasons.
 */
function interp(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? vars[k]! : `{${k}}`));
}

const ENABLER_BELIEF_ONLY_IDS = new Set(['gov', 'comm', 'sys']);

type ReadingBand = 'severe' | 'broken' | 'watch' | 'holding';

/**
 * Reading band from score + state (spec §7.2 table). `state` is 'broken' (stage)
 * or 'gate' (enabler) for every "not holding" category — thresholds.severe splits
 * that single state into the finer severe/broken bands the copy needs. 'watch'
 * and 'ok' pass straight through to 'watch'/'holding'.
 */
function readingBand(state: DiagnosisCategory['state'], score: number, severeThreshold: number): ReadingBand {
  if (state === 'broken' || state === 'gate') return score < severeThreshold ? 'severe' : 'broken';
  if (state === 'watch') return 'watch';
  return 'holding';
}

/** Short, capitalized label for the Layer 1 AreaTable "Band" column — the SAME
 *  state-aware reading band the dossier prose uses (spec §7 Layer 1/3), so the cover
 *  table and each dossier can never disagree. Replaces the former score-only scoreBand()
 *  that cover.tsx and pdf/document.tsx each duplicated (finding #5, Natalie: align). */
const READING_BAND_LABEL: Record<ReadingBand, string> = {
  severe: 'Severe',
  broken: 'Broken',
  watch: 'Watch',
  holding: 'Strong',
};

/** Largest-magnitude question effect, rendered as "{item_id} sits {n} pts {below|above} the rest".
 *  Data-driven, not XPG voice — spec §7.2's own example ("D3 sits 18 pts below the rest"). */
function insideItFor(n: number, questionEffects: Array<{ item_id: string; effect: number }>): string | null {
  if (n === 0 || questionEffects.length === 0) return null;
  const largest = questionEffects.reduce((max, cur) => (Math.abs(cur.effect) > Math.abs(max.effect) ? cur : max));
  const pts = Math.round(Math.abs(largest.effect) * 10);
  const direction = largest.effect < 0 ? 'below' : 'above';
  return `${largest.item_id} sits ${pts} pts ${direction} the rest`;
}

/** Residual spread after rater style is removed (spec §4.2/§7.2): tight when no
 *  disagreement flag fired for this area, split (with the measured spread) when
 *  one did. Needs n >= 2 — a single respondent has no spread to measure. */
function agreementFor(
  n: number,
  flag: DisagreementFlag | undefined,
  methodology: Methodology,
): string | null {
  if (n < 2) return null;
  return flag
    ? interp(methodology.copy.dossier.agreement.split, { spread: String(flag.spread) })
    : methodology.copy.dossier.agreement.tight;
}

function positionFor(cohortPercentile: number | null): string | null {
  return cohortPercentile === null ? null : `p${cohortPercentile} of the benchmark prior`;
}

/** Every authored dependency edge touching this area, as one short phrase per
 *  edge (spec §7.2: "Systems (74) gates this · feeds Volunteers (48)"). The
 *  renderer joins the array; this only produces the pieces. */
function dependsOnFor(
  categoryId: string,
  dependencies: Diagnosis['dependencies'],
  names: Map<string, string>,
): string[] {
  const out: string[] = [];
  for (const e of dependencies) {
    const verb = e.kind === 'gate' ? 'gates' : 'feeds';
    if (e.to === categoryId) {
      out.push(`${names.get(e.from) ?? e.from} (${e.fromScore}) ${verb} this`);
    } else if (e.from === categoryId) {
      out.push(`${verb} ${names.get(e.to) ?? e.to} (${e.toScore})`);
    }
  }
  return out;
}

/**
 * Priority order (spec §7.2/§7.3, brief line 224): the blind-spot gap for this
 * area, THEN the enabler belief-only limit (gov/comm/sys), THEN the generosity
 * mode note (gen), THEN null. All three sentence sources are copy.yaml lookups
 * (or the existing blocks.blind_spot template, reused per-area) — none invented
 * in TypeScript. gov/comm/sys structurally never reach the first branch (no
 * evidence items in the methodology, so a blind spot is impossible there), but
 * the ORDER still matters as the function's contract, not just its output on
 * today's data — see tests/report/view.test.ts's forced-blind-spot coverage.
 */
function watchForFor(
  categoryId: string,
  d: Diagnosis,
  methodology: Methodology,
  names: Map<string, string>,
): string | null {
  const bs = d.blind_spots.find((b) => b.category_id === categoryId);
  if (bs) {
    return interp(methodology.copy.blocks.blind_spot!, {
      bs_name: names.get(categoryId) ?? categoryId,
      bs_belief: String(bs.belief),
      bs_evidence: String(bs.evidence),
      bs_gap: String(bs.gap),
    });
  }
  if (ENABLER_BELIEF_ONLY_IDS.has(categoryId)) {
    return methodology.copy.dossier.enabler_belief_only;
  }
  if (categoryId === 'gen') {
    return d.generosity_mode ? methodology.copy.dossier.generosity[d.generosity_mode] : null;
  }
  return null;
}

function buildCover(d: Diagnosis, methodology: Methodology): CoverView {
  const names = new Map(methodology.questions.categories.map((c) => [c.id, c.name]));
  const scores = new Map(d.categories.map((c) => [c.category_id, c.score]));
  const primaryId = d.primary_constraint?.category_id ?? null;

  return {
    throughput: d.throughput,
    capacity: d.capacity,
    gap: d.capacity - d.throughput,
    constraintName: primaryId ? (names.get(primaryId) ?? primaryId) : null,
    gatedBy: d.gating_conditions.map((g) => ({
      name: names.get(g.enabler_id) ?? g.enabler_id,
      score: scores.get(g.enabler_id) ?? 0,
    })),
  };
}

/**
 * Groups reflection free-text by the methodology item that prompted it, keyed by category_id
 * so buildAreas can attach a category's groups with one Map.get(). Pure: no I/O, no
 * randomness — same (methodology, reflections) always produces the same Map. A category with
 * no surviving group is simply absent from the Map, which is what leaves outreachVoices off
 * that area's AreaDossierView entirely (see buildAreas's conditional spread).
 *
 * Per item: `!item.reflection` skips any item the methodology doesn't prompt for a
 * reflection. Because this is checked against the METHODOLOGY handed in — the effective,
 * possibly-filtered edition a run was actually scored against (Task 13's
 * effectiveMethodologyForRun) — a pre-0.3.0 run's item list has no reflection-prompted items
 * at all, so it renders no voices even if orphaned reflection rows exist for an item id that
 * edition no longer carries.
 *
 * Per entry: trim with JS's full-Unicode `.trim()`, a strict superset of Postgres btrim's
 * ASCII-space-only default (Task 4's column CHECK doesn't trim at all; Task 5's RPC only
 * nullifies via `nullif(btrim(...), '')`, which leaves literal '\n\n' or '\t' untouched) —
 * then drop anything empty afterward, so neither slips through as a blank quote bubble. Sort
 * with a PLAIN lexicographic compare — never localeCompare, which is locale- and
 * ICU-version-dependent and would make report output non-deterministic across machines.
 */
function buildOutreachVoices(
  methodology: Methodology,
  reflections: Array<{ item_id: string; reflection: string | null }>,
): Map<string, OutreachVoicesGroup[]> {
  const byCategory = new Map<string, OutreachVoicesGroup[]>();
  for (const cat of methodology.questions.categories) {
    const groups: OutreachVoicesGroup[] = [];
    for (const item of cat.items) {
      if (!item.reflection) continue;
      const entries = reflections
        .filter((r) => r.item_id === item.id && r.reflection != null)
        .map((r) => (r.reflection as string).trim())
        .filter((t) => t.length > 0)
        // Plain lexicographic compare — deterministic across locales. Never localeCompare.
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      if (entries.length === 0) continue;
      groups.push({ itemId: item.id, reflectionPrompt: item.reflection, entries });
    }
    if (groups.length > 0) byCategory.set(cat.id, groups);
  }
  return byCategory;
}

/**
 * Iterates [...rules.chain, ...Object.keys(rules.enablers)] — never sorted by
 * score — so the eight dossiers land in the same fixed order on every report
 * and two assessments 90 days apart are directly comparable side by side (spec
 * §7 Layer 3). `kind` (stage vs enabler) is read off THIS LIST, not off the
 * matched category, so a category missing from `d.categories` still resolves
 * to a sensible fallback dossier instead of throwing — the same defensive
 * posture chain-walk.ts already takes on the identical chain-iteration shape.
 *
 * `voices` is buildOutreachVoices's output (or an empty Map when there is nothing to show,
 * per buildReportView's audience gate) — attached via a conditional spread so an area with no
 * voices carries no `outreachVoices` key at all, rather than one present-but-undefined.
 */
function buildAreas(
  d: Diagnosis,
  methodology: Methodology,
  voices: Map<string, OutreachVoicesGroup[]>,
): AreaDossierView[] {
  const { chain, enablers, thresholds } = methodology.rules;
  const ids = [...chain, ...Object.keys(enablers)];
  const chainSet = new Set(chain);
  const names = new Map(methodology.questions.categories.map((c) => [c.id, c.name]));
  const catById = new Map(d.categories.map((c) => [c.category_id, c]));
  const flagById = new Map(d.disagreement_flags.map((f) => [f.category_id, f]));

  return ids.map((categoryId) => {
    const cat = catById.get(categoryId);
    const kind: 'stage' | 'enabler' = chainSet.has(categoryId) ? 'stage' : 'enabler';
    const score = cat?.score ?? 0;
    const n = cat?.respondent_count ?? 0;
    const state = cat?.state ?? 'ok';
    const band = readingBand(state, score, thresholds.severe);
    const v = voices.get(categoryId);

    return {
      category_id: categoryId,
      name: names.get(categoryId) ?? categoryId,
      score,
      n,
      reading: methodology.copy.dossier.reading[kind][band]!,
      readingLabel: READING_BAND_LABEL[band],
      insideIt: insideItFor(n, cat?.questionEffects ?? []),
      agreement: agreementFor(n, flagById.get(categoryId), methodology),
      position: positionFor(cat?.cohort_percentile ?? null),
      dependsOn: dependsOnFor(categoryId, d.dependencies, names),
      watchFor: watchForFor(categoryId, d, methodology, names),
      ...(v ? { outreachVoices: v } : {}),
    };
  });
}

function buildSystem(
  d: Diagnosis,
  blocks: ReportBlocks,
  methodology: Methodology,
): SystemView {
  const names = new Map(methodology.questions.categories.map((c) => [c.id, c.name]));
  const flag = d.disagreement_flags[0];

  return {
    dependencies: d.dependencies.map((e) => ({
      from: e.from,
      to: e.to,
      kind: e.kind,
      statement: e.statement,
      read: e.read,
      fromName: names.get(e.from) ?? e.from,
      toName: names.get(e.to) ?? e.to,
      fromScore: e.fromScore,
      toScore: e.toScore,
      readSentence: interp(methodology.copy.dependency_reads[e.read], {
        fromName: names.get(e.from) ?? e.from,
        toName: names.get(e.to) ?? e.to,
      }),
    })),
    correlations: d.correlations,
    calibrationSpread: d.calibration.spread,
    calibrationText: interp(methodology.copy.dossier.calibration_spread, {
      spread: String(d.calibration.spread),
    }),
    disagreement: flag
      ? {
          text: interp(methodology.copy.inserts.dispersion!, {
            disp_name: names.get(flag.category_id) ?? flag.category_id,
            disp_spread: String(flag.spread),
          }),
          respondents: [],
        }
      : undefined,
    // Layer 2's "GatingFlags kept" (spec §7 table) — same source as the
    // existing top-level `gating` field below, just also reachable from `system`.
    gating: blocks.gating,
  };
}

/**
 * Resolves everything both report surfaces need, once. The page and the PDF
 * document consume this so section content and ordering cannot drift apart;
 * only layout primitives differ between them.
 *
 * dispersion.respondents and system.disagreement.respondents are now emptied for EVERY
 * audience, screen included: the per-person name-to-score list is never shown on any surface
 * (respondent anonymity — spec 2026-07-29-report-anonymity-design). The fields stay
 * present-but-empty so the disagreement narrative still renders; buildSystem no longer varies
 * by audience and takes no `opts`.
 *
 * audience 'shared' additionally drops nextStep: the CTA is an admin action, and
 * a board member reading a forwarded link cannot take it.
 *
 * cover/areas/system are the Layer 1/2/3 additions (spec §7.4): eight area
 * dossiers in fixed chain-then-enabler order, never sorted by score. Names never
 * reach system.calibrationText or any dossier field — every sentence is built
 * from copy.yaml templates plus scores/ids, the same discipline Task 17 audits.
 *
 * opts.reflections is optional and, when given, is grouped into each area's outreachVoices
 * via buildOutreachVoices — but ONLY for a non-'shared' audience. Private free-text is already
 * excluded from the public share surface at three other independent layers (the SQL:
 * get_shared_run_responses never selects reflection; the row type: SharedRunResponseRow has no
 * reflection field; the caller: app/r/[shareToken]/page.tsx never threads a `reflections` array
 * into opts for this audience) — this audience check is a fourth, belt-and-braces layer on top
 * of all three, not a simplification of them, so 'shared' gets zero voices even if a caller
 * somehow passes reflections anyway.
 */
export function buildReportView(
  d: Diagnosis,
  blocks: ReportBlocks,
  methodology: Methodology,
  opts: {
    audience: ReportAudience;
    reflections?: Array<{ item_id: string; reflection: string | null }>;
  },
): ReportView {
  const primaryId = d.primary_constraint?.category_id ?? null;

  const receipt = primaryId
    ? d.evidence_trail.find((r) => r.claim === `primary_constraint:${primaryId}`)
    : undefined;

  // Same resolution pattern chain-walk.ts uses, so the chain section and the
  // appendix never disagree on how a category_id is displayed.
  const names = new Map(methodology.questions.categories.map((c) => [c.id, c.name]));

  const voices =
    opts.audience !== 'shared' && opts.reflections
      ? buildOutreachVoices(methodology, opts.reflections)
      : new Map<string, OutreachVoicesGroup[]>();

  return {
    verdict: blocks.verdict,
    throughput: d.throughput,
    capacity: d.capacity,
    gap: d.gap,
    confidence: d.confidence,
    stages: chainWalk(d, methodology),

    evidence: blocks.evidence
      ? { text: blocks.evidence, refs: receipt?.refs ?? [] }
      : undefined,

    cost: blocks.cost
      ? { cost: blocks.cost, doNotWorkOn: blocks.do_not_work_on }
      : undefined,

    gating: blocks.gating,

    dispersion: blocks.dispersion
      ? {
          text: blocks.dispersion,
          respondents: [],
        }
      : undefined,

    nextStep:
      opts.audience === 'shared'
        ? undefined
        : { callType: d.offer.call_type, hook: d.offer.hook, text: blocks.next_step },
    appendix: {
      categories: d.categories.map((c) => ({ ...c, name: names.get(c.category_id) ?? c.category_id })),
      benchmarkNote: blocks.benchmark_note,
      dependencyNote: blocks.dependency_note,
    },

    cover: buildCover(d, methodology),
    areas: buildAreas(d, methodology, voices),
    system: buildSystem(d, blocks, methodology),
  };
}

export type ReportViewResolution =
  | { scoreable: false; reason: 'incomplete_areas' | 'unknown_band'; blockedAreas: string[] }
  | { scoreable: true; view: ReportView };

/**
 * The one place all three report surfaces (the authenticated diagnosis page, the public share
 * page, and the PDF route) turn a freshly RE-DERIVED Diagnosis into a renderable view — or, when
 * the run cannot be scored under the current methodology, into a graceful not-scoreable state
 * (spec §5.4, CT-2(c)).
 *
 * Every surface now re-derives the Diagnosis from the run's stored RESPONSES under the CURRENT
 * methodology (deriveDiagnosisForRun, lib/report/derive.ts) instead of trusting the cached
 * `diagnoses.payload`. Because the input is always freshly derived, methodology_version always
 * matches by construction and version-staleness can no longer occur — the old `{ stale: true }`
 * arm is repurposed to carry the two ways a re-derive can legitimately fail instead: some area
 * has no fully-covered respondent (`incomplete_areas`, carrying the blocked area ids) or the
 * church's attendance band is not a benchmark key (`unknown_band`).
 *
 * `blocks` is a lazy thunk, not a value, and is the ONLY path to fallbackProse / buildReportView.
 * It takes the fresh Diagnosis and is invoked at most once, only on the ok path — so a
 * not-scoreable derive can never reach fallbackProse either (it carries no diagnosis to hand the
 * thunk). tests/report/route-call-ordering.test.ts pins that every call site keeps this thunk
 * lazy; a caller resolving it eagerly, before this function, would reintroduce the CT-1 defect
 * this shape exists to make structurally impossible.
 */
export function resolveReportView(
  derived: DeriveResult,
  methodology: Methodology,
  blocks: (d: Diagnosis) => ReportBlocks,
  opts: {
    audience: ReportAudience;
    reflections?: Array<{ item_id: string; reflection: string | null }>;
  },
): ReportViewResolution {
  if (!derived.ok) {
    return {
      scoreable: false,
      reason: derived.reason,
      blockedAreas: derived.reason === 'incomplete_areas' ? derived.blockedAreas : [],
    };
  }
  return {
    scoreable: true,
    view: buildReportView(derived.diagnosis, blocks(derived.diagnosis), methodology, opts),
  };
}
