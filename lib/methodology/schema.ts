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
  anchors: AnchorsSchema,
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

export const CopySchema = z.object({
  version: z.string().min(1),
  blocks: z.record(z.string().min(1)),
  inserts: z.record(z.string().min(1)),
});

export type Signal = z.infer<typeof SignalSchema>;
export type CategoryKind = z.infer<typeof CategoryKindSchema>;
export type Anchors = z.infer<typeof AnchorsSchema>;
export type Item = z.infer<typeof ItemSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type Questions = z.infer<typeof QuestionsSchema>;
export type Rules = z.infer<typeof RulesSchema>;
export type BandBenchmark = z.infer<typeof BandBenchmarkSchema>;
export type Benchmarks = z.infer<typeof BenchmarksSchema>;
export type Offer = z.infer<typeof OfferSchema>;
export type Offers = z.infer<typeof OffersSchema>;
export type Copy = z.infer<typeof CopySchema>;

export interface Methodology {
  questions: Questions;
  rules: Rules;
  benchmarks: Benchmarks;
  offers: Offers;
  copy: Copy;
}
