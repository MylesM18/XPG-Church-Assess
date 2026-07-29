// Source-reading tripwire (node env, no DOM): asserts on file structure, not rendered output —
// same approach as tests/report/route-call-ordering.test.ts (readFileSync + comment-stripping +
// string assertions on the source text).
//
// CT-2(c) "re-derive at render": a stored diagnoses.payload can be scored under an OLD
// methodology. All three report surfaces must STOP trusting `.payload` for the view and instead
// re-derive the Diagnosis from the run's stored RESPONSES under the CURRENT methodology
// (deriveDiagnosisForRun). This test pins, per route, that:
//   (a) it calls deriveDiagnosisForRun( at all;
//   (b) it fetches the correct completed-run responses RPC (get_completed_run_responses for the
//       two authenticated routes; get_shared_run_responses for the anon share route);
//   (c) it no longer contains `payload as Diagnosis` — the view no longer trusts the cached
//       payload. This last assertion is the PRE-VERIFIED MUTATION TARGET: reverting any route to
//       `const diagnosis = X.payload as Diagnosis` for the view re-introduces the exact substring
//       and fails the route's own assertion below.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const read = (...p: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8')
/** Strip comments so a doc comment mentioning these tokens cannot satisfy or break a match. */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

const ROUTES = [
  {
    label: 'app/app/[churchId]/diagnosis/page.tsx',
    segs: ['app', 'app', '[churchId]', 'diagnosis', 'page.tsx'],
    rpc: 'get_completed_run_responses',
  },
  {
    label: 'app/api/report/[runId]/pdf/route.ts',
    segs: ['app', 'api', 'report', '[runId]', 'pdf', 'route.ts'],
    rpc: 'get_completed_run_responses',
  },
  {
    label: 'app/r/[shareToken]/page.tsx',
    segs: ['app', 'r', '[shareToken]', 'page.tsx'],
    rpc: 'get_shared_run_responses',
  },
] as const

describe('report routes re-derive the Diagnosis from responses, never trusting the cached payload (CT-2c)', () => {
  for (const { label, segs, rpc } of ROUTES) {
    it(`${label} re-derives via deriveDiagnosisForRun + ${rpc} and drops "payload as Diagnosis"`, () => {
      const source = strip(read(...segs))

      expect(source, `${label} must re-derive the Diagnosis at render`).toContain('deriveDiagnosisForRun(')

      expect(source, `${label} must fetch the completed-run responses via ${rpc}`).toContain(rpc)

      // The mutation target. The view must be built from the re-derived Diagnosis, never from the
      // cached payload. Reverting to `const diagnosis = X.payload as Diagnosis` fails here.
      expect(
        source.includes('payload as Diagnosis'),
        `${label} still casts a cached payload with "payload as Diagnosis" — the view must be ` +
          `re-derived from responses (deriveDiagnosisForRun), not read from diagnoses.payload (CT-2c).`,
      ).toBe(false)
    })
  }
})
