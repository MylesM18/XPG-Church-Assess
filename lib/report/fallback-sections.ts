import { MIN_SUPPORT } from '../ai/theme-gates';
import type { CategoryState } from '../engine/types';
import type { Methodology, Offer, SectionId, Theme } from '../methodology/schema';
import type { CategoryFact, FactsPack } from './facts';
import { buildOutreachVoices, dependencyReadLines, interp, readingBand, type ReportAudience } from './view';

/**
 * The deterministic spine. Every one of the twelve sections renders from the facts pack and
 * report.yaml alone — no model, no network, no throw. This is what makes an AI section failure
 * a local, invisible degradation rather than a broken report, and it is the ONLY renderer the
 * share page will ever reach (P5).
 *
 * Absorbs the old blocks per the parent spec line 74:
 *   verdict → S2/S4 · evidence → S4/S7 · cost + do_not_work_on → S9/S10 (Constraint)
 *   next_step → S11 · gating → S6/S9 (Foundation) · dispersion → S6 area beat
 *   blind_spot → S6 "watch for" beat
 */
export interface FallbackSectionArgs {
  facts: FactsPack;
  methodology: Methodology;
  reflections: ReadonlyArray<{ item_id: string; reflection: string | null }>;
  /**
   * Which surface is rendering. OPTIONAL and gated by an ALLOW-list (`screen`/`pdf`) rather
   * than the deny-list buildReportView uses (view.ts) — so a call site that forgets to declare
   * itself WITHHOLDS the private free-text instead of leaking it. The failure mode has to point
   * that way: the only content this gates is respondents' verbatim reflections.
   */
  audience?: ReportAudience;
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

/** Exported for the web phase rail, which keys its opacity ramp off the PHASE rather than
 *  the entry's array position — see roadmapEntries below and lib/report/web-visuals.ts. */
export type Phase = 'align' | 'build' | 'scale';
const PHASES: readonly Phase[] = ['align', 'build', 'scale'];
const DAY_LABELS: Record<Phase, string> = { align: '30 days', build: '60 days', scale: '90 days' };

/** S3's dashboard line + S6's "affirm" beat: the same band-thresholds view.ts already applies,
 *  via the now-exported readingBand (ruling 9) rather than a second, drift-prone copy. */
function bandRead(c: CategoryFact, methodology: Methodology): string {
  const band = readingBand(c.state as CategoryState, c.score, methodology.rules.thresholds);
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
 * S6's "pivot" beat: where this area sits relative to the church's own top three.
 *
 * facts.categories is already sorted score desc (ties by id asc, buildFacts:164), so rank is
 * just the index + 1 and the top three are slice(0, 3) — the SAME three s5 renders as strengths.
 * Returns null for those three: an area cannot pivot against a group it belongs to, and "0 points
 * behind your strongest three" is the empty sentence this beat design forbids.
 */
function pivotBeat(c: CategoryFact, facts: FactsPack, methodology: Methodology): string | null {
  const rank = facts.categories.findIndex((cc) => cc.id === c.id) + 1;
  if (rank <= 3) return null;
  const topThree = facts.categories.slice(0, 3);
  if (topThree.length === 0) return null;
  const topMean = topThree.reduce((sum, cc) => sum + cc.score, 0) / topThree.length;
  const delta = Math.round(topMean - c.score);
  if (delta <= 0) return null;
  const band = readingBand(c.state as CategoryState, c.score, methodology.rules.thresholds);
  return interp(methodology.copy.beats.pivot[band], { rank: String(rank), delta: String(delta) });
}

/**
 * S6's "not-statement" beat: what this area's weakness is NOT, keyed by the dominant theme among
 * its own lowest-scoring indicators (facts.bottom_items, already the global bottom 6). An area
 * with none of them in the bottom 6 has no measured evidence of what its weakness is made of, so
 * the beat drops rather than guessing.
 *
 * Ties break by theme name ascending — deterministic, never localeCompare, because two runs of
 * the same report must produce byte-identical prose.
 */
function notStatementBeat(c: CategoryFact, facts: FactsPack, methodology: Methodology): string | null {
  const mine = facts.bottom_items.filter((b) => b.category_id === c.id);
  if (mine.length === 0) return null;
  const counts = new Map<Theme, number>();
  for (const b of mine) counts.set(b.theme, (counts.get(b.theme) ?? 0) + 1);
  const dominant = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
  )[0]![0];
  return methodology.copy.beats.not_statement[dominant] ?? null;
}

/**
 * S6's "trajectory" beat: the area read against where the church as a whole is heading.
 *
 * facts.profile carries NON-NULL fields only (facts.ts:173-190), so an unset growth_trajectory is
 * simply absent from the record — and an unrecognised value (an older row, a vocabulary change in
 * the migration CHECK) resolves to undefined in the z.record lookup. Both drop the beat. Neither
 * throws, and neither emits a sentence about a trajectory nobody stated.
 */
function trajectoryBeat(facts: FactsPack, methodology: Methodology): string | null {
  const trajectory = facts.profile.growth_trajectory;
  if (!trajectory) return null;
  return methodology.copy.beats.trajectory[trajectory] ?? null;
}

/**
 * S6's per-area bullet: the full six-beat micro-template, joined by a space, in blueprint order —
 * affirm -> pivot -> evidence -> not_statement -> reframe -> trajectory.
 *
 * pivot, not_statement and trajectory were previously omitted as "structurally absent": they had
 * no lookup anywhere in the facts pack or copy.yaml. They now do (copy.beats.*, plus
 * facts.categories ranking, facts.bottom_items themes and facts.profile.growth_trajectory
 * respectively), so all six are live.
 *
 * The original rule is unchanged and load-bearing: AN ABSENT INPUT DROPS ITS BEAT. Every beat
 * function returns string | null, the filter below removes the nulls, and no beat ever emits an
 * empty sentence or throws on an undefined lookup. affirm always resolves (readingBand never
 * fails to produce a band), so this bullet is never empty — the invariant s6's renderers and
 * gate 1's blank check both rely on.
 */
function s6Bullet(c: CategoryFact, facts: FactsPack, methodology: Methodology): string {
  const beats = [
    bandRead(c, methodology),
    pivotBeat(c, facts, methodology),
    evidenceBeat(c, facts, methodology),
    notStatementBeat(c, facts, methodology),
    reframeBeat(c, facts, methodology),
    trajectoryBeat(facts, methodology),
  ];
  return beats.filter((b): b is string => !!b).join(' ');
}

/**
 * S7's bullets. The punch list itself — every area below the improvement standard, worst first,
 * each with its own weak questions — is NOT here: it is a deterministic BLOCK
 * (lib/report/blocks.ts punchListBlock, attached by compose.ts blocksForSection).
 *
 * ⚠️ It lived here, as bullets, for exactly one session and rendered on no live report. s7 is
 * one of the seven AI sections and prose is on whenever OPENAI_API_KEY is set, so `S7View` on
 * both surfaces rendered the model's narrative and dropped `fallback.bullets` entirely. Do not
 * move computed content back into a bullet on any section listed in AI_SECTION_IDS.
 *
 * The flat six-item list the old body emitted is likewise gone whenever an area needs work: that
 * same list is already printed twice around it — verbatim by the rank_list chart that renders
 * beside s7 on BOTH surfaces (charts.ts rankListModel), and again question-by-question inside the
 * punch list. It survives only on the path where there is nothing else to say, below.
 *
 * The pattern lines stay on every path: they describe `bottom_items`, not the areas, and gate 5
 * (tests/ai/section-gates.test.ts) checks the AI's pattern claim against this exact phrasing.
 */
function s7Bullets(facts: FactsPack): string[] {
  const patternLines = Object.entries(facts.pattern_counts)
    .filter(([, count]) => count === 0)
    .map(([theme]) => `None of the six lowest indicators are ${theme}.`);
  // Nothing below the standard: the punch-list block is null, so the six lowest questions are the
  // only specific evidence s7 has. Without this the section can render with zero bullets.
  if (facts.improvement.areas_needing_work.length === 0) {
    const itemLines = facts.bottom_items.map((b) => `${b.text} — ${b.mean} out of 100 (${b.theme}).`);
    return [...itemLines, ...patternLines];
  }
  return patternLines;
}

/**
 * S8's bullets, with the SAME k>=3 philosophy on both paths.
 *
 * The theme path already enforces it: clusterThemes -> theme-gates drops any cluster under
 * MIN_SUPPORT distinct supporting respondents, so facts.themes is k-safe by construction.
 *
 * The fallback path did NOT. It printed every reflection verbatim with its prompt and no
 * threshold at all — and this is the path the PUBLIC SHARE PAGE always renders
 * (assembleFallbackOnly). At one respondent that is one person's answers, fully attributable, on
 * a link anyone can forward.
 *
 * ⚠️ KNOWN LIMITATION, deliberate: `reflections` here is the KEYLESS array (item_id + text, no
 * respondent id — resolve.ts:24-28), so this cannot count distinct WRITERS the way theme-gates
 * does. It uses the run's distinct respondent count instead. That is a weaker k, but threading
 * respondent identity into a renderer to strengthen it is exactly what the keyless array exists
 * to prevent. Strictly better than no threshold; not as strong as the theme path's.
 */
function s8Bullets(
  facts: FactsPack,
  methodology: Methodology,
  reflections: ReadonlyArray<{ item_id: string; reflection: string | null }>,
  audience: ReportAudience | undefined,
): string[] {
  if (facts.themes.length > 0) {
    return facts.themes.map((t) => `${t.label}: ${t.gloss} (${t.support_count} people).`);
  }
  // ⚠️ ORDER IS LOAD-BEARING. The audience gate sits BELOW the themes branch, never above it.
  // Themes are k-gated AGGREGATES that already ship on the share page today; Natalie asked that
  // the VERBATIM reflections become private, not the themes. A gate at the top of this function
  // would strip themes from the share page — a silent content regression.
  if (audience !== 'screen' && audience !== 'pdf') return [methodology.copy.s8_below_threshold];
  // Orthogonal to audience, and kept on BOTH paths: dropping names is not dropping the
  // k-threshold.
  if (facts.cover.respondent_count < MIN_SUPPORT) return [methodology.copy.s8_below_threshold];
  // buildOutreachVoices groups per category_id (Map<string, OutreachVoicesGroup[]>) — flatten
  // across the Map's values before producing lines (ruling 10). Verbatims never enter a
  // bullet: only group.entries (respondent free text), never facts.themes[].verbatims.
  const voices = buildOutreachVoices(methodology, [...reflections]);
  const lines = [...voices.values()]
    .flat()
    .flatMap((group) => group.entries.map((entry) => `${group.reflectionPrompt}: ${entry}`));
  // An empty section under a "What Leaders Are Saying" heading reads as a rendering bug. Say why
  // it is empty instead.
  return lines.length > 0 ? lines : [methodology.copy.s8_below_threshold];
}

/** Read sentences go through dependencyReadLines (lib/report/view.ts), which collapses the
 *  identical ones — 13 edges, but a healthy church's `both_strong` sentence names no areas and
 *  so repeated verbatim once per edge. Gating notes are name-prefixed and never collide. */
function s9Bullets(facts: FactsPack): string[] {
  return [
    ...dependencyReadLines(facts.dependencies.map((d) => d.read_sentence)),
    ...facts.gating.map((g) => `${g.name}: ${g.note}`),
  ];
}

/**
 * S10's roadmap skeleton: one { phase, dayLabel, text } entry per phase (constraint, capacity) or
 * per (phase, gated enabler) pair (foundation — Natalie's ruling 8: 2 gated enablers ⇒ 6 entries,
 * 3 ⇒ 9). `phase` is the entry's own align/build/scale key, carried so consumers can group by
 * phase without either parsing `dayLabel` back into a phase or (worse) assuming array position
 * stands in for phase — which only holds in the 3-entry archetypes. It is the single source
 * `dayLabel` is derived from, so the two can never disagree. `text` is used by S10 only — S11
 * does NOT mirror this list's raw cardinality; see
 * s11Bullets's own doc comment below for ruling 11-REVISED (the withdrawn per-bullet ruling 11
 * mirrored every entry here 1:1, which produced byte-identical duplicate S11 bullets whenever an
 * archetype had more than one roadmap entry per phase — e.g. a 2-gated-enabler foundation).
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
export function roadmapEntries(
  facts: FactsPack,
  methodology: Methodology,
): Array<{ phase: Phase; dayLabel: string; text: string }> {
  const lib = methodology.report.action_library;
  const entries: Array<{ phase: Phase; dayLabel: string; text: string }> = [];

  if (facts.archetype === 'constraint' && facts.primary_constraint) {
    // Constraint path: action_library.categories[...], never .enablers[...].
    const set = lib.categories[facts.primary_constraint.category_id];
    for (const phase of PHASES) {
      const text = set?.[phase];
      if (text) entries.push({ phase, dayLabel: DAY_LABELS[phase], text });
    }
  } else if (facts.archetype === 'foundation') {
    // Foundation / gated-enabler path: action_library.enablers[...], never .categories[...].
    // One bullet per gated enabler per phase (Natalie's ruling 8) — outer loop is phase, per
    // the brief's "for each phase ... pick ... each gated enabler's entry" ordering.
    for (const phase of PHASES) {
      for (const g of facts.gating) {
        const set = lib.enablers[g.enabler_id];
        const text = set?.[phase];
        if (text) entries.push({ phase, dayLabel: DAY_LABELS[phase], text });
      }
    }
  } else {
    // Capacity path (and, structurally, any archetype that reaches here with no primary and no
    // gating): the generosity entry, keyed by facts.generosity_mode, falling back to 'both'
    // when null (Natalie's ruling 6) — never drop the bullet.
    const mode = facts.generosity_mode ?? 'both';
    const set = lib.generosity[mode];
    for (const phase of PHASES) {
      entries.push({ phase, dayLabel: DAY_LABELS[phase], text: set[phase] });
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
 * S11's single, archetype-level offer (reused for every mirrored bullet — see s11Bullets below).
 *
 * - primary === 'gen' → offers.generosity[mode] (Natalie's ruling 4 — offers.stages has no
 *   'gen' key), mode falling back to 'both' when null (ruling 6, applies here too).
 * - primary is any other chain stage → offers.stages[primary] (always resolves: guest/conn/
 *   disc/vol are exactly offers.stages' four keys).
 * - foundation (no primary constraint, gated enablers instead) → offers.foundation
 *   (Natalie's ruling 12 — a dedicated purpose-built offer, added specifically because
 *   offers.no_constraint's hook, "Nothing here is broken...", contradicts the report's own
 *   gating finding. This SUPERSEDES the earlier inferred decision to reuse offers.no_constraint
 *   for foundation, which task-5-report.md flagged and Natalie ruled on).
 * - capacity (no primary constraint, no gating either) → offers.no_constraint (ruling 5,
 *   unchanged — this is the one archetype that entry was always meant for).
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
  if (facts.archetype === 'foundation') {
    return methodology.offers.foundation;
  }
  return methodology.offers.no_constraint;
}

/**
 * ONE bullet: the single archetype-level offer, stated once (Natalie, 2026-08-16, on a rendered
 * report). This supersedes ruling 11-REVISED's "one bullet per distinct S10 dayLabel", which
 * paired every phase with the SAME offer text and so printed the identical
 * `call_type — hook` under 30 days, 60 days and 90 days — three times on every capacity report,
 * and on every other archetype too.
 *
 * The dedup is structural, not a filter: offerFor() resolves per ARCHETYPE, not per phase, so
 * the three phases always resolve to one offer and there is never a second one to print. If a
 * future offer model ever resolves per phase, restore the per-phase loop and dedupe on the
 * offer text rather than on the day label.
 *
 * The separator is a colon. It used to be an em-dash, which is banned by `style_spine` and
 * `SYSTEM_PROMPT` — `tests/methodology/copy-register.test.ts` enforces that ban across the
 * parsed YAML only, so a renderer-side `—` slipped past it and put the mark back into rendered
 * copy that offers.yaml had already been cleaned of.
 */
function s11Bullets(facts: FactsPack, methodology: Methodology): string[] {
  const offer = offerFor(facts, methodology);
  return [`${offer.call_type}: ${offer.hook}`];
}

function bulletsFor(
  id: SectionId,
  facts: FactsPack,
  methodology: Methodology,
  reflections: ReadonlyArray<{ item_id: string; reflection: string | null }>,
  tokens: Record<string, string>,
  audience: ReportAudience | undefined,
): string[] {
  switch (id) {
    case 's1':
      return [];
    case 's2':
      return Object.entries(facts.profile).map(([k, v]) => `${PROFILE_LABELS[k] ?? k}: ${v}`);
    case 's3':
      // ONE bullet, not eight. The eight `Name: score — bandRead` lines this used to emit are
      // now the statGridModel chart (lib/report/charts.ts) on both surfaces, with the bar fill
      // keyed to the same corrected readingBand — printing them again beside the chart is the
      // same data twice. What the chart cannot say is what the shape MEANS, which is this line.
      return [methodology.copy.xpg_read[facts.archetype][facts.overall.tier.id]];
    case 's4':
      return [];
    case 's5':
      return facts.categories.slice(0, 3).map((c) => `XPG Assessment: ${c.name} — ${c.score} out of 100.`);
    case 's6':
      return facts.categories.slice(3).map((c) => s6Bullet(c, facts, methodology));
    case 's7':
      return s7Bullets(facts);
    case 's8':
      return s8Bullets(facts, methodology, reflections, audience);
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
  }
}

export function fallbackSection(id: SectionId, args: FallbackSectionArgs): SectionBody {
  const { facts, methodology, reflections, audience } = args;
  const section = methodology.report.sections[id];

  const tokens: Record<string, string> = {
    church_name: facts.cover.church_name,
    completed_at: facts.cover.completed_at ?? 'not yet completed',
    respondent_count: String(facts.cover.respondent_count),
    respondent_phrase: `${facts.cover.respondent_count} ${facts.cover.respondent_count === 1 ? 'respondent' : 'respondents'}`,
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
    bullets: bulletsFor(id, facts, methodology, reflections, tokens, audience),
  };
}

export function fallbackSections(args: FallbackSectionArgs): Record<SectionId, SectionBody> {
  const ids = Object.keys(args.methodology.report.sections) as SectionId[];
  return Object.fromEntries(ids.map((id) => [id, fallbackSection(id, args)])) as Record<SectionId, SectionBody>;
}
