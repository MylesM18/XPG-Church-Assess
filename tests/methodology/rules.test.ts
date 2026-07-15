import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { RulesSchema } from '../../lib/methodology/schema';

const raw = readFileSync(fileURLToPath(new URL('../../methodology/rules.yaml', import.meta.url)), 'utf8');
const r = RulesSchema.parse(yaml.load(raw));

describe('rules.yaml', () => {
  it('chain is the five stages in order', () => {
    expect(r.chain).toEqual(['guest','conn','disc','vol','gen']);
  });
  it('enabler gates match the frameworks doc', () => {
    expect(r.enablers.gov!.gates).toBe('all');
    expect(r.enablers.comm!.gates).toEqual(['guest','conn']);
    expect(r.enablers.sys!.gates).toEqual(['vol','disc']);
  });
  it('generosity split is GEN1 breadth vs GEN2/GEN4 depth', () => {
    expect(r.generosity.breadth_items).toEqual(['GEN1']);
    expect(r.generosity.depth_items).toEqual(['GEN2','GEN4']);
  });
  it('thresholds are the locked v0.1 values', () => {
    expect(r.thresholds).toMatchObject({ break: 45, severe: 25, gate: 45, blind_spot_gap: 20, dispersion: 2.0 });
  });
  it('confidence knobs present', () => {
    expect(r.confidence.low_response_penalty).toBe(0.15);
    expect(r.confidence.floor).toBe(0.4);
  });
});
