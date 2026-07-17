import { createHash } from 'node:crypto';

export interface HashableRow {
  category_id: string;
  item_id: string;
  value: number;
  respondent_label: string;
}

/**
 * Content-addresses a response set. Canonicalizes by sorting rows on
 * (category_id, item_id, respondent_label, value), serializing to a stable
 * array-of-arrays JSON (no object key-order ambiguity), prefixing the
 * methodology version, and sha256-ing. A methodology bump busts the cache.
 * Server-only (node:crypto).
 */
export function responseHash(rows: HashableRow[], methodologyVersion: string): string {
  const sorted = [...rows].sort(
    (a, b) =>
      a.category_id.localeCompare(b.category_id) ||
      a.item_id.localeCompare(b.item_id) ||
      a.respondent_label.localeCompare(b.respondent_label) ||
      a.value - b.value,
  );
  const canonical = JSON.stringify(
    sorted.map((r) => [r.category_id, r.item_id, r.respondent_label, r.value]),
  );
  return createHash('sha256').update(`${methodologyVersion}|${canonical}`).digest('hex');
}
