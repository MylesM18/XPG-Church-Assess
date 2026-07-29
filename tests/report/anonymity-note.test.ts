import { describe, it, expect } from 'vitest';
import { isValidElement } from 'react';
import { AnonymityNote } from '../../components/anonymity-note';

/** Every string the tree would render, concatenated. Mirrors components.test.ts's textOf. */
function textOf(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  if (isValidElement(node)) return textOf((node.props as { children?: unknown }).children);
  return '';
}

describe('AnonymityNote', () => {
  it('renders the approved privacy copy — the lead and the "never shown" promise', () => {
    const text = textOf(AnonymityNote({}));
    expect(text).toContain('Your answers are private.');
    expect(text).toContain('never shown to anyone');
    expect(text).toContain('combined results');
    expect(text).toContain('never who said what.');
  });

  it('appends a caller-supplied className without dropping the base muted styling', () => {
    const el = AnonymityNote({ className: 'mt-2' });
    const cls = (el.props as { className?: string }).className ?? '';
    expect(cls).toContain('font-body');
    expect(cls).toContain('text-ink-soft');
    expect(cls).toContain('mt-2');
  });
});
