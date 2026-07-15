import type { Methodology } from '../methodology/schema';
import type { Response, Context, Diagnosis } from './types';
import { normalize } from './normalize';
import { assemble } from './assemble';

export type { Response, Context, Diagnosis } from './types';

export function diagnose(
  responses: Response[],
  methodology: Methodology,
  context: Context,
): Diagnosis {
  const normalized = normalize(responses, methodology);
  return assemble(normalized, methodology, context);
}
