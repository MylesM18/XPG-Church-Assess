import { z } from 'zod';

export const SignalSchema = z.enum(['belief', 'evidence']);
export const CategoryKindSchema = z.enum(['stage', 'enabler']);

export const AnchorsSchema = z.object({
  lo: z.string().min(1),
  mid: z.string().min(1),
  hi: z.string().min(1),
});

export const ItemSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  signal: SignalSchema,
  since: z.string().min(1).optional(),
  anchors: AnchorsSchema,
  reflection: z.string().min(1).optional(),
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
});

export type Signal = z.infer<typeof SignalSchema>;
export type CategoryKind = z.infer<typeof CategoryKindSchema>;
export type Anchors = z.infer<typeof AnchorsSchema>;
export type Item = z.infer<typeof ItemSchema>;
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
export type Copy = z.infer<typeof CopySchema>;

export interface Methodology {
  questions: Questions;
  rules: Rules;
  benchmarks: Benchmarks;
  offers: Offers;
  copy: Copy;
}
