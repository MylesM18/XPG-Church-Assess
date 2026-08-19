import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const file = readFileSync('app/app/[churchId]/actions.ts', 'utf8');

// FINAL REVIEW: actions.ts holds TWO near-identical report blocks — generateDiagnosis and the
// newer regenerateReport (plan 5, Task 7). Every assertion in this file scanned the whole file,
// so each silently re-targeted regenerateReport's copy: gutting generateDiagnosis's
// composeReport call was proven to leave this suite green. Scope once, here.
// The start boundary is guarded: indexOf's -1 sentinel would otherwise re-widen the slice back to
// the whole file, reinstating the exact bug this fixes.
const START = 'export async function generateDiagnosis';
const startIdx = file.indexOf(START);
if (startIdx === -1) {
  throw new Error(
    'generate-report-wiring: cannot scope to generateDiagnosis — its declaration is gone. ' +
      'Re-anchor this slice before trusting any assertion in this file.',
  );
}
// The END boundary is the NEXT top-level export after generateDiagnosis (regenerateReport today),
// or end-of-file when generateDiagnosis is the file's last export. Deliberately NOT a fixed
// indexOf('export async function regenerateReport'): that is brittle in the opposite direction —
// a behaviour-neutral reorder putting regenerateReport ABOVE generateDiagnosis yields
// endIdx < startIdx, which either throws or (unguarded) produces a backwards, empty slice. Both
// are false failures on a pure move. Scanning forward from generateDiagnosis is order-independent
// and cannot silently widen: the first test below asserts the sibling is excluded either way.
const bodyOffset = startIdx + START.length;
const nextExportRel = file.slice(bodyOffset).indexOf('\nexport ');
const endIdx = nextExportRel === -1 ? file.length : bodyOffset + nextExportRel;
const src = file.slice(startIdx, endIdx);

describe('the report generation block', () => {
  it('scopes every assertion to generateDiagnosis, not the sibling regenerateReport', () => {
    // The guard for the scoping above: if the slice ever re-widens (a rename, a reorder, a third
    // report block), every OTHER assertion in this file quietly starts reading regenerateReport's
    // near-identical copy and stops proving anything about generation. This test fails loudly
    // first. Positive AND negative: the positive anchor proves we captured generateDiagnosis's
    // body (save_diagnosis is generation-only — regenerate never writes a diagnosis), the
    // negative proves the sibling is excluded.
    expect(src).toContain("await supabase.rpc('save_diagnosis'");
    expect(src).not.toContain('export async function regenerateReport');
  });

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

  it('is gated by proseEnabled(), the same gate as the prose block', () => {
    // R2: count EQUALITY on the gate `if` line itself, not a loose >= presence check on the bare
    // identifier — the import line and comments carry `proseEnabled` too. Counting the full gate
    // line is non-vacuous in both directions: deleting either gate fails, and a third ungated
    // block fails too. Since fix/prose-auto-generate-on-view the gate is `proseEnabled()`
    // (lib/ai/prose-mode.ts: key-present ⇒ on, PROSE_MODE optional override), never an inline
    // `process.env.PROSE_MODE` read.
    const gates = src.match(/if \(proseEnabled\(\)\) \{/g);
    expect(gates?.length).toBe(2); // the M5b prose block, and this task's report block
    expect(src.match(/process\.env\.PROSE_MODE/g) ?? []).toHaveLength(0);
  });

  it('is wrapped in its own try/catch, separate from the prose block', () => {
    // Neither best-effort block may break the other, the committed diagnosis, or the redirect.
    //
    // FINAL REVIEW: EQUALITY, not a >= threshold. actions.ts holds three `catch (err)` in total
    // (generation's prose block, generation's report block, regenerateReport's) — so a whole-file
    // `>= 2` stayed green with generation's ENTIRE report try/catch deleted, the exact regression
    // this test exists to catch. Scoped to generateDiagnosis the true count is 2, and equality is
    // non-vacuous in both directions: deleting either block fails, and a THIRD bare try/catch
    // added inside generation — a new unguarded swallow of an error nobody chose to swallow —
    // fails too, which a threshold would wave through.
    expect(src.match(/catch \(err\)/g)?.length).toBe(2);
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
