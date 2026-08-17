import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { OffersSchema, CopySchema } from '../../lib/methodology/schema';

const offersRaw = readFileSync(fileURLToPath(new URL('../../methodology/offers.yaml', import.meta.url)), 'utf8');
const copyRaw = readFileSync(fileURLToPath(new URL('../../methodology/copy.yaml', import.meta.url)), 'utf8');
const offers = OffersSchema.parse(yaml.load(offersRaw));
const copy = CopySchema.parse(yaml.load(copyRaw));

describe('offers.yaml', () => {
  it('has the four stage offers plus generosity and no_constraint', () => {
    expect(Object.keys(offers.stages).sort()).toEqual(['conn', 'disc', 'guest', 'vol']);
    expect(offers.no_constraint.type).toBe('capacity');
    expect(offers.generosity.depth.call_type).toBe('Generosity Culture & Discipleship Review');
  });
  it('keeps the guest hook verbatim', () => {
    expect(offers.stages.guest!.hook).toBe("You may be paying for guests you aren't keeping.");
  });
  it('keeps the foundation hook verbatim', () => {
    expect(offers.foundation.hook).toBe(
      "Your ministry stages are doing their part, but something underneath them is holding you back. Let's strengthen the foundation before you build higher on it.",
    );
  });
});

describe('copy.yaml', () => {
  it('has the seven blocks and two inserts', () => {
    expect(Object.keys(copy.blocks).sort()).toEqual(
      ['blind_spot', 'cost', 'do_not_work_on', 'evidence', 'next_step', 'verdict', 'verdict_no_constraint'],
    );
    // benchmark_note / dependency_note went with the appendix on 2026-08-16 — they rendered
    // only there. An equality assertion, not a subset check, so re-adding an orphan key fails.
    expect(Object.keys(copy.inserts).sort()).toEqual(['dispersion', 'gating']);
  });
  it('verdict references the primary-name token', () => {
    expect(copy.blocks.verdict).toContain('{primary_name}');
  });
  it('contains no em-dashes anywhere (register rule)', () => {
    const all = [...Object.values(copy.blocks), ...Object.values(copy.inserts)].join('\n');
    expect(all).not.toContain('—'); // em-dash
  });
});
