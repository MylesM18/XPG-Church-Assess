import type { AreaFit } from './fit';
import { populationStdDev } from './stats';

export interface Calibration {
  people: Array<{ respondent_id: string; style: number; areasCompleted: number }>;
  spread: number; // population stddev of style
}

/**
 * A person's rating STYLE is the mean of their person effects across the areas
 * they completed — "rates +1.4 above the room on everything" (spec §4.2).
 *
 * Separating style from area-specific opinion is the whole point: without it a
 * habitually harsh rater looks like conflict in every single area. Still
 * closed-form — an average of already-computed per-area effects, not a joint refit.
 */
export function calibrationFrom(fits: AreaFit[]): Calibration {
  const acc = new Map<string, { sum: number; count: number }>();
  for (const fit of fits) {
    for (const p of fit.personEffects) {
      const a = acc.get(p.respondent_id);
      if (a) {
        a.sum += p.effect;
        a.count++;
      } else {
        acc.set(p.respondent_id, { sum: p.effect, count: 1 });
      }
    }
  }

  const people = [...acc.entries()].map(([respondent_id, { sum, count }]) => ({
    respondent_id,
    style: sum / count,
    areasCompleted: count,
  }));

  if (people.length === 0) return { people, spread: 0 };
  const styles = people.map(p => p.style);

  return { people, spread: populationStdDev(styles) };
}

/**
 * deviation_ra = personEffect_ra - style_r — what is left after the person's
 * habitual generosity is removed. This is the ONLY quantity disagreement and
 * correlation may be computed on; raw area means correlate ~0.7 across all pairs
 * purely from rater generosity (common-method variance).
 */
export function deviationsFor(
  fit: AreaFit,
  calibration: Calibration,
): Array<{ respondent_id: string; deviation: number }> {
  const style = new Map(calibration.people.map(p => [p.respondent_id, p.style]));
  return fit.personEffects.map(p => ({
    respondent_id: p.respondent_id,
    deviation: p.effect - (style.get(p.respondent_id) ?? 0),
  }));
}
