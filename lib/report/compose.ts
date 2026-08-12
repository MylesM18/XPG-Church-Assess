import { composeSection, SECTION_REGISTRY, AI_SECTION_IDS, type AiSectionId } from '../ai/sections';
import { gateSection } from '../ai/section-gates';
import { fallbackSections, type SectionBody } from './fallback-sections';
import type { FactsPack } from './facts';
import type { Methodology, SectionId } from '../methodology/schema';

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

export async function composeReport(args: {
  facts: FactsPack;
  methodology: Methodology;
  labels: readonly string[];
}): Promise<ComposedReport> {
  const { facts, methodology, labels } = args;
  const ctx = { facts, methodology, labels };
  const sections: Partial<Record<AiSectionId, unknown>> = {};

  const attempt = async (id: AiSectionId): Promise<boolean> => {
    const parsed = await composeSection(id, facts, methodology); // never throws → null on failure
    if (parsed === null) return false;
    const reason = gateSection(id, parsed, ctx);
    if (reason !== null) {
      console.warn(`[report] section ${id}: ${reason}`);
      return false;
    }
    sections[id] = parsed;
    return true;
  };

  // Promise.allSettled, not Promise.all: one rejection must not cancel six good sections. The
  // per-section functions already never throw, so this is belt and braces at a boundary where
  // the cost of being wrong is the whole report.
  const first = await Promise.allSettled(AI_SECTION_IDS.map((id) => attempt(id).then((ok) => ({ id, ok }))));
  const failed = first
    .map((r, i) => (r.status === 'fulfilled' && r.value.ok ? null : AI_SECTION_IDS[i]!))
    .filter((id): id is AiSectionId => id !== null);

  // ONE re-attempt of only the failed sections (C2). Gate failures are retried alongside call
  // failures: the model is nondeterministic, so a re-roll is a genuine fix. Worst case 2x calls,
  // typical case 1x. generateDiagnosis is effectively one-shot per church (save_diagnosis
  // completes the run and get_run_responses filters in_progress — actions.ts:135), so this
  // bounded retry is the only defence against a transient blip pinning a section to fallback
  // permanently.
  if (failed.length > 0) await Promise.allSettled(failed.map((id) => attempt(id)));

  const section_sources = Object.fromEntries(
    (Object.keys(methodology.report.sections) as SectionId[]).map((id) => [
      id,
      (AI_SECTION_IDS as readonly string[]).includes(id) && sections[id as AiSectionId] !== undefined
        ? 'ai'
        : 'fallback',
    ]),
  ) as Record<SectionId, SectionSource>;

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
    if (!(AI_SECTION_IDS as readonly string[]).includes(id)) return { id, source: 'fallback' as const, ai: null, fallback };
    const raw = stored[id];
    if (raw === undefined) return { id, source: 'fallback' as const, ai: null, fallback };
    // Re-validate. A reports row outlives the code that wrote it and `sections` is untyped
    // jsonb, so a shape mismatch is this section's fallback, never a crash.
    const check = SECTION_REGISTRY[id as AiSectionId].schema.safeParse(raw);
    return check.success
      ? { id, source: 'ai' as const, ai: check.data, fallback }
      : { id, source: 'fallback' as const, ai: null, fallback };
  });
}
