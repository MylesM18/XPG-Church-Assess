import type { CategoryKind, Offer } from '../methodology/schema';
import type { AreaFit } from './fit';
import type { Calibration } from './calibration';

export interface Response {
  category_id: string;
  item_id: string;
  value: number; // 1..10
  respondent_label: string; // DISPLAY ONLY — may collide across people
  respondent_id: string; // stable identity — what the engine groups on
}

export interface Context {
  attendance_band: string;
}

export interface NormalizedCategory {
  category_id: string;
  itemValues: Map<string, number[]>; // item_id -> values across all respondents
  respondentMeans: Array<{ label: string; mean: number }>;
  respondentCount: number;
  fit: AreaFit;
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

export type { DisagreementFlag } from './disagreement';
/** @deprecated use DisagreementFlag — kept until the report layer is reshaped (Task 13). */
export type DispersionFlag = import('./disagreement').DisagreementFlag;

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
  throughput: number; // the cover number — 0.85*min(chain) + 0.15*mean(chain)
  capacity: number;   // 8-area mean — what overall_score used to be
  gap: number;        // capacity - throughput
  categories: DiagnosisCategory[];
  primary_constraint: { category_id: string } | null;
  contributing: string[];
  do_not_work_on: DoNotWorkOn[];
  gating_conditions: GatingCondition[];
  generosity_mode: GenerosityMode;
  blind_spots: BlindSpot[];
  dispersion_flags: DispersionFlag[];
  calibration: Calibration;
  offer: Offer;
  confidence: number;
  evidence_trail: EvidenceReceipt[];
}
