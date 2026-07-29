import { describe, it, expect } from 'vitest';
import { isValidElement, type ReactElement } from 'react';
import { AreaDossier } from '../../app/app/[churchId]/diagnosis/report/dossier';
import {
  Appendix,
  ReportBody,
  StaleMethodologyNotice,
  SharedStaleMethodologyNotice,
} from '../../app/app/[churchId]/diagnosis/report/shared';
import { CoverCard } from '../../app/app/[churchId]/diagnosis/report/cover';
import { buildReportView } from '@/lib/report/view';
import { fallbackProse } from '@/lib/ai/fallback';
import { diagnose } from '../../lib/engine';
import { loadFixtureMethodology, answers } from '../engine/helpers';

/** Flattens the element tree a plain function component returns. No DOM, no renderer. */
function walk(node: unknown): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (!isValidElement(node)) return [];
  const children = (node.props as { children?: unknown }).children;
  return [node, ...walk(children)];
}

/** Every string the tree would render, concatenated in order. */
function textOf(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  if (isValidElement(node)) return textOf((node.props as { children?: unknown }).children);
  return '';
}

/** Every element type (component function or DOM tag string) present in the tree. */
function collectTypes(node: unknown): unknown[] {
  return walk(node).map((n) => n.type);
}

const area = {
  category_id: 'disc',
  name: 'Discipleship Pathway',
  score: 73,
  n: 14,
  reading: 'Discipleship is holding but not compounding.',
  readingLabel: 'Holding',
  insideIt: 'D3 sits 18 points below the rest of this area.',
  agreement: 'Tight — your leaders read this area the same way.',
  position: 'p62 of the benchmark prior',
  dependsOn: ['Systems (74) gates this', 'feeds Volunteers (48)'],
  watchFor: 'Belief runs 22 points ahead of the countable evidence.',
};

describe('AreaDossier', () => {
  it('renders the score, N, and all six fields inline', () => {
    const tree = AreaDossier({ area });
    const text = textOf(tree);
    expect(text).toMatch(/Discipleship Pathway/);
    expect(text).toMatch(/73/);
    expect(text).toMatch(/N=14/);
    for (const label of ['Reading', 'Inside it', 'Agreement', 'Position', 'Depends on', 'Watch for']) {
      expect(text).toContain(label);
    }
    // Values, not just labels: a field() that rendered <dt>{label}</dt> and dropped the <dd>
    // entirely would still pass every assertion above — the label loop only proves the LABEL
    // text is present, never that its value is. Pin all six values explicitly.
    expect(text).toContain('Discipleship is holding but not compounding.'); // reading
    expect(text).toContain('D3 sits 18 points below the rest of this area.'); // insideIt
    expect(text).toContain('Tight — your leaders read this area the same way.'); // agreement
    expect(text).toContain('p62 of the benchmark prior'); // position
    expect(text).toContain('Systems (74) gates this · feeds Volunteers (48)'); // dependsOn, joined
    expect(text).toContain('Belief runs 22 points ahead of the countable evidence.'); // watchFor
    // inline, not collapsed — no accordion element anywhere in the tree (spec §7.8)
    expect(walk(tree).some((n) => n.type === 'details')).toBe(false);
  });

  it('still renders all six labels when three fields are unavailable', () => {
    const text = textOf(AreaDossier({ area: { ...area, insideIt: null, agreement: null, watchFor: null } }));
    for (const label of ['Reading', 'Inside it', 'Agreement', 'Position', 'Depends on', 'Watch for']) {
      expect(text).toContain(label);
    }
    // Occurrence-count equality, not a presence check: exactly the three nulled fields
    // (insideIt, agreement, watchFor) must render the explicit unavailability line — a field()
    // that dropped a <dd> silently (rendering neither the value nor "Not available...") would
    // pass the label loop above but fail this count.
    const unavailableCount = (text.match(/Not available for this area\./g) ?? []).length;
    expect(unavailableCount).toBe(3);
    // And the three fields that were NOT nulled must still show their real values, not a blank
    // and not the unavailability line either.
    expect(text).toContain('Discipleship is holding but not compounding.'); // reading — untouched
    expect(text).toContain('p62 of the benchmark prior'); // position — untouched
    expect(text).toContain('Systems (74) gates this · feeds Volunteers (48)'); // dependsOn — untouched
  });
});

// --- ReportBody: the stale-vs-fresh branch (spec §5.4 / §9.6, Step 6) ------------------------
//
// A fully-populated ReportView built from a fresh diagnose(), the same construction
// tests/report/view.test.ts's "ReportView shape" describe block uses — all 8 areas, all 13
// dependency edges, real chain-walk stages — so this exercises ReportBody's fresh branch
// against the shape it actually receives in production, not a hand-rolled partial object.
const ALL = ['guest', 'conn', 'disc', 'vol', 'gen', 'gov', 'comm', 'sys'];
const fixtureMethodology = loadFixtureMethodology();

const varied = (id: string, base: number): Record<string, number> =>
  Object.fromEntries(
    fixtureMethodology.questions.categories
      .find((c) => c.id === id)!
      .items.map((it, i) => [it.id, i === 2 ? base - 3 : base]),
  );

const d = diagnose(
  ALL.flatMap((id) => [
    ...answers(fixtureMethodology, id, varied(id, id === 'vol' ? 4 : 8), 'Pastor', 'u-1'),
    ...answers(fixtureMethodology, id, varied(id, id === 'vol' ? 5 : 7), 'Elder', 'u-2'),
  ]),
  fixtureMethodology,
  { attendance_band: '100_249' },
);
const view = buildReportView(d, fallbackProse(d, fixtureMethodology), fixtureMethodology, { audience: 'screen' });

describe('ReportBody', () => {
  it('shows the regenerate prompt for a 0.1.0 payload instead of a half-empty report', () => {
    const stale = ReportBody({
      storedVersion: '0.1.0',
      currentVersion: '0.2.0',
      view,          // a fully-populated ReportView built from a fresh diagnose()
      churchId: 'c-1',
    });
    const types = collectTypes(stale);
    expect(types).toContain(StaleMethodologyNotice);
    expect(types).not.toContain(CoverCard);
    expect(textOf(stale)).toMatch(/predates the current methodology/i);
    expect(textOf(stale)).not.toMatch(/OVERALL CHURCH HEALTH/i);
  });

  it('renders the report, not the prompt, when the versions match', () => {
    const fresh = ReportBody({
      storedVersion: '0.2.0',
      currentVersion: '0.2.0',
      view,
      churchId: 'c-1',
    });
    const types = collectTypes(fresh);
    expect(types).toContain(CoverCard);
    expect(types).not.toContain(StaleMethodologyNotice);
  });
});

// --- SharedStaleMethodologyNotice: the public share page's stale-branch heading (Finding 2) --
//
// app/r/[shareToken]/page.tsx's stale branch used to render a literal <h2> inline (to dodge
// tests/a11y/shared-report-heading.test.ts's static <h1> count), leaving that branch's document
// outline with no <h1> at all — the exact condition the guard exists to prevent. Extracting the
// notice into its own component, the same way StaleMethodologyNotice already is, fixes the
// runtime outline AND keeps the guard's static count correct (0 literal <h1>s in page.tsx
// either way — see shared.tsx's doc comment on this component). This describe block pins the
// runtime half no source-reading test can see: that the component this page now renders
// actually contains an <h1>, at level 1, not level 2.
describe('SharedStaleMethodologyNotice', () => {
  it('renders a real <h1>, not an <h2> — the public share page has no other heading in this branch', () => {
    const tree = SharedStaleMethodologyNotice();
    const types = collectTypes(tree);
    expect(types, 'expected an <h1> in the tree').toContain('h1');
    expect(types, 'must not be demoted back to <h2>').not.toContain('h2');
    expect(textOf(tree)).toMatch(/This shared report isn.t ready yet/);
  });
});

// --- Appendix: the benchmark + dependency disclosure caveats (Task 10, b1) -------------------
//
// The ReportBody tests above never see Appendix's caveat <p>s: walk()/textOf() descend only an
// element's `children`, and Appendix receives both notes as PROPS, so its body is never invoked
// by them (which is also why adding the second caveat breaks no existing test). This calls the
// component directly so its rendered text is actually asserted — both notes must be present.
describe('Appendix', () => {
  it('renders both the benchmark note and the dependency disclosure note', () => {
    const tree = Appendix({
      categories: view.appendix.categories,
      stages: view.stages,
      benchmarkNote: 'Benchmarks are provisional priors.',
      dependencyNote: 'Dependencies are a working model.',
    });
    const text = textOf(tree);
    expect(text).toContain('Benchmarks are provisional priors.');
    expect(text).toContain('Dependencies are a working model.');
  });
});
