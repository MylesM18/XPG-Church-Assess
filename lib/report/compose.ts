import { composeSection, SECTION_REGISTRY, AI_SECTION_IDS, FAN_OUT, unitCeiling, type AiSectionId } from '../ai/sections';
import { gateSection, correctiveInstruction, sliceCategoryIds, resolveRequiredMention, type GateFailure, type GateUnit } from '../ai/section-gates';
import type { ReportAudience } from './view';
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

  /**
   * One model call. `key` is null for an unfanned section and the category id for a fanned one
   * (design §3.6). A fanned section contributes one CallUnit per key, in `keys` order — which is
   * `f.categories.slice(3)` order — so the merged areas come back in slice order for free.
   */
  type CallUnit = { id: AiSectionId; key: string | null };

  const units: CallUnit[] = AI_SECTION_IDS.flatMap((id) => {
    const fan = FAN_OUT[id];
    return fan
      ? fan.keys(facts).map((key) => ({ id, key }))
      : [{ id, key: null } as CallUnit];
  });

  /** The unit's narrowed view for the gates, or undefined for an unfanned section. */
  const gateUnitFor = ({ id, key }: CallUnit): GateUnit | undefined => {
    const fan = FAN_OUT[id];
    if (!fan || key === null) return undefined;
    return {
      slice: fan.slice(facts, key),
      lengthCeiling: unitCeiling(methodology.report.sections[id].length_ceiling, fan.keys(facts).length),
    };
  };

  /** Indexed by position in `units`; undefined means that unit has not passed. */
  const results: Array<unknown | undefined> = new Array(units.length);

  /** `failure: null` on a call/parse failure — no gate ran, so there is nothing to correct. */
  type AttemptResult = { ok: true } | { ok: false; failure: GateFailure | null };

  const attempt = async (index: number, corrective?: string | null): Promise<AttemptResult> => {
    const unit = units[index]!;
    const { id, key } = unit;
    const gateUnit = gateUnitFor(unit);
    const parsed = await composeSection(id, facts, methodology, corrective, key ?? undefined); // never throws → null
    if (parsed === null) return { ok: false, failure: null };
    const failure = gateSection(id, parsed, ctx, gateUnit);
    if (failure !== null) {
      // The unit is named so a fanned section's five calls stay distinguishable in the log. A
      // category id is facts-derived, not model output — gate 1b's `missing:` detail already
      // carries them — so this does not widen the §4.1 boundary. `detail` is omitted when empty
      // so a reasonless family does not log a bare "()".
      const where = key === null ? id : `${id} unit ${key}`;
      console.warn(`[report] section ${where}: ${failure.family}${failure.detail ? ` (${failure.detail})` : ''}`);
      return { ok: false, failure };
    }
    results[index] = parsed;
    return { ok: true };
  };

  // Promise.allSettled, not Promise.all: one rejection must not cancel ten good units. The
  // per-call functions already never throw, so this is belt and braces at a boundary where the
  // cost of being wrong is the whole report.
  const first = await Promise.allSettled(
    units.map((_, index) => attempt(index).then((result) => ({ index, result }))),
  );

  // Carry each failure forward so the re-attempt can correct it instead of re-rolling into the
  // same wall (spec §4.3). A settled-but-rejected promise has no failure to carry: treat it as
  // a call failure, which is what it is.
  const failed = first
    .map((r, i) => {
      if (r.status !== 'fulfilled') return { index: i, failure: null };
      return r.value.result.ok ? null : { index: i, failure: r.value.result.failure };
    })
    .filter((x): x is { index: number; failure: GateFailure | null } => x !== null);

  // ONE re-attempt of only the failed UNITS (C2). A failing unit retries ALONE; its siblings are
  // not re-called. Gate failures are retried alongside call failures: the model is
  // nondeterministic, so a re-roll is a genuine fix.
  //
  // COST, stated deliberately and re-costed for the s6 fan-out (design §4). These are APP-level
  // rounds, each separately multiplied by the SDK's own `maxRetries: 1` (sections.ts:192), so
  // worst case is 2 rounds x 2 SDK attempts = 4 live calls per UNIT. With s6 fanned to five
  // units the report's worst case is 6 x 4 + 5 x 4 = 44, up from 28 — 1.57x, and the reason s6
  // is the only entry in FAN_OUT. The realistic ceiling is nearer 22: the SDK retry has no
  // observed claim across the measured runs (54/54, then 65/65 bar a single transport abort).
  // Latency moves the OTHER way — five small parallel calls replace two large serial ones — at
  // the cost of round-1 concurrency rising 7 -> 11. The SDK retry is kept because the
  // alternative failure — a transient blip pinning a section to fallback with no regenerate
  // path — otherwise costs a full regeneration to fix. Under ADR 0003, Generate is repeatable
  // (the admin can Regenerate at a changed answer set), so each Generate at a changed answer
  // set is a fresh full run: any FURTHER change that adds calls per section multiplies real
  // spend on every regeneration, and must be costed against this 4x, not against 1x.
  if (failed.length > 0) {
    await Promise.allSettled(
      failed.map(({ index, failure }) => {
        const unit = units[index]!;
        const gateUnit = gateUnitFor(unit);
        const corrective = failure
          ? correctiveInstruction(failure, {
              // The UNIT's ceiling when the call was fanned, or the gate would name 6000 while
              // measuring against 1200.
              lengthCeiling: gateUnit
                ? gateUnit.lengthCeiling
                : methodology.report.sections[unit.id].length_ceiling,
              categoryIds: sliceCategoryIds(unit.id, facts, gateUnit),
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
        return attempt(index, corrective);
      }),
    );
  }

  // Assembly. A fanned section is stored ONLY if every one of its units passed (design §3.7):
  // both renderers are `S6Schema.safeParse(ai)` -> all areas or AiFallback, there is no partial
  // concept anywhere in the render path, and a 3-of-5 s6 would contradict the completeness rule
  // at section-gates.ts:150-159 this branch deliberately hardened.
  for (const id of AI_SECTION_IDS) {
    const indices = units.flatMap((u, i) => (u.id === id ? [i] : []));
    const fan = FAN_OUT[id];
    // Fail closed on a fanned section with no units at all: `every unit passed` would be
    // vacuously true and merge([]) yields an empty array, which S6Schema accepts — an empty
    // section persisted as 'ai', rendering nothing, with gate 1b's `empty` check never reached
    // because no call was ever made.
    if (indices.length === 0) continue;
    if (indices.some((i) => results[i] === undefined)) continue;
    const parts = indices.map((i) => results[i]!);
    sections[id] = fan ? fan.merge(parts) : parts[0];
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
  if (id === 's3') return [verdictBlockModel(facts), statGridModel(facts, methodology)];
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
  /** REQUIRED here, unlike on FallbackSectionArgs: this function builds its OWN literal for
   *  fallbackSections below rather than forwarding a FallbackSectionArgs, so an optional field
   *  would be dropped silently on every call. Making it required means tsc names the drop. */
  audience: ReportAudience;
}): AssembledSection[] {
  // ⚠️ Threaded EXPLICITLY. This literal is not `args` — a field added to FallbackSectionArgs
  // does not arrive here on its own.
  const fallbacks = fallbackSections({
    facts: args.facts,
    methodology: args.methodology,
    reflections: args.reflections,
    audience: args.audience,
  });
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
