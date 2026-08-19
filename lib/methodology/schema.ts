import { z } from 'zod';

export const SignalSchema = z.enum(['belief', 'evidence']);
export const CategoryKindSchema = z.enum(['stage', 'enabler']);

export const AnchorsSchema = z.object({
  lo: z.string().min(1),
  mid: z.string().min(1),
  hi: z.string().min(1),
});

// Spec P2: report-layer annotation, not scoring semantics — adding/changing a tag bumps NO
// methodology version and never stales a run. The canonical item→theme map is folded into the
// report inputsHash instead (plan 3, lib/report/report-hash.ts).
export const ThemeSchema = z.enum(['systems', 'culture', 'theology', 'relational']);
export type Theme = z.infer<typeof ThemeSchema>;

export const ItemSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  signal: SignalSchema,
  since: z.string().min(1).optional(),
  anchors: AnchorsSchema,
  reflection: z.string().min(1).optional(),
  theme: ThemeSchema,
});

export const CategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: CategoryKindSchema,
  position: z.number().int().min(1).max(5).nullable(),
  items: z.array(ItemSchema).min(1),
});

export const QuestionsSchema = z.object({
  version: z.string().min(1),
  categories: z.array(CategorySchema).length(8),
});

export const GatesSchema = z.union([z.literal('all'), z.array(z.string()).min(1)]);

export const DependencyEdgeKindSchema = z.enum(['sequence', 'gate']);

export const DependencySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  kind: DependencyEdgeKindSchema,
  statement: z.string().min(1),
});

export const TierBandSchema = z.object({ min: z.number(), name: z.string() });

export const RulesSchema = z.object({
  version: z.string().min(1),
  chain: z.array(z.string()).length(5),
  enablers: z.record(z.object({ gates: GatesSchema })),
  generosity: z.object({
    breadth_items: z.array(z.string()).min(1),
    depth_items: z.array(z.string()).min(1),
  }),
  throughput: z.object({
    min_weight: z.number().min(0).max(1),
  }),
  dependencies: z.array(DependencySchema).length(13),
  thresholds: z.object({
    break: z.number(),
    severe: z.number(),
    gate: z.number(),
    blind_spot_gap: z.number(),
    dispersion: z.number(),
    strong: z.number(),
  }),
  constraint_logic: z.string().min(1),
  confidence: z.object({
    low_response_penalty: z.number(),
    floor: z.number(),
  }),
  correlation: z.object({
    min_n: z.number().int().min(2),
    min_areas_per_person: z.number().int().min(3),
    practical_floor: z.number().min(0).max(1),
    max_unexpected: z.number().int().min(0),
    alpha: z.number().min(0).max(1),
  }),
  tiers: z.object({
    healthy_ready: TierBandSchema,
    healthy_stretched: TierBandSchema,
    strained: TierBandSchema,
    at_risk: TierBandSchema,
  }),
});

export const BandBenchmarkSchema = z.object({
  p25: z.number(),
  p50: z.number(),
  p75: z.number(),
});

export const BenchmarksSchema = z.object({
  version: z.string().min(1),
  source: z.string().min(1),
  bands: z.record(z.record(BandBenchmarkSchema)),
});

export const OfferSchema = z.object({
  type: z.string().min(1),
  call_type: z.string().min(1),
  hook: z.string().min(1),
});

export const OffersSchema = z.object({
  version: z.string().min(1),
  stages: z.record(OfferSchema),
  generosity: z.object({
    breadth: OfferSchema,
    depth: OfferSchema,
    both: OfferSchema,
  }),
  no_constraint: OfferSchema,
  // Named-and-required, not optional and not folded into `stages` (z.record) — same rationale
  // as the comment above DossierReadingBandSchema: a missing key must be a LOAD-time failure,
  // not an `undefined` surfacing downstream in a rendered offer sentence. Added for Natalie's
  // ruling 12 (task 5, fix round 1): foundation needs its own offer distinct from
  // no_constraint, whose "nothing here is broken" hook contradicts a gating finding.
  foundation: OfferSchema,
});

// A z.record(...) here would validate at load with any subset of the four keys present —
// `reading[kind][band]!` (lib/report/view.ts) would then read `undefined` for a missing band
// and crash later on `.length`, well downstream of methodology load, where the missing owner
// content is far harder to trace back to Task 14's copy.yaml. Naming the four keys makes a
// missing band a load-time failure instead (see tests/methodology/dossier-reading-bands.test.ts).
export const DossierReadingBandSchema = z.object({
  severe: z.string().min(1),
  broken: z.string().min(1),
  watch: z.string().min(1),
  holding: z.string().min(1),
});

// Named keys, not z.record — same rationale as DossierReadingBandSchema above: the four
// reads are a closed set (EdgeRead, lib/engine/dependencies.ts), and `dependency_reads[e.read]`
// (lib/report/view.ts) must resolve for every edge. A z.record would load with any subset and
// let a missing read surface as `undefined` interpolated into a rendered sentence, far from the
// copy file. Naming the four makes a missing read a load-time failure instead.
export const DependencyReadsSchema = z.object({
  load_bearing: z.string().min(1),
  clear: z.string().min(1),
  at_risk: z.string().min(1),
  both_strong: z.string().min(1),
});

// Named keys, not z.record — the same rationale as DossierReadingBandSchema above. The four tier
// ids (rules.yaml `tiers`) and the three archetypes (lib/report/tier.ts) are both closed sets,
// and lib/report/fallback-sections.ts indexes them directly, so a z.record would load with any
// subset and let a missing pair surface as `undefined` in a rendered dashboard bullet.
const XpgReadTiersSchema = z.object({
  healthy_ready: z.string().min(1),
  healthy_stretched: z.string().min(1),
  strained: z.string().min(1),
  at_risk: z.string().min(1),
});

export const XpgReadSchema = z.object({
  capacity: XpgReadTiersSchema,
  constraint: XpgReadTiersSchema,
  foundation: XpgReadTiersSchema,
});

// pivot: named keys (the closed ReadingBand set), same rationale as DossierReadingBandSchema.
// not_statement: named keys (the closed Theme set), same rationale.
// trajectory: z.record ON PURPOSE — its keys are the churches.growth_trajectory column's
// vocabulary, which lives in a migration CHECK and settings-form.tsx, not here. Naming them
// would be a third place to keep in sync, and an unrecognised value must DROP the beat at
// render time (spec §4's "an absent input drops its beat"), never fail methodology load for
// every church at once.
const BeatsSchema = z.object({
  pivot: DossierReadingBandSchema,
  not_statement: z.object({
    systems: z.string().min(1),
    culture: z.string().min(1),
    theology: z.string().min(1),
    relational: z.string().min(1),
  }),
  trajectory: z.record(z.string().min(1)),
});

export const CopySchema = z.object({
  version: z.string().min(1),
  blocks: z.record(z.string().min(1)),
  inserts: z.record(z.string().min(1)),
  dossier: z.object({
    reading: z.object({
      stage: DossierReadingBandSchema,
      enabler: DossierReadingBandSchema,
    }),
    enabler_belief_only: z.string().min(1),
    calibration_spread: z.string().min(1),
    generosity: z.object({
      breadth: z.string().min(1),
      depth: z.string().min(1),
      both: z.string().min(1),
    }),
    agreement: z.object({
      split: z.string().min(1),
      tight: z.string().min(1),
    }),
  }),
  dependency_reads: DependencyReadsSchema,
  xpg_read: XpgReadSchema,
  beats: BeatsSchema,
  s8_below_threshold: z.string().min(1),
  s8_no_reflections: z.string().min(1),
});

// Named keys, not z.record — the same rationale as DossierReadingBandSchema above. The three
// archetypes are a closed set and lib/report/fallback-sections.ts indexes them directly, so a
// z.record would load with any subset and let a missing archetype surface as `undefined`
// interpolated into a rendered sentence, far from the copy file.
const ArchetypeTemplatesSchema = z.object({
  capacity: z.string().min(1),
  constraint: z.string().min(1),
  foundation: z.string().min(1),
});

// A closed enum, so a typo in report.yaml ('tier-name') is a LOAD failure rather than a gate
// that silently never requires anything. lib/ai/section-gates.ts resolves each of these to a
// concrete string from the facts pack.
export const RequiredMentionSchema = z.enum(['tier_name', 'primary_name', 'overall_percent']);

export const ReportSectionSchema = z.object({
  title: z.string().min(1),
  templates: ArchetypeTemplatesSchema,
  length_ceiling: z.number().int().positive(),
  required_mentions: z.array(RequiredMentionSchema),
});

// All twelve named. fallback-sections.ts iterates the full skeleton, so a missing id is a
// hole in a rendered report; naming them makes it a load-time failure instead.
//
// The thirteenth, `appendix` ("Methodology and caveats"), was removed on 2026-08-16 at
// Natalie's request. It is this object that drives SectionId, so nothing downstream can
// still name it — that is why the removal starts here.
// ⚠️ KEY ORDER IS SECTION ORDER. Zod rebuilds the parsed object in THIS shape's key order,
// whatever the YAML says, and both assemblers map over Object.keys(report.sections) — so the
// report renders in the order below. s12 sits before s11 on purpose (Natalie, 2026-08-19):
// "Where XPG can partner" closes the report, directly above the booking CTA.
const ReportSectionsSchema = z.object({
  s1: ReportSectionSchema, s2: ReportSectionSchema, s3: ReportSectionSchema,
  s4: ReportSectionSchema, s5: ReportSectionSchema, s6: ReportSectionSchema,
  s7: ReportSectionSchema, s8: ReportSectionSchema, s9: ReportSectionSchema,
  s10: ReportSectionSchema, s12: ReportSectionSchema, s11: ReportSectionSchema,
});

const ActionSetSchema = z.object({
  align: z.string().min(1),
  build: z.string().min(1),
  scale: z.string().min(1),
});

// z.record for categories/enablers on purpose: their ids live in questions.yaml and rules.yaml,
// and duplicating them here would be two lists to keep in sync. Completeness is enforced
// instead by tests/methodology/report-yaml.test.ts, which checks coverage against the real
// methodology — stronger than named keys, because it cannot go stale when an area is added.
export const ReportSchema = z.object({
  version: z.string().min(1),
  style_spine: z.string().min(1),
  sections: ReportSectionsSchema,
  banned_phrases: z.object({
    capacity: z.array(z.string().min(1)),
    constraint: z.array(z.string().min(1)),
    foundation: z.array(z.string().min(1)),
  }),
  action_library: z.object({
    categories: z.record(ActionSetSchema),
    enablers: z.record(ActionSetSchema),
    generosity: z.object({
      breadth: ActionSetSchema, depth: ActionSetSchema, both: ActionSetSchema,
    }),
  }),
});

export type Signal = z.infer<typeof SignalSchema>;
export type CategoryKind = z.infer<typeof CategoryKindSchema>;
export type Anchors = z.infer<typeof AnchorsSchema>;
export type Item = z.infer<typeof ItemSchema>;
// Theme type already defined above via z.infer
export type Category = z.infer<typeof CategorySchema>;
export type Questions = z.infer<typeof QuestionsSchema>;
export type Rules = z.infer<typeof RulesSchema>;
export type Dependency = z.infer<typeof DependencySchema>;
export type BandBenchmark = z.infer<typeof BandBenchmarkSchema>;
export type Benchmarks = z.infer<typeof BenchmarksSchema>;
export type Offer = z.infer<typeof OfferSchema>;
export type Offers = z.infer<typeof OffersSchema>;
export type DossierReadingBand = z.infer<typeof DossierReadingBandSchema>;
export type DependencyReads = z.infer<typeof DependencyReadsSchema>;
export type XpgRead = z.infer<typeof XpgReadSchema>;
export type Copy = z.infer<typeof CopySchema>;
export type RequiredMention = z.infer<typeof RequiredMentionSchema>;
export type ReportSection = z.infer<typeof ReportSectionSchema>;
export type ActionSet = z.infer<typeof ActionSetSchema>;
export type Report = z.infer<typeof ReportSchema>;
export type SectionId = keyof Report['sections'];

export interface Methodology {
  questions: Questions;
  rules: Rules;
  benchmarks: Benchmarks;
  offers: Offers;
  copy: Copy;
  report: Report;
}
