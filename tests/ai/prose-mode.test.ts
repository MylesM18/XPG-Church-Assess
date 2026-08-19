import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `proseEnabled()` is the ONE gate every model path reads (M5b prose block, report block,
 * regenerateReport, and the diagnosis page's Generate/auto-generate affordance). Before it, all
 * four sat behind `(process.env.PROSE_MODE ?? 'fallback') !== 'fallback'` — default OFF — and
 * OPENAI_API_KEY was read only after that gate, so a production with the key but no PROSE_MODE
 * never called the model, never rendered the button, and never logged why.
 *
 * Truth table pinned here:
 *   PROSE_MODE=ai                    ⇒ true  (key or not — sections.ts warns about a missing key)
 *   PROSE_MODE unset/empty/other + key ⇒ true
 *   PROSE_MODE unset/empty/other, no key ⇒ false + ONE `[prose-mode]` warn per process
 *   PROSE_MODE=fallback              ⇒ false + ONE `[prose-mode]` warn per process (key or not)
 *
 * The warn-once latch is module state, so every case here goes through `vi.resetModules()` +
 * a dynamic import (mirroring tests/report/observability.test.ts's handling of sections.ts's
 * `missingKeyWarned`). Env is set with the delete-and-restore pattern rather than
 * `vi.stubEnv('X', undefined)`, which does not reliably delete.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SOURCE = fs.readFileSync(path.join(ROOT, 'lib', 'ai', 'prose-mode.ts'), 'utf8')

const KEYS = ['PROSE_MODE', 'OPENAI_API_KEY'] as const
type Env = Partial<Record<(typeof KEYS)[number], string>>

const saved: Record<string, string | undefined> = {}
let warn: ReturnType<typeof vi.spyOn>

function setEnv(env: Env) {
  for (const k of KEYS) {
    if (env[k] === undefined) delete process.env[k]
    else process.env[k] = env[k]
  }
}

async function load(env: Env) {
  setEnv(env)
  vi.resetModules()
  const mod = await import('@/lib/ai/prose-mode')
  return mod.proseEnabled
}

const proseModeWarnings = () =>
  warn.mock.calls.map((c) => String(c[0])).filter((m) => m.startsWith('[prose-mode]'))

beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k]
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warn.mockRestore()
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('proseEnabled()', () => {
  it('PROSE_MODE=ai + key ⇒ true, no warning', async () => {
    const proseEnabled = await load({ PROSE_MODE: 'ai', OPENAI_API_KEY: 'test-key' })
    expect(proseEnabled()).toBe(true)
    expect(proseModeWarnings()).toEqual([])
  })

  it('PROSE_MODE=ai without a key ⇒ still true (sections.ts owns the missing-key warning)', async () => {
    const proseEnabled = await load({ PROSE_MODE: 'ai' })
    expect(proseEnabled()).toBe(true)
    expect(proseModeWarnings()).toEqual([])
  })

  it('PROSE_MODE unset + key ⇒ true, no warning (key-present means on)', async () => {
    const proseEnabled = await load({ OPENAI_API_KEY: 'test-key' })
    expect(proseEnabled()).toBe(true)
    expect(proseModeWarnings()).toEqual([])
  })

  it('PROSE_MODE empty string + key ⇒ true (empty is treated as unset)', async () => {
    const proseEnabled = await load({ PROSE_MODE: '', OPENAI_API_KEY: 'test-key' })
    expect(proseEnabled()).toBe(true)
  })

  it('unrecognised PROSE_MODE + key ⇒ true (treated like unset) AND exactly one "not recognised" warning that never echoes the value', async () => {
    // fix/auto-generate-hardening (finding 9): an operator who types `off` / `false` / `0` to
    // disable spend used to get AI ON with no log at all. Still key-decides (a typo must not
    // silently switch the product off either), but it now says so — without echoing the value,
    // in case what was pasted into PROSE_MODE was something secret.
    const proseEnabled = await load({ PROSE_MODE: 'banana', OPENAI_API_KEY: 'test-key' })
    expect(proseEnabled()).toBe(true)
    expect(proseModeWarnings()).toEqual([
      '[prose-mode] PROSE_MODE is set to an unrecognised value (expected "ai" or "fallback"); treating it as unset — the key decides',
    ])
    for (const call of warn.mock.calls) expect(call.map(String).join(' ')).not.toContain('banana')
  })

  it('unrecognised PROSE_MODE, no key ⇒ false, with BOTH the unrecognised and the key-absent warnings (per-message latch)', async () => {
    const proseEnabled = await load({ PROSE_MODE: 'banana' })
    expect(proseEnabled()).toBe(false)
    expect(proseModeWarnings()).toEqual([
      '[prose-mode] PROSE_MODE is set to an unrecognised value (expected "ai" or "fallback"); treating it as unset — the key decides',
      '[prose-mode] AI prose disabled: OPENAI_API_KEY absent',
    ])
  })

  it('PROSE_MODE is compared case-insensitively and trimmed: "Fallback" and " fallback " both opt OUT', async () => {
    // A dashboard paste with a trailing space or a capital letter must not turn an opt-out into
    // silent spend — the wrong direction to fail for a kill switch.
    const upper = await load({ PROSE_MODE: 'Fallback', OPENAI_API_KEY: 'test-key' })
    expect(upper()).toBe(false)
    const padded = await load({ PROSE_MODE: ' fallback ', OPENAI_API_KEY: 'test-key' })
    expect(padded()).toBe(false)
    const shouting = await load({ PROSE_MODE: 'AI' })
    expect(shouting()).toBe(true)
  })

  it('a whitespace-only OPENAI_API_KEY counts as absent (the SDK trims it to nothing too)', async () => {
    // Otherwise the gate says ON, every affordance renders, `new OpenAI()` throws
    // "Missing credentials" in every section, and the key-absent diagnostic never fires.
    const proseEnabled = await load({ OPENAI_API_KEY: '   ' })
    expect(proseEnabled()).toBe(false)
    expect(proseModeWarnings()).toEqual(['[prose-mode] AI prose disabled: OPENAI_API_KEY absent'])
  })

  it('PROSE_MODE unset, no key ⇒ false + exactly one key-absent warning', async () => {
    const proseEnabled = await load({})
    expect(proseEnabled()).toBe(false)
    // No "(or PROSE_MODE=ai)" hint: forcing AI on without a key does not enable AI, it produces
    // 100 %-fallback rows plus a `[report] OPENAI_API_KEY absent` warn per process.
    expect(proseModeWarnings()).toEqual(['[prose-mode] AI prose disabled: OPENAI_API_KEY absent'])
  })

  it('PROSE_MODE=fallback + key ⇒ false + exactly one fallback warning (explicit opt-out wins)', async () => {
    const proseEnabled = await load({ PROSE_MODE: 'fallback', OPENAI_API_KEY: 'test-key' })
    expect(proseEnabled()).toBe(false)
    expect(proseModeWarnings()).toEqual(['[prose-mode] AI prose disabled: PROSE_MODE=fallback'])
  })

  it('PROSE_MODE=fallback, no key ⇒ false, and the reason named is fallback (not the key)', async () => {
    const proseEnabled = await load({ PROSE_MODE: 'fallback' })
    expect(proseEnabled()).toBe(false)
    expect(proseModeWarnings()).toEqual(['[prose-mode] AI prose disabled: PROSE_MODE=fallback'])
  })

  it('warns once per process across repeated calls', async () => {
    const proseEnabled = await load({})
    expect(proseEnabled()).toBe(false)
    expect(proseEnabled()).toBe(false)
    expect(proseEnabled()).toBe(false)
    expect(proseModeWarnings()).toHaveLength(1)
  })

  it('never logs the key value', async () => {
    const proseEnabled = await load({ PROSE_MODE: 'fallback', OPENAI_API_KEY: 'sk-super-secret-value' })
    proseEnabled()
    for (const call of warn.mock.calls) {
      expect(call.map(String).join(' ')).not.toContain('sk-super-secret-value')
    }
  })
})

describe('lib/ai/prose-mode.ts source hygiene', () => {
  it('is server-only: never references NEXT_PUBLIC', () => {
    expect(SOURCE).not.toContain('NEXT_PUBLIC')
  })

  it('reads OPENAI_API_KEY only as a boolean presence check, never interpolates its value', () => {
    // The only permitted read shapes are truthiness/`!` checks. Any template-literal or
    // concatenation that carries the value into a string is a secret leak.
    expect(SOURCE).toContain('process.env.OPENAI_API_KEY')
    expect(SOURCE).not.toMatch(/\$\{[^}]*OPENAI_API_KEY[^}]*\}/)
    expect(SOURCE).not.toMatch(/\+\s*process\.env\.OPENAI_API_KEY/)
    expect(SOURCE).not.toMatch(/process\.env\.OPENAI_API_KEY\s*\+/)
    // console.* calls carry only fixed strings — no env value ever reaches the arg list.
    for (const m of SOURCE.match(/console\.\w+\([^)]*\)/g) ?? []) {
      expect(m).not.toContain('process.env')
    }
  })

  it('carries a per-message warn-once latch', () => {
    // A Set keyed by message, not one boolean: "PROSE_MODE not recognised" and "key absent" are
    // two different facts that can both hold in one process, and each should be said once.
    expect(SOURCE).toMatch(/const warned = new Set<string>\(\)/)
    expect(SOURCE).not.toMatch(/let warned = false/)
  })

  it('normalises PROSE_MODE (trim + lowercase) and tests the key by trimmed non-emptiness, mirroring the openai SDK', () => {
    expect(SOURCE).toMatch(/\(process\.env\.PROSE_MODE \?\? ''\)\.trim\(\)\.toLowerCase\(\)/)
    expect(SOURCE).toMatch(/\(process\.env\.OPENAI_API_KEY \?\? ''\)\.trim\(\) !== ''/)
  })
})
