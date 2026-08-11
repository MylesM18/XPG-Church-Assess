import { createHash } from 'node:crypto';
import type { Methodology } from '../methodology/schema';

export interface ReportHashArgs {
  /** The RUN's edition, not the current one — the same value stamped on the diagnosis. */
  methodologyVersion: string;
  /** lib/report/response-hash.ts's digest of this run's answers. */
  responseHash: string;
  /** The EFFECTIVE methodology, for the canonical item→theme map. */
  methodology: Methodology;
  reflections: ReadonlyArray<{ item_id: string; respondent_key: string; text: string }>;
  /** FactsPack['profile'] — non-null fields only, already guarded. */
  profile: Record<string, string>;
  /** methodology.report.version. */
  reportVersion: string;
}

/**
 * The report cache key (parent spec line 76).
 *
 *   sha256(methodology_version | response_hash | item→theme map | reflections | profile | report.yaml version)
 *
 * Reflections, profile fields and theme tags are deliberately IN this hash and deliberately OUT
 * of response_hash: changing any of them must regenerate the REPORT without staling the RUN
 * (P2). That asymmetry is the whole reason this is a second hash rather than a reuse of the
 * first one.
 *
 * Every component is canonicalized before hashing — sorted, serialized as arrays rather than
 * objects (no key-order ambiguity), with a plain lexicographic compare, never localeCompare,
 * which is locale- and ICU-version-dependent and would make the cache key differ across
 * machines. Server-only (node:crypto).
 *
 * INPUTS ONLY. Clustered themes are model OUTPUT and must never appear here: including them
 * would make the key that decides whether to call the model depend on what the model said.
 */
export function reportInputsHash(args: ReportHashArgs): string {
  const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

  const themeMap = args.methodology.questions.categories
    .flatMap((c) => c.items.map((i) => [i.id, i.theme] as const))
    .sort((a, b) => cmp(a[0], b[0]));

  const reflections = [...args.reflections]
    .map((r) => [r.item_id, r.respondent_key, r.text] as const)
    .sort((a, b) => cmp(a[0], b[0]) || cmp(a[1], b[1]) || cmp(a[2], b[2]));

  const profile = Object.keys(args.profile)
    .sort(cmp)
    .map((k) => [k, args.profile[k]!] as const);

  const canonical = [
    args.methodologyVersion,
    args.responseHash,
    JSON.stringify(themeMap),
    JSON.stringify(reflections),
    JSON.stringify(profile),
    args.reportVersion,
  ].join('|');

  return createHash('sha256').update(canonical).digest('hex');
}
