import { describe, expect, it } from 'vitest';
import { loadMethodology } from '@/lib/methodology/load';
import { responseHash } from '@/lib/report/response-hash';
import { reportInputsHash } from '@/lib/report/report-hash';

const methodology = loadMethodology();
const base = {
  methodologyVersion: '0.3.0',
  responseHash: 'a'.repeat(64),
  methodology,
  reflections: [
    { item_id: 'conn_2', respondent_key: 'u1', text: 'we lose people after week two' },
    { item_id: 'conn_1', respondent_key: 'u2', text: 'greeters are great' },
  ],
  profile: { context: 'suburban', denomination: 'non-denominational' },
  reportVersion: methodology.report.version,
};

describe('reportInputsHash', () => {
  it('is a sha256 hex digest', () => {
    expect(reportInputsHash(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable across reflection input order', () => {
    const reversed = { ...base, reflections: [...base.reflections].reverse() };
    expect(reportInputsHash(reversed)).toBe(reportInputsHash(base));
  });

  it('is stable across profile key insertion order', () => {
    const reordered = { ...base, profile: { denomination: 'non-denominational', context: 'suburban' } };
    expect(reportInputsHash(reordered)).toBe(reportInputsHash(base));
  });

  it.each([
    ['methodologyVersion', { methodologyVersion: '0.2.0' }],
    ['responseHash', { responseHash: 'b'.repeat(64) }],
    ['reportVersion', { reportVersion: '9.9.9' }],
    ['a reflection text', { reflections: [{ item_id: 'conn_2', respondent_key: 'u1', text: 'changed' }, base.reflections[1]!] }],
    ['a reflection respondent', { reflections: [{ ...base.reflections[0]!, respondent_key: 'u9' }, base.reflections[1]!] }],
    ['a profile field', { profile: { context: 'urban', denomination: 'non-denominational' } }],
  ])('changes when %s changes', (_label, patch) => {
    expect(reportInputsHash({ ...base, ...patch })).not.toBe(reportInputsHash(base));
  });

  it('changes when an item theme tag changes', () => {
    const first = methodology.questions.categories[0]!;
    const retagged = {
      ...methodology,
      questions: {
        ...methodology.questions,
        categories: methodology.questions.categories.map((c, i) =>
          i !== 0 ? c : { ...c, items: c.items.map((it, j) => (j !== 0 ? it : { ...it, theme: it.theme === 'systems' ? 'culture' : 'systems' })) },
        ),
      },
    } as typeof methodology;
    expect(first).toBeDefined();
    expect(reportInputsHash({ ...base, methodology: retagged })).not.toBe(reportInputsHash(base));
  });
});

// Addendum §1.3 — asserted as a property so plan 4 inherits a proven fact rather than
// rediscovering a coincidence.
describe('the share path can never hash-match a persisted report', () => {
  const rows = [
    { category_id: 'conn', item_id: 'conn_1', value: 7, respondent_label: 'Priscilla Vandermeer' },
    { category_id: 'conn', item_id: 'conn_2', value: 4, respondent_label: 'Tom Ng' },
  ];
  // get_shared_run_responses emits ''::text as respondent_label for identical answers.
  const shared = rows.map((r) => ({ ...r, respondent_label: '' }));

  it('computes a different response_hash for identical answers', () => {
    expect(responseHash(shared, '0.3.0')).not.toBe(responseHash(rows, '0.3.0'));
  });

  it('therefore computes a different inputs_hash', () => {
    const admin = reportInputsHash({ ...base, responseHash: responseHash(rows, '0.3.0') });
    const share = reportInputsHash({ ...base, responseHash: responseHash(shared, '0.3.0') });
    expect(share).not.toBe(admin);
  });

  it('pins that respondent_label is what makes them differ', () => {
    // Two row sets, identical in every field except respondent_label, must hash differently.
    // If a future edit drops respondent_label from the response-hash serialization (or
    // normalizes it away), this assertion fails first.
    const labeledX = rows.map((r) => ({ ...r, respondent_label: 'X' }));
    const labeledY = rows.map((r) => ({ ...r, respondent_label: 'Y' }));
    expect(responseHash(labeledX, '0.3.0')).not.toBe(responseHash(labeledY, '0.3.0'));
  });
});
