import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync('app/app/[churchId]/actions.ts', 'utf8');

describe('the report generation block', () => {
  it('sits after save_diagnosis', () => {
    // R1a: anchored on the CALL SITE ('await composeReport(') rather than the bare identifier
    // 'composeReport', which would resolve to this task's new top-of-file import instead.
    // FIX ROUND A / I1: the LEFT operand is now also anchored on its call site
    // ("await supabase.rpc('save_diagnosis'") instead of the bare identifier 'save_diagnosis',
    // whose first occurrence is a COMMENT 48 lines above the real RPC call — that let a mutation
    // hoisting the whole report block above the RPC pass this test. Both operands are guarded
    // against -1 (indexOf's no-match sentinel), since -1 < anything is vacuously true.
    const saveIdx = src.indexOf("await supabase.rpc('save_diagnosis'");
    const composeIdx = src.indexOf('await composeReport(');
    expect(saveIdx).toBeGreaterThan(-1);
    expect(composeIdx).toBeGreaterThan(-1);
    expect(saveIdx).toBeLessThan(composeIdx);
  });

  it('is gated by PROSE_MODE, the same gate as the prose block', () => {
    // R2: count EQUALITY on the gate expression itself, not a loose >= presence check on the
    // bare string 'PROSE_MODE' — the unmodified file already contains that string twice (an
    // M5b comment plus the M5b `if`), so a >=2 threshold would already be satisfied before this
    // task writes a line. Counting the full gate `if` line is non-vacuous in both directions.
    const gates = src.match(/if \(\(process\.env\.PROSE_MODE \?\? 'fallback'\) !== 'fallback'\) \{/g);
    expect(gates?.length).toBe(2); // the M5b prose block, and this task's report block
  });

  it('is wrapped in its own try/catch, separate from the prose block', () => {
    // Neither best-effort block may break the other, the committed diagnosis, or the redirect.
    expect(src.match(/catch \(err\)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('computes the inputs hash before the cache check', () => {
    // R1c: anchored on the CALL SITE ('reportInputsHash({') rather than the bare identifier,
    // which would resolve to the top-of-file import and silently fail to catch the mutation
    // that moves the call below the cache check (recon G3(b): proven empirically to be a
    // false-negative tripwire against the bare-identifier version of this assertion).
    expect(src.indexOf('reportInputsHash({')).toBeLessThan(src.indexOf("from('reports')"));
  });

  it('builds reflection rows keyed on respondent_id, never respondent_label', () => {
    // respondent_label is display-only and can collide across two people; counting on it would
    // undercount and weaken the k>=3 gate.
    // R1b: slice end anchored on the CALL SITE ('await clusterThemes(') rather than the bare
    // identifier 'clusterThemes', which resolves to the top-of-file import — BEFORE
    // 'const reflectionRows' in source order, which makes slice(start > end) return '' and the
    // `toContain` assertion fail unconditionally regardless of the code underneath.
    const block = src.slice(src.indexOf('const reflectionRows'), src.indexOf('await clusterThemes('));
    expect(block).toContain('respondent_key: r.respondent_user_id ?? r.respondent_label');
    expect(block).not.toMatch(/respondent_key:\s*r\.respondent_label\b/);
  });

  it('passes a knownLabels source, never a bare array', () => {
    // R4: the brief's two-part regex is false against its own correct implementation — the real
    // call order is knownLabels(...) BEFORE clusterThemes(...) (the reverse of what the brief's
    // ordering regex demanded), and the code correctly uses ES6 shorthand `labelSource,` rather
    // than the longhand `labelSource: labelSource` the brief's second regex required. Keep only
    // the cheap, true source anchor here; the real property (a LabelSource, never a bare array)
    // is proven behaviorally in tests/report/generate-report-behavior.test.ts.
    expect(src).toMatch(/const labelSource = knownLabels\(/);
  });

  it('persists a null clustering result differently from an empty one', () => {
    // null = the task failed (S8 falls back, no themes persisted); [] = determinate, persist.
    expect(src).toContain('themes === null');
  });

  it('calls save_report with the four-argument signature', () => {
    expect(src).toMatch(/save_report[\s\S]{0,200}p_inputs_hash[\s\S]{0,200}p_methodology_version[\s\S]{0,200}p_payload/);
  });

  // R3: 'never widens the raw-row mapping' assertion DELETED, not replaced. Recon E9: the
  // brief's non-greedy regex matches the PRE-EXISTING `Response[]` map (lines 42-48 above) and
  // passes identically with or without this task's change — it proves nothing about this task's
  // code. tests/outreach/ai-exclusion.test.ts already pins that map far more strongly (mapBody()
  // extraction + "does not spread the raw row" + "does not reference reflection"), and Step 5 of
  // this task runs exactly that file. Adding a second, weaker source-regex over the same
  // property is how the vacuity was introduced in the first place.
});
