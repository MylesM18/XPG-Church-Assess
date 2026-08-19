// The ONE gate every model path reads: the M5b prose block and the report block in
// app/app/[churchId]/actions.ts (generateDiagnosis), regenerateReport, and the diagnosis page's
// Generate / auto-generate affordance. Server only — never import from a client component.
//
// History: each of those four sites used to inline `(process.env.PROSE_MODE ?? 'fallback') !==
// 'fallback'` — default OFF — and OPENAI_API_KEY was read only downstream of that gate (lib/ai/
// sections.ts, lib/ai/prose.ts). So a Vercel Production with the key set but PROSE_MODE unset
// never called OpenAI, never rendered the button, and never logged a reason. Key-present now
// means on; PROSE_MODE is an optional override in either direction.
//
// Never logs the key. Warns ONCE per process when it returns false, naming which of the two
// reasons applies — the tag is `[prose-mode]`, deliberately NOT `[report]`, because
// tests/report/generate-report-behavior.test.ts pins that "AI off" logs nothing under `[report]`.

/** Warn-once latch: `proseEnabled()` is called on every diagnosis view and every generation. */
let warned = false

function warnOnce(message: string): void {
  if (warned) return
  warned = true
  console.warn(message)
}

/**
 * Whether the AI prose / report model paths are on.
 *
 *   PROSE_MODE=ai            ⇒ true, whatever the key (lib/ai/sections.ts warns if it's absent)
 *   PROSE_MODE=fallback      ⇒ false — explicit opt-out, even with a key
 *   PROSE_MODE unset / ''    ⇒ true iff OPENAI_API_KEY is non-empty
 *   any other PROSE_MODE     ⇒ treated exactly like unset (key decides); not an error, so a
 *                              typo degrades to the safe key-present default rather than to
 *                              silent-off
 */
export function proseEnabled(): boolean {
  const mode = process.env.PROSE_MODE ?? ''
  if (mode === 'ai') return true
  if (mode === 'fallback') {
    warnOnce('[prose-mode] AI prose disabled: PROSE_MODE=fallback')
    return false
  }
  if (process.env.OPENAI_API_KEY) return true
  warnOnce('[prose-mode] AI prose disabled: OPENAI_API_KEY absent (set it, or PROSE_MODE=ai)')
  return false
}
