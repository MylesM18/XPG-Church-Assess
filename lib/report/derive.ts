import type { Methodology } from '../methodology/schema';
import type { Response, Diagnosis, Context } from '../engine/types';
import { normalize } from '../engine/normalize';
import { assemble } from '../engine/assemble';
import { diagnosisGate } from '../coverage/diagnosis-gate';
import { isKnownBand } from '../engine/benchmark';
import { effectiveMethodologyForRun } from '../methodology/effective';

/**
 * The outcome of re-deriving a Diagnosis from a run's stored RESPONSES under the methodology
 * edition that run was actually taken against (CT-2(c), spec §5.4). The three report surfaces
 * call this at render time instead of trusting the cached `diagnoses.payload`, which may have
 * been scored under an older methodology. Score identity holds for free: the engine is
 * deterministic on (responses, methodology, ctx), so for a run on the current edition the ok-path
 * is byte-identical to diagnose().
 *
 * `effectiveMethodology` is the edition the scoring actually used — the same reference that was
 * passed in for a current-edition run, or the item-filtered, `0.2.0`-stamped clone for a run that
 * predates the outreach questions. Every caller must render the report FROM it (prose, view,
 * appendix): the diagnosis it accompanies is stamped with ITS version, so handing a report
 * surface the current methodology instead would make the two disagree and fire the
 * stale-methodology branch on every legacy report.
 *
 * The two failure arms mirror generateDiagnosis's own pre-flight checks (app/app/[churchId]/
 * actions.ts): a run can be un-scoreable either because some area has no fully-covered
 * respondent (`incomplete_areas`, carrying the blocked area ids) or because the church's
 * attendance band is not a benchmark key (`unknown_band`) — assemble()→benchmarkFor() throws on
 * an unknown band, so the guard must run before it, exactly as actions.ts does.
 */
export type DeriveResult =
  | { ok: true; diagnosis: Diagnosis; effectiveMethodology: Methodology }
  | { ok: false; reason: 'incomplete_areas'; blockedAreas: string[] }
  | { ok: false; reason: 'unknown_band' };

/**
 * effective edition → normalize → gate → band guard → assemble, the SAME sequence
 * generateDiagnosis runs (actions.ts). `runMethodologyVersion` is `assessment_runs
 * .methodology_version` — null for any run created before the column was stamped — and it is
 * REQUIRED, so no caller can silently score an old run against questions it was never asked.
 *
 * effectiveMethodologyForRun (lib/methodology/effective.ts) resolves it once, and that ONE object
 * is then used for all four steps: gating a pre-0.3.0 run on outreach items nobody could have
 * answered would block every such report forever, and assembling against it would stamp the wrong
 * version. normalize() is called once and shared with both the gate and assemble(), so the gate
 * and the diagnosis can never disagree about what "complete" means — and the assemble() call here
 * is identical to diagnose()'s (lib/engine/index.ts), which is what makes the ok-path deep-equal
 * diagnose(responses, effectiveMethodology, ctx).
 */
export function deriveDiagnosisForRun(
  responses: Response[],
  methodology: Methodology,
  ctx: Context,
  runMethodologyVersion: string | null,
): DeriveResult {
  const effective = effectiveMethodologyForRun(methodology, runMethodologyVersion);

  const normalized = normalize(responses, effective);

  const gate = diagnosisGate(normalized, effective.questions.categories);
  if (!gate.ok) {
    return { ok: false, reason: 'incomplete_areas', blockedAreas: gate.blockedAreas };
  }

  if (!isKnownBand(effective, ctx.attendance_band)) {
    return { ok: false, reason: 'unknown_band' };
  }

  return {
    ok: true,
    diagnosis: assemble(normalized, effective, ctx),
    effectiveMethodology: effective,
  };
}
