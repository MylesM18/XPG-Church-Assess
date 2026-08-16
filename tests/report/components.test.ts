import { describe, it, expect } from 'vitest';
import { isValidElement, type ReactElement } from 'react';
import { SharedStaleMethodologyNotice } from '../../app/app/[churchId]/diagnosis/report/shared';

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
