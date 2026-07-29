import type { Methodology } from '../methodology/schema';
import type { Response, Diagnosis, Context } from '../engine/types';
import { normalize } from '../engine/normalize';
import { assemble } from '../engine/assemble';
import { diagnosisGate } from '../coverage/diagnosis-gate';
import { isKnownBand } from '../engine/benchmark';

/**
 * The outcome of re-deriving a Diagnosis from a run's stored RESPONSES under the CURRENT
 * methodology (CT-2(c), spec §5.4). The three report surfaces call this at render time instead
 * of trusting the cached `diagnoses.payload`, which may have been scored under an older
 * methodology. Score identity holds for free: the engine is deterministic on
 * (responses, methodology, ctx), so the ok-path is byte-identical to diagnose().
 *
 * The two failure arms mirror generateDiagnosis's own pre-flight checks (app/app/[churchId]/
 * actions.ts): a run can be un-scoreable either because some area has no fully-covered
 * respondent (`incomplete_areas`, carrying the blocked area ids) or because the church's
 * attendance band is not a benchmark key (`unknown_band`) — assemble()→benchmarkFor() throws on
 * an unknown band, so the guard must run before it, exactly as actions.ts does.
 */
export type DeriveResult =
  | { ok: true; diagnosis: Diagnosis }
  | { ok: false; reason: 'incomplete_areas'; blockedAreas: string[] }
  | { ok: false; reason: 'unknown_band' };

/**
 * normalize → gate → band guard → assemble, the SAME sequence generateDiagnosis runs
 * (actions.ts:51-78). normalize() is called once and shared with both the gate and assemble(),
 * so the gate and the diagnosis can never disagree about what "complete" means — and the
 * assemble() call here is identical to diagnose()'s (lib/engine/index.ts), which is what makes
 * the ok-path deep-equal diagnose(responses, methodology, ctx).
 */
export function deriveDiagnosisForRun(
  responses: Response[],
  methodology: Methodology,
  ctx: Context,
): DeriveResult {
  const normalized = normalize(responses, methodology);

  const gate = diagnosisGate(normalized, methodology.questions.categories);
  if (!gate.ok) {
    return { ok: false, reason: 'incomplete_areas', blockedAreas: gate.blockedAreas };
  }

  if (!isKnownBand(methodology, ctx.attendance_band)) {
    return { ok: false, reason: 'unknown_band' };
  }

  return { ok: true, diagnosis: assemble(normalized, methodology, ctx) };
}
