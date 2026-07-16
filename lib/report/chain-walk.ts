import type { CategoryState, Diagnosis } from '../engine/types';
import type { Methodology } from '../methodology/schema';

export type StageBucket = 'holding' | 'constraint' | 'downstream';

export interface StageView {
  category_id: string;
  name: string;
  score: number;
  state: CategoryState;
  bucket: StageBucket;
  isDoNotWorkOn: boolean;
}

/**
 * Walks methodology.rules.chain = [guest, conn, disc, vol, gen] in order and
 * buckets each stage relative to the already-computed primary constraint.
 * Pure: reads the Diagnosis, never re-derives the constraint.
 */
export function chainWalk(diagnosis: Diagnosis, methodology: Methodology): StageView[] {
  const chain = methodology.rules.chain;
  const names = new Map(methodology.questions.categories.map((c) => [c.id, c.name]));
  const catById = new Map(diagnosis.categories.map((c) => [c.category_id, c]));
  const doNotWorkOn = new Set(diagnosis.do_not_work_on.map((x) => x.category_id));
  const primaryIndex = diagnosis.primary_constraint
    ? chain.indexOf(diagnosis.primary_constraint.category_id)
    : -1;

  return chain.map((category_id, i) => {
    let bucket: StageBucket;
    if (primaryIndex === -1 || i < primaryIndex) bucket = 'holding';
    else if (i === primaryIndex) bucket = 'constraint';
    else bucket = 'downstream';

    const cat = catById.get(category_id);
    return {
      category_id,
      name: names.get(category_id) ?? category_id,
      score: cat?.score ?? 0,
      state: (cat?.state ?? 'ok') as CategoryState,
      bucket,
      isDoNotWorkOn: doNotWorkOn.has(category_id),
    };
  });
}
