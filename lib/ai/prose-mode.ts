// The ONE gate every model path reads: the report block in app/app/[churchId]/actions.ts
// (generateDiagnosis), regenerateReport, and the diagnosis page's Generate / auto-generate
// affordance. Server only — never import from a client component.
//
// History: each of those sites used to inline `(process.env.PROSE_MODE ?? 'fallback') !==
// 'fallback'` — default OFF — and OPENAI_API_KEY was read only downstream of that gate (lib/ai/
// sections.ts, lib/ai/prose.ts). So a Vercel Production with the key set but PROSE_MODE unset
// never called OpenAI, never rendered the button, and never logged a reason. Key-present now
// means on; PROSE_MODE is an optional override in either direction.
//
// Values are normalised (trimmed, lower-cased) because this is a kill switch: `Fallback` or a
// trailing space from a dashboard paste must not turn an opt-out into silent spend. The key is
// tested exactly the way the openai SDK reads it (`.trim() || undefined`) so the gate and the
// client can never disagree about whether a key exists.
//
// Never logs the key — or PROSE_MODE's value, in case what was pasted there was a secret. Warns
// ONCE PER MESSAGE per process, naming which reason applies — the tag is `[prose-mode]`,
// deliberately NOT `[report]`, because tests/report/generate-report-behavior.test.ts pins that
// "AI off" logs nothing under `[report]`.

/** Warn-once latch, per message: `proseEnabled()` runs on every diagnosis view and generation. */
const warned = new Set<string>()

function warnOnce(message: string): void {
  if (warned.has(message)) return
  warned.add(message)
  console.warn(message)
}

/**
 * Whether the AI prose / report model paths are on.
 *
 *   PROSE_MODE=ai            ⇒ true, whatever the key (lib/ai/sections.ts warns if it's absent —
 *                              note this does NOT enable AI without a key; every section falls back)
 *   PROSE_MODE=fallback      ⇒ false — explicit opt-out, even with a key
 *   PROSE_MODE unset / ''    ⇒ true iff OPENAI_API_KEY is non-empty after trimming
 *   any other PROSE_MODE     ⇒ treated like unset (key decides) — a typo must not silently switch
 *                              the product off — but it is SAID, once, so an operator who typed
 *                              `off` to disable spend finds out
 *   (all comparisons after trim + toLowerCase)
 */
export function proseEnabled(): boolean {
  const mode = (process.env.PROSE_MODE ?? '').trim().toLowerCase()
  if (mode === 'ai') return true
  if (mode === 'fallback') {
    warnOnce('[prose-mode] AI prose disabled: PROSE_MODE=fallback')
    return false
  }
  if (mode !== '') {
    warnOnce(
      '[prose-mode] PROSE_MODE is set to an unrecognised value (expected "ai" or "fallback"); treating it as unset — the key decides',
    )
  }
  if ((process.env.OPENAI_API_KEY ?? '').trim() !== '') return true
  warnOnce('[prose-mode] AI prose disabled: OPENAI_API_KEY absent')
  return false
}
