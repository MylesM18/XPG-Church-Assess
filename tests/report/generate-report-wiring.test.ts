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
    // R1c: anchored on the CALL SITE ('reportInputs({') rather than the bare identifier,
    // which would resolve to the top-of-file import and silently fail to catch the mutation
    // that moves the call below the cache check (recon G3(b): proven empirically to be a
    // false-negative tripwire against the bare-identifier version of this assertion).
    //
    // FIX ROUND 1: re-anchored from 'reportInputsHash({' to 'reportInputs({' — Task 2 (plan 4)
    // extracted the hash computation into lib/report/inputs-hash.ts's reportInputs(), so the old
    // needle no longer occurs anywhere in this file. Left unguarded, indexOf('reportInputsHash({')
    // returns -1, and -1 < <any positive index> passes unconditionally — a vacuous pass that
    // reports coverage that does not exist (Lesson 6: -1 is a fail-open sentinel on this plan's
    // explicit tripwire list). Both anchors are now guarded as their own assertions before the
    // ordering comparison (Lesson 7: an ordering assertion must guard BOTH anchors), so a future
    // disappearance of either needle fails loudly, naming which one vanished, instead of silently
    // passing.
    const inputsIdx = src.indexOf('reportInputs({');
    const reportsIdx = src.indexOf("from('reports')");
    expect(inputsIdx).toBeGreaterThan(-1);
    expect(reportsIdx).toBeGreaterThan(-1);
    expect(inputsIdx).toBeLessThan(reportsIdx);
  });

  it('builds reflection rows via the shared reflectionRowsFor extraction, from raw, not responses', () => {
    // Task 2 (plan 4): the inline respondent_key mapping this assertion used to pin was extracted
    // to lib/report/inputs-hash.ts's reflectionRowsFor (Task 1), so it no longer appears as source
    // text in this file — the respondent_user_id ?? respondent_label precedence is now pinned
    // directly at the module level by tests/report/inputs-hash-parity.test.ts ("keys on
    // respondent_user_id ?? respondent_label"). What THIS file can still usefully pin is the call
    // site: that generation feeds the extraction the raw RPC rows (`raw`), never the
    // reflection-stripped `responses` (tests/outreach/ai-exclusion.test.ts separately pins that
    // `responses` stays reflection-free).
    const block = src.slice(src.indexOf('const reflectionRows'), src.indexOf('await clusterThemes('));
    expect(block).toContain('reflectionRowsFor(raw ?? [])');
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
