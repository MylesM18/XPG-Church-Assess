import { composeSection, SECTION_REGISTRY, AI_SECTION_IDS, type AiSectionId } from '../ai/sections';
import { gateSection, correctiveInstruction, sliceCategoryIds, resolveRequiredMention, type GateFailure } from '../ai/section-gates';
import { fallbackSections, type FallbackSectionArgs, type SectionBody } from './fallback-sections';
import type { FactsPack } from './facts';
import type { Methodology, RequiredMention, SectionId } from '../methodology/schema';
import { statGridModel, rankListModel, verdictBlockModel, type ChartModel } from './charts';

export type { SectionId } from '../methodology/schema';

/**
 * Both halves of the composer. Generation (composeReport) runs once per church behind
 * generateDiagnosis; assembly (assembleReport) runs per request on every render surface.
 *
 * NEITHER THROWS. Generation resolves every failure to that section's fallback; assembly
 * resolves a stale, absent or malformed persisted section the same way. A report always
 * renders complete.
 */

export type SectionSource = 'ai' | 'fallback';

export interface ComposedReport {
  sections: Partial<Record<AiSectionId, unknown>>; // AI output only — persisted
  section_sources: Record<SectionId, SectionSource>; // every section, C3
}

/**
 * One line that makes "the model is off" distinguishable from "the model ran". Before this,
 * a 100% fallback report and a fully composed one produced identical logs, and a fallback-only
 * PDF was mistaken for composed prose (spec §0). Ids and counts only — never a score, a church
 * name, or any section text.
 */
export function summariseSectionSources(sources: Record<SectionId, SectionSource>): string {
  const entries = Object.entries(sources) as Array<[SectionId, SectionSource]>;
  const fellBack = entries.filter(([, source]) => source === 'fallback').map(([id]) => id);
  const aiCount = entries.length - fellBack.length;
  return `ai ${aiCount}/${entries.length} · fallback: ${fellBack.length > 0 ? fellBack.join(', ') : 'none'}`;
}

export async function composeReport(args: {
  facts: FactsPack;
  methodology: Methodology;
  labels: readonly string[];
}): Promise<ComposedReport> {
  const { facts, methodology, labels } = args;
  const ctx = { facts, methodology, labels };
  const sections: Partial<Record<AiSectionId, unknown>> = {};

  /** `failure: null` on a call/parse failure — no gate ran, so there is nothing to correct. */
  type AttemptResult = { ok: true } | { ok: false; failure: GateFailure | null };

  const attempt = async (id: AiSectionId, corrective?: string | null): Promise<AttemptResult> => {
    const parsed = await composeSection(id, facts, methodology, corrective); // never throws → null
    if (parsed === null) return { ok: false, failure: null };
    const failure = gateSection(id, parsed, ctx);
    if (failure !== null) {
      // detail is omitted when empty so a reasonless family does not log a bare "()".
      console.warn(`[report] section ${id}: ${failure.family}${failure.detail ? ` (${failure.detail})` : ''}`);
      return { ok: false, failure };
    }
    sections[id] = parsed;
    return { ok: true };
  };

  // Promise.allSettled, not Promise.all: one rejection must not cancel six good sections. The
  // per-section functions already never throw, so this is belt and braces at a boundary where
  // the cost of being wrong is the whole report.
  const first = await Promise.allSettled(
    AI_SECTION_IDS.map((id) => attempt(id).then((result) => ({ id, result }))),
  );

  // Carry each failure forward so the re-attempt can correct it instead of re-rolling into the
  // same wall (spec §4.3). A settled-but-rejected promise has no failure to carry: treat it as
  // a call failure, which is what it is.
  const failed = first
    .map((r, i) => {
      const id = AI_SECTION_IDS[i]!;
      if (r.status !== 'fulfilled') return { id, failure: null };
      return r.value.result.ok ? null : { id, failure: r.value.result.failure };
    })
    .filter((x): x is { id: AiSectionId; failure: GateFailure | null } => x !== null);

  // ONE re-attempt of only the failed sections (C2). Gate failures are retried alongside call
  // failures: the model is nondeterministic, so a re-roll is a genuine fix.
  //
  // COST, stated deliberately: these are APP-level rounds, and each one is separately multiplied
  // by the SDK's own `maxRetries: 1` (sections.ts:192). Worst case is therefore 2 rounds x 2 SDK
  // attempts = 4 live calls per section, 28 per report — up from 2/14 before this branch. The
  // SDK retry is insurance with no observed claim: across the measured runs (54/54, then 65/65
  // bar a single transport abort) every call that was made returned parsed output. It is kept
  // because the alternative failure — a transient blip pinning a section to fallback with no
  // regenerate path — is permanent: generateDiagnosis is effectively one-shot per church
  // (save_diagnosis completes the run and get_run_responses filters in_progress —
  // actions.ts:135). Any change that adds calls per section (e.g. one call per category) must be
  // costed against this 4x, not against 1x.
  if (failed.length > 0) {
    await Promise.allSettled(
      failed.map(({ id, failure }) => {
        const corrective = failure
          ? correctiveInstruction(failure, {
              lengthCeiling: methodology.report.sections[id].length_ceiling,
              categoryIds: sliceCategoryIds(id, facts),
              // The gate reports the KEY (§4.1 carries reasons, never values), so the value is
              // resolved back here through the same function gate 3 judged against. The cast is
              // sound because every `required mention` failure is raised with a RequiredMention;
              // were that ever untrue the lookup yields undefined and the corrective falls back
              // to naming the key, which is exactly the old behaviour.
              requiredValue:
                failure.family === 'required mention'
                  ? resolveRequiredMention(failure.detail as RequiredMention, facts)
                  : undefined,
            })
          : null;
        return attempt(id, corrective);
      }),
    );
  }

  const section_sources = Object.fromEntries(
    (Object.keys(methodology.report.sections) as SectionId[]).map((id) => [
      id,
      (AI_SECTION_IDS as readonly string[]).includes(id) && sections[id as AiSectionId] !== undefined
        ? 'ai'
        : 'fallback',
    ]),
  ) as Record<SectionId, SectionSource>;

  console.info(`[report] section_sources: ${summariseSectionSources(section_sources)}`);

  return { sections, section_sources };
}

/**
 * I9: a persisted report whose every section fell back is not a usable cache hit —
 * treating it as one pins that report to 100% fallback forever, with no regenerate
 * path. Re-running generation lets it self-heal.
 */
export function isUsableCachedReport(sectionSources: unknown): boolean {
  if (Array.isArray(sectionSources)) return sectionSources.includes('ai');
  if (sectionSources && typeof sectionSources === 'object') {
    return Object.values(sectionSources).includes('ai');
  }
  return false;
}

export interface AssembledSection {
  id: SectionId;
  source: SectionSource;
  ai: unknown | null;
  fallback: SectionBody;
  /** Derived chart geometry (lib/report/charts.ts). Usually empty. Never source-dependent. */
  charts: ChartModel[];
}

/**
 * Which charts a section carries. `charts`, not a single `chart`, because s3 needs two (the tier
 * gauge over the overall capacity, then the eight area bars). An empty array is the common case.
 *
 * Called by BOTH assemblers, so the public share page — permanently fallback-only by design —
 * gets the identical models the authenticated page does. Charts deliberately never read
 * `section.source`: they are the one part of the report that cannot degrade when the model is
 * unavailable, which is the whole reason s3 stayed out of AI_SECTION_IDS (spec §3).
 */
export function chartsForSection(
  id: SectionId,
  facts: FactsPack,
  methodology: Methodology,
): ChartModel[] {
  if (id === 's3') return [verdictBlockModel(facts, methodology), statGridModel(facts, methodology)];
  if (id === 's7') {
    const model = rankListModel(facts);
    return model ? [model] : [];
  }
  return [];
}

/**
 * The share page needs the same AssembledSection[] shape as assembleReport without touching
 * the composer's AI path — no persisted row, no hash, no model output. Mapping over the same
 * Object.keys(methodology.report.sections) order keeps section order owned by one place
 * instead of two.
 */
export function assembleFallbackOnly(args: FallbackSectionArgs): AssembledSection[] {
  const fallbacks = fallbackSections(args);
  return (Object.keys(args.methodology.report.sections) as SectionId[]).map((id) => {
    const fallback = fallbacks[id];
    const charts = chartsForSection(id, args.facts, args.methodology);
    return { id, source: 'fallback' as const, ai: null, fallback, charts };
  });
}

export function assembleReport(args: {
  facts: FactsPack;
  methodology: Methodology;
  reflections: ReadonlyArray<{ item_id: string; reflection: string | null }>;
  persisted: { inputs_hash: string; sections: unknown } | null;
  liveInputsHash: string;
}): AssembledSection[] {
  const fallbacks = fallbackSections({ facts: args.facts, methodology: args.methodology, reflections: args.reflections });
  // A stale or absent hash means fallback, never a stale AI section. Deterministic sections are
  // always computed live, exactly as fallbackProse is today.
  const fresh = args.persisted !== null && args.persisted.inputs_hash === args.liveInputsHash;
  const stored =
    fresh && args.persisted && typeof args.persisted.sections === 'object' && args.persisted.sections !== null
      ? (args.persisted.sections as Record<string, unknown>)
      : {};

  return (Object.keys(args.methodology.report.sections) as SectionId[]).map((id) => {
    const fallback = fallbacks[id];
    const charts = chartsForSection(id, args.facts, args.methodology);
    if (!(AI_SECTION_IDS as readonly string[]).includes(id)) return { id, source: 'fallback' as const, ai: null, fallback, charts };
    const raw = stored[id];
    if (raw === undefined) return { id, source: 'fallback' as const, ai: null, fallback, charts };
    // Re-validate. A reports row outlives the code that wrote it and `sections` is untyped
    // jsonb, so a shape mismatch is this section's fallback, never a crash.
    const check = SECTION_REGISTRY[id as AiSectionId].schema.safeParse(raw);
    return check.success
      ? { id, source: 'ai' as const, ai: check.data, fallback, charts }
      : { id, source: 'fallback' as const, ai: null, fallback, charts };
  });
}
