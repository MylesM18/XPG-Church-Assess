import type { CategoryKind, Offer } from '../methodology/schema';

export interface Response {
  category_id: string;
  item_id: string;
  value: number; // 1..10
  respondent_label: string;
}

export interface Context {
  attendance_band: string;
}

export interface NormalizedCategory {
  category_id: string;
  itemValues: Map<string, number[]>; // item_id -> values across all respondents
  respondentMeans: Array<{ label: string; mean: number }>;
  respondentCount: number;
}

export type GapClass = 'blind_spot' | 'underrated' | 'calibrated' | null;
export type CategoryState = 'ok' | 'watch' | 'broken' | 'gate';
export type GenerosityMode = 'breadth' | 'depth' | 'both' | null;

export interface DiagnosisCategory {
  category_id: string;
  kind: CategoryKind;
  score: number; // 0..100
  belief: number | null;
  evidence: number | null;
  gap: number | null;
  gap_class: GapClass;
  cohort_percentile: number | null;
  state: CategoryState;
  respondent_count: number;
}

export interface BlindSpot {
  category_id: string;
  belief: number;
  evidence: number;
  gap: number;
}

export interface DispersionFlag {
  category_id: string;
  respondents: Array<{ label: string; mean: number }>;
  spread: number; // population stddev of respondent means, 0..10 scale
}

export interface DoNotWorkOn {
  category_id: string;
  reason: string;
}

export interface GatingCondition {
  enabler_id: string;
  note: string;
}

export interface EvidenceRef {
  kind: 'item' | 'metric';
  ref: string;
  value: number | null;
}

export interface EvidenceReceipt {
  claim: string;
  refs: EvidenceRef[];
}

export interface Diagnosis {
  methodology_version: string;
  overall_score: number;
  categories: DiagnosisCategory[];
  primary_constraint: { category_id: string } | null;
  contributing: string[];
  do_not_work_on: DoNotWorkOn[];
  gating_conditions: GatingCondition[];
  generosity_mode: GenerosityMode;
  blind_spots: BlindSpot[];
  dispersion_flags: DispersionFlag[];
  offer: Offer;
  confidence: number;
  evidence_trail: EvidenceReceipt[];
}
