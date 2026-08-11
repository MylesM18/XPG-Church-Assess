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
      "Nothing in your pipeline is broken — but something underneath it is holding you back. Let's fix the foundation before you build on it.",
    );
  });
});

describe('copy.yaml', () => {
  it('has the seven blocks and four inserts', () => {
    expect(Object.keys(copy.blocks).sort()).toEqual(
      ['blind_spot', 'cost', 'do_not_work_on', 'evidence', 'next_step', 'verdict', 'verdict_no_constraint'],
    );
    expect(Object.keys(copy.inserts).sort()).toEqual(['benchmark_note', 'dependency_note', 'dispersion', 'gating']);
  });
  it('verdict references the primary-name token', () => {
    expect(copy.blocks.verdict).toContain('{primary_name}');
  });
  it('the benchmark note states scores are vs provisional priors', () => {
    expect(copy.inserts.benchmark_note!.toLowerCase()).toContain('prior');
  });
  it('the dependency note discloses a working model, not an observed causal finding', () => {
    expect(copy.inserts.dependency_note).toBeTruthy();
    const note = (copy.inserts.dependency_note ?? '').toLowerCase();
    expect(note).toContain('working model');
    expect(note).toContain('not an observed causal finding');
  });
  it('contains no em-dashes anywhere (register rule)', () => {
    const all = [...Object.values(copy.blocks), ...Object.values(copy.inserts)].join('\n');
    expect(all).not.toContain('—'); // em-dash
  });
});
