import type { CategoryState } from '../engine/types';
import type { Methodology, Offer, SectionId } from '../methodology/schema';
import type { CategoryFact, FactsPack } from './facts';
import { buildOutreachVoices, interp, readingBand } from './view';

/**
 * The deterministic spine. Every one of the thirteen sections renders from the facts pack and
 * report.yaml alone — no model, no network, no throw. This is what makes an AI section failure
 * a local, invisible degradation rather than a broken report, and it is the ONLY renderer the
 * share page will ever reach (P5).
 *
 * Absorbs the old 10 blocks per the parent spec line 74:
 *   verdict → S2/S4 · evidence → S4/S7 · cost + do_not_work_on → S9/S10 (Constraint)
 *   next_step → S11 · gating → S6/S9 (Foundation) · dispersion → S6 area beat
 *   blind_spot → S6 "watch for" beat · benchmark_note + dependency_note → appendix
 */
export interface FallbackSectionArgs {
  facts: FactsPack;
  methodology: Methodology;
  reflections: ReadonlyArray<{ item_id: string; reflection: string | null }>;
}

export interface SectionBody {
  title: string;
  body: string;
  bullets: string[];
}

/** Settings-form labels for the 12 profile keys (app/app/[churchId]/settings/settings-form.tsx). */
const PROFILE_LABELS: Record<string, string> = {
  context: 'Context',
  attendance_band: 'Weekend attendance (required)',
  denomination: 'Denomination',
  adults_band: 'Adults',
  staff_fte_band: 'Staff (FTE)',
  budget_band: 'Annual budget',
  church_age_band: 'Church age',
  campuses_band: 'Campuses',
  growth_trajectory: 'Growth trajectory',
  facility_status: 'Facility',
  leadership_history: 'Leadership history',
  consultant_notes: 'Consultant notes',
};

type Phase = 'align' | 'build' | 'scale';
const PHASES: readonly Phase[] = ['align', 'build', 'scale'];
const DAY_LABELS: Record<Phase, string> = { align: '30 days', build: '60 days', scale: '90 days' };

/** S3's dashboard line + S6's "affirm" beat: the same band-thresholds view.ts already applies,
 *  via the now-exported readingBand (ruling 9) rather than a second, drift-prone copy. */
function bandRead(c: CategoryFact, methodology: Methodology): string {
  const band = readingBand(c.state as CategoryState, c.score, methodology.rules.thresholds.severe);
  return methodology.copy.dossier.reading[c.kind][band];
}

/** S6's "evidence" beat: the blind-spot line (copy.blocks.blind_spot) when this area is one of
 *  the facts pack's blind spots, else a plain score line. Never throws — c.id simply won't be
 *  found in facts.blind_spots for most areas, which is the expected, non-error path. */
function evidenceBeat(c: CategoryFact, facts: FactsPack, methodology: Methodology): string {
  const bs = facts.blind_spots.find((b) => b.category_id === c.id);
  if (bs) {
    return interp(methodology.copy.blocks.blind_spot!, {
      bs_name: bs.name,
      bs_belief: String(bs.belief),
      bs_evidence: String(bs.evidence),
      bs_gap: String(bs.gap),
    });
  }
  return `${c.name}: ${c.score} out of 100.`;
}

/** S6's "reframe" beat: the dispersion line — under `copy.inserts.dispersion`, NOT
 *  `copy.blocks.dispersion` (ruling 3 / recon divergence #3). Dropped entirely (returns null)
 *  when this area has no disagreement flag, per "absent inputs drop their beat". */
function reframeBeat(c: CategoryFact, facts: FactsPack, methodology: Methodology): string | null {
  const d = facts.dispersion.find((dd) => dd.category_id === c.id);
  if (!d) return null;
  return interp(methodology.copy.inserts.dispersion!, {
    disp_name: d.name,
    disp_spread: String(d.spread),
  });
}

/**
 * S6's per-area bullet: affirm + evidence + reframe, joined by a space. The brief names six
 * micro-template beats (affirm, pivot, evidence, not-statement, reframe, trajectory) but only
 * defines a concrete data source for three of them (affirm/evidence/reframe); pivot,
 * not-statement and trajectory have no lookup anywhere in the facts pack or copy.yaml, so they
 * are treated as structurally absent beats and always omitted — never emitting an empty
 * sentence, and never throwing on an undefined data source that was never specified. affirm is
 * always present (readingBand never fails to resolve a band), so this bullet is never empty.
 */
function s6Bullet(c: CategoryFact, facts: FactsPack, methodology: Methodology): string {
  const beats = [bandRead(c, methodology), evidenceBeat(c, facts, methodology), reframeBeat(c, facts, methodology)];
  return beats.filter((b): b is string => !!b).join(' ');
}

function s7Bullets(facts: FactsPack): string[] {
  const itemLines = facts.bottom_items.map((b) => `${b.text} — ${b.mean} out of 100 (${b.theme}).`);
  const patternLines = Object.entries(facts.pattern_counts)
    .filter(([, count]) => count === 0)
    .map(([theme]) => `None of the six lowest indicators are ${theme}.`);
  return [...itemLines, ...patternLines];
}

function s8Bullets(
  facts: FactsPack,
  methodology: Methodology,
  reflections: ReadonlyArray<{ item_id: string; reflection: string | null }>,
): string[] {
  if (facts.themes.length > 0) {
    return facts.themes.map((t) => `${t.label}: ${t.gloss} (${t.support_count} people).`);
  }
  // buildOutreachVoices groups per category_id (Map<string, OutreachVoicesGroup[]>) — flatten
  // across the Map's values before producing lines (ruling 10). Verbatims never enter a
  // bullet: only group.entries (respondent free text), never facts.themes[].verbatims.
  const voices = buildOutreachVoices(methodology, [...reflections]);
  return [...voices.values()]
    .flat()
    .flatMap((group) => group.entries.map((entry) => `${group.reflectionPrompt}: ${entry}`));
}

function s9Bullets(facts: FactsPack): string[] {
  return [
    ...facts.dependencies.map((d) => d.read_sentence),
    ...facts.gating.map((g) => `${g.name}: ${g.note}`),
  ];
}

/**
 * S10/S11's shared roadmap skeleton: one { dayLabel, text } entry per phase (constraint,
 * capacity) or per (phase, gated enabler) pair (foundation — ruling 8: 2 gated enablers ⇒ 6
 * entries, 3 ⇒ 9). `text` is only used by S10; S11 mirrors this same list's cardinality
 * 1:1 (ruling 11) with a single, archetype-level offer substituted for every entry.
 *
 * RULING 7 — the highest-risk lookup in this file: report.yaml carries BOTH
 * `action_library.categories.{gov,comm,sys}` and `action_library.enablers.{gov,comm,sys}`
 * with DIFFERENT text for the same ids. The constraint path below reads
 * `action_library.categories[primary]` (confirmed against report.yaml: e.g. `categories.gov.align`
 * = "Write down who decides what..."). The foundation path reads
 * `action_library.enablers[enabler_id]` (confirmed: `enablers.gov.align` =
 * "Clarify decision rights before adding any new initiative..." — different text, same key).
 * Picking the wrong bucket would still typecheck and still pass a test that only checks bullet
 * *count* — see tests/report/fallback-sections.test.ts's dedicated "action_library path" checks,
 * which assert the exact enabler text against report.yaml, not just presence.
 */
function roadmapEntries(facts: FactsPack, methodology: Methodology): Array<{ dayLabel: string; text: string }> {
  const lib = methodology.report.action_library;
  const entries: Array<{ dayLabel: string; text: string }> = [];

  if (facts.archetype === 'constraint' && facts.primary_constraint) {
    // Constraint path: action_library.categories[...], never .enablers[...].
    const set = lib.categories[facts.primary_constraint.category_id];
    for (const phase of PHASES) {
      const text = set?.[phase];
      if (text) entries.push({ dayLabel: DAY_LABELS[phase], text });
    }
  } else if (facts.archetype === 'foundation') {
    // Foundation / gated-enabler path: action_library.enablers[...], never .categories[...].
    // One bullet per gated enabler per phase (Natalie's ruling 8) — outer loop is phase, per
    // the brief's "for each phase ... pick ... each gated enabler's entry" ordering.
    for (const phase of PHASES) {
      for (const g of facts.gating) {
        const set = lib.enablers[g.enabler_id];
        const text = set?.[phase];
        if (text) entries.push({ dayLabel: DAY_LABELS[phase], text });
      }
    }
  } else {
    // Capacity path (and, structurally, any archetype that reaches here with no primary and no
    // gating): the generosity entry, keyed by facts.generosity_mode, falling back to 'both'
    // when null (Natalie's ruling 6) — never drop the bullet.
    const mode = facts.generosity_mode ?? 'both';
    const set = lib.generosity[mode];
    for (const phase of PHASES) {
      entries.push({ dayLabel: DAY_LABELS[phase], text: set[phase] });
    }
  }

  return entries;
}

function s10Bullets(facts: FactsPack, methodology: Methodology): string[] {
  const bullets = roadmapEntries(facts, methodology).map((e) => `${e.dayLabel} — ${e.text}`);
  if (facts.archetype === 'constraint' && facts.primary_constraint) {
    const primaryId = facts.primary_constraint.category_id;
    const names = facts.dependencies.filter((d) => d.from === primaryId).map((d) => d.to_name);
    if (names.length > 0) bullets.push(`Do not work on yet: ${names.join(', ')}.`);
  }
  return bullets;
}

/**
 * S11's single, archetype-level offer (reused for every mirrored bullet — ruling 11's "1:1"
 * mirrors S10's roadmap-entry COUNT, not a per-entry offer, since offers.yaml has no
 * enabler-keyed entries at all).
 *
 * - primary === 'gen' → offers.generosity[mode] (Natalie's ruling 4 — offers.stages has no
 *   'gen' key), mode falling back to 'both' when null (ruling 6, applies here too).
 * - primary is any other chain stage → offers.stages[primary] (always resolves: guest/conn/
 *   disc/vol are exactly offers.stages' four keys).
 * - no primary constraint (capacity — Natalie's ruling 5 — AND, by the same "no primary
 *   constraint" criterion, foundation, which has no enabler-keyed offer to fall back to
 *   either) → offers.no_constraint. This foundation extension is not explicitly named in any
 *   of the 11 rulings; it is the only non-throwing, non-generosity option available, so it is
 *   applied uniformly to both archetypes that carry no primary constraint. Flagged in the task
 *   report as an inferred decision, not a re-litigation of ruling 5.
 */
function offerFor(facts: FactsPack, methodology: Methodology): Offer {
  const primaryId = facts.primary_constraint?.category_id ?? null;
  if (primaryId === 'gen') {
    const mode = facts.generosity_mode ?? 'both';
    return methodology.offers.generosity[mode];
  }
  if (primaryId) {
    return methodology.offers.stages[primaryId] ?? methodology.offers.no_constraint;
  }
  return methodology.offers.no_constraint;
}

function s11Bullets(facts: FactsPack, methodology: Methodology): string[] {
  const offer = offerFor(facts, methodology);
  const offerText = `${offer.call_type} — ${offer.hook}`;
  return roadmapEntries(facts, methodology).map((e) => `${e.dayLabel}: ${offerText}`);
}

function appendixBullets(facts: FactsPack, methodology: Methodology): string[] {
  const bullets = [
    methodology.copy.inserts.benchmark_note!,
    methodology.copy.inserts.dependency_note!,
    `Confidence: ${facts.confidence}.`,
  ];
  if (facts.cover.respondent_count < 8) {
    bullets.push(`Small sample: ${facts.cover.respondent_count} respondents.`);
  }
  return bullets;
}

function bulletsFor(
  id: SectionId,
  facts: FactsPack,
  methodology: Methodology,
  reflections: ReadonlyArray<{ item_id: string; reflection: string | null }>,
  tokens: Record<string, string>,
): string[] {
  switch (id) {
    case 's1':
      return [];
    case 's2':
      return Object.entries(facts.profile).map(([k, v]) => `${PROFILE_LABELS[k] ?? k}: ${v}`);
    case 's3':
      return facts.categories.map((c) => `${c.name}: ${c.score} out of 100 — ${bandRead(c, methodology)}`);
    case 's4':
      return [];
    case 's5':
      return facts.categories.slice(0, 3).map((c) => `XPG Assessment: ${c.name} — ${c.score} out of 100.`);
    case 's6':
      return facts.categories.slice(3).map((c) => s6Bullet(c, facts, methodology));
    case 's7':
      return s7Bullets(facts);
    case 's8':
      return s8Bullets(facts, methodology, reflections);
    case 's9':
      return s9Bullets(facts);
    case 's10':
      return s10Bullets(facts, methodology);
    case 's11':
      return s11Bullets(facts, methodology);
    case 's12':
      return [
        `Overall: ${facts.overall.capacity} out of 100.`,
        `Band: ${facts.overall.tier.name}.`,
        `Objective: ${tokens.primary_name}.`,
      ];
    case 'appendix':
      return appendixBullets(facts, methodology);
  }
}

export function fallbackSection(id: SectionId, args: FallbackSectionArgs): SectionBody {
  const { facts, methodology, reflections } = args;
  const section = methodology.report.sections[id];

  const tokens: Record<string, string> = {
    church_name: facts.cover.church_name,
    completed_at: facts.cover.completed_at ?? 'not yet completed',
    respondent_count: String(facts.cover.respondent_count),
    overall_percent: String(facts.overall.capacity),
    tier_name: facts.overall.tier.name,
    primary_name: facts.primary_constraint?.name ?? 'no single stage',
    primary_score: String(
      facts.categories.find((c) => c.id === facts.primary_constraint?.category_id)?.score ?? 0,
    ),
  };

  return {
    title: section.title,
    body: interp(section.templates[facts.archetype], tokens),
    bullets: bulletsFor(id, facts, methodology, reflections, tokens),
  };
}

export function fallbackSections(args: FallbackSectionArgs): Record<SectionId, SectionBody> {
  const ids = Object.keys(args.methodology.report.sections) as SectionId[];
  return Object.fromEntries(ids.map((id) => [id, fallbackSection(id, args)])) as Record<SectionId, SectionBody>;
}
