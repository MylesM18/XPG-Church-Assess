import { describe, it, expect } from 'vitest';
import { isValidElement, type ReactElement } from 'react';
import { AreaDossier } from '../../app/app/[churchId]/diagnosis/report/dossier';
import {
  Appendix,
  BookingCta,
  ReportBody,
  StaleMethodologyNotice,
  SharedStaleMethodologyNotice,
} from '../../app/app/[churchId]/diagnosis/report/shared';
import { bookingCta } from '@/lib/report/cta';
import { CoverCard, AreaTable } from '../../app/app/[churchId]/diagnosis/report/cover';
import { DependencyMap } from '../../app/app/[churchId]/diagnosis/report/system';
import { buildReportView, type SystemView } from '@/lib/report/view';
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
  readingLabel: 'Strong',
  insideIt: 'D3 sits 18 points below the rest of this area.',
  agreement: 'Tight — your leaders read this area the same way.',
  position: 'p62 of the benchmark prior',
  dependsOn: ['Systems (74) gates this', 'feeds Volunteers (48)'],
  watchFor: 'Belief runs 22 points ahead of the countable evidence.',
};

describe('AreaDossier', () => {
  it('renders the score and all six fields inline', () => {
    const tree = AreaDossier({ area });
    const text = textOf(tree);
    expect(text).toMatch(/Discipleship Pathway/);
    expect(text).toMatch(/73/);
    expect(text).not.toContain('N=');
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

// --- AreaTable: the Layer 1 cover table columns (Change #1: respondent N removed) ------------
//
// AreaTable is shared by the screen cover, the PDF, and the public /r/[shareToken] surface (all
// import it from cover.tsx). The respondent count is an internal statistic that no longer belongs
// on any report surface, so the table must show Area / Score / Band only — no N column.
describe('AreaTable', () => {
  it('shows Area, Score, and Band columns but not respondent N', () => {
    const tree = AreaTable({ areas: [area] });
    const headers = walk(tree).filter((n) => n.type === 'th').map((n) => textOf(n));
    expect(headers).toEqual(['Area', 'Score', 'Band']);
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

// --- DependencyMap: pill/arrow rows (Change #3) ----------------------------------------------
//
// DependencyMap is a plain function component (returns JSX, walkable by the helpers above), so it
// can be exercised directly. The redesign (spec §3): a colored status pill per group, a
// `From (score) → To (score)` arrow row carrying the gates/feeds verb as the PRIMARY line, the
// plain-English read as a muted subline, and the "why" statement as a smaller caption. When a
// whole group reads both_strong, the "nothing to flag here" read shows ONCE at group level, not
// once per row. Colour is a visual concern the owner verifies by glance; these guards pin the
// structure and copy — the folded-in Change-#2 leftover guard (group label "Both strong", not
// "Both holding") lives here too, since #3 is the change that gives DependencyMap its own tests.
const depSystem = {
  dependencies: [
    {
      from: 'sys', to: 'vol', kind: 'gate',
      statement: 'Systems capacity caps how many volunteers you can carry.',
      read: 'load_bearing',
      fromName: 'Systems', toName: 'Volunteers', fromScore: 74, toScore: 48,
      readSentence: 'Systems is strong — so Volunteers has room to grow into it.',
    },
    {
      from: 'gen', to: 'comm', kind: 'feed',
      statement: 'Generosity feeds the shared life of the community.',
      read: 'both_strong',
      fromName: 'Generosity', toName: 'Community', fromScore: 80, toScore: 78,
      readSentence: 'Both are strong — nothing to flag here.',
    },
    {
      from: 'gov', to: 'disc', kind: 'gate',
      statement: 'Governance sets the pace discipleship can sustain.',
      read: 'both_strong',
      fromName: 'Governance', toName: 'Discipleship', fromScore: 82, toScore: 79,
      readSentence: 'Both are strong — nothing to flag here.',
    },
  ],
  correlations: [],
} as unknown as SystemView;

describe('DependencyMap', () => {
  it('labels the both_strong group "Both strong", not "Both holding"', () => {
    const text = textOf(DependencyMap({ system: depSystem }));
    expect(text).toContain('Both strong');
    expect(text).not.toContain('Both holding');
  });

  it('renders each edge as a "From (score) → To (score)" arrow row carrying the gates/feeds verb', () => {
    const text = textOf(DependencyMap({ system: depSystem }));
    // primary line: names + scores + arrow + verb, on the actionable (load_bearing) row
    expect(text).toContain('Systems (74) gates → Volunteers (48)');
    // the plain-English read is a muted subline and the "why" statement a caption — both present
    expect(text).toContain('Systems is strong — so Volunteers has room to grow into it.');
    expect(text).toContain('Systems capacity caps how many volunteers you can carry.');
  });

  it('shows the both_strong read once at group level, not repeated on every row', () => {
    const text = textOf(DependencyMap({ system: depSystem }));
    // two both_strong edges, but the "nothing to flag here" read renders once at group level
    expect((text.match(/nothing to flag here/g) ?? []).length).toBe(1);
    // the per-edge "why" captions survive the group-level dedup
    expect(text).toContain('Generosity feeds the shared life of the community.');
    expect(text).toContain('Governance sets the pace discipleship can sustain.');
    // and both arrow rows still render, each with its own verb
    expect(text).toContain('Generosity (80) feeds → Community (78)');
    expect(text).toContain('Governance (82) gates → Discipleship (79)');
  });
});

// --- Appendix: aligned Area/Role/Score/Percentile table (Change #4) --------------------------
//
// The appendix used to be a prose <li> list ("{name} (stage 1): {score} · {pct}th pct"). The
// redesign (spec §4) makes it an aligned four-column table: Area · Role · Score · Percentile.
// Role reads "Stage {n}" for chain members (by their order in `stages`) and "Enabler" otherwise;
// a null cohort_percentile shows "—", not a blank. The signature stays
// Appendix({ categories, stages, benchmarkNote, dependencyNote }) (the notes test above pins it).
const appendixArgs = {
  categories: [
    { category_id: 'guest', name: 'Guest Experience', score: 55, cohort_percentile: 40 },
    { category_id: 'gen', name: 'Generosity', score: 80, cohort_percentile: null },
  ],
  stages: [{ category_id: 'guest' }],
  benchmarkNote: 'Benchmarks are provisional priors.',
  dependencyNote: 'Dependencies are a working model.',
} as unknown as Parameters<typeof Appendix>[0];

describe('Appendix table', () => {
  it('renders an aligned Area / Role / Score / Percentile table', () => {
    const headers = walk(Appendix(appendixArgs))
      .filter((n) => n.type === 'th')
      .map((n) => textOf(n));
    expect(headers).toEqual(['Area', 'Role', 'Score', 'Percentile']);
  });

  it('labels chain members "Stage N", everything else "Enabler", and shows — for a null percentile', () => {
    const text = textOf(Appendix(appendixArgs));
    expect(text).toContain('Stage 1'); // guest is stages[0]
    expect(text).toContain('Enabler'); // gen is not a chain member
    expect(text).toContain('40th pct'); // guest's percentile
    expect(text).toContain('—'); // gen's null percentile renders an em dash, not a blank
    // the two disclosure caveats still render beneath the table (signature unchanged)
    expect(text).toContain('Benchmarks are provisional priors.');
    expect(text).toContain('Dependencies are a working model.');
  });
});

// --- BookingCta: the report's booking call-to-action (Change #5) ------------------------------
//
// One shared source of truth (lib/report/cta.ts) rendered on all three surfaces (spec §5).
// BookingCta is a plain function component; the anchor lives in its body, which walk()/textOf()
// only reach when the component is invoked directly (not through ReportBody, which never descends
// into a nested component's body). So the link itself is asserted on BookingCta(); its PLACEMENT
// (present, before the Appendix) is asserted on ReportBody via element types, which is all the
// walk of a fragment can see.
describe('BookingCta', () => {
  it('renders an external booking link carrying the button label and heading', () => {
    const tree = BookingCta();
    const cta = walk(tree)
      .filter((n) => n.type === 'a')
      .find((a) => (a.props as { href?: string }).href === bookingCta.url);
    expect(cta, 'expected an <a> linking to the booking URL').toBeDefined();
    expect(textOf(cta)).toContain(bookingCta.buttonLabel);
    // opens in a new tab, safely (no reverse-tabnabbing / referrer leak)
    expect((cta!.props as { target?: string }).target).toBe('_blank');
    expect((cta!.props as { rel?: string }).rel).toContain('noopener');
    expect(textOf(tree)).toContain(bookingCta.heading);
  });
});

describe('ReportBody booking CTA placement', () => {
  it('renders the booking CTA on the fresh report, before the appendix', () => {
    const fresh = ReportBody({ storedVersion: '0.2.0', currentVersion: '0.2.0', view, churchId: 'c-1' });
    const types = collectTypes(fresh);
    expect(types).toContain(BookingCta);
    expect(types.indexOf(BookingCta)).toBeLessThan(types.indexOf(Appendix));
  });
});
