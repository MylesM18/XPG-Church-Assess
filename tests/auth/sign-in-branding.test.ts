// Source-reading tripwire (node env, no DOM): the /sign-in page restyle is additive/visual only.
// It must gain the refined brand lockup (serif "XP Gathering" wordmark + "Church Health" eyebrow),
// a warmer reassurance line, and a real 4-color Google "G" on the OAuth button — WITHOUT dropping
// any of the preserved auth logic (magic-link OTP, Google OAuth, redirect guard, dual-channel error
// surfacing, LiveStatus, focus management, ?email= prefill). Comments are stripped so an
// explanatory comment can neither satisfy nor break the markup assertions.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SOURCE = fs.readFileSync(path.join(ROOT, 'app', 'sign-in', 'page.tsx'), 'utf8')
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('/sign-in brand restyle (additive markup)', () => {
  it('shows the serif XP Gathering wordmark and Church Health eyebrow', () => {
    expect(CODE).toContain('XP Gathering')
    expect(CODE).toContain('Church Health')
  })

  it('reassures the user that sign-in is passwordless', () => {
    expect(CODE).toContain('secure sign-in link — no password needed')
  })

  it('renders a real 4-color Google "G" on the OAuth button', () => {
    expect(CODE).toContain('Continue with Google')
    // Signature hexes of the official Google "G" mark.
    expect(CODE).toContain('#4285F4') // blue
    expect(CODE).toContain('#EA4335') // red
  })
})

describe('/sign-in preserved auth logic', () => {
  it('keeps the magic-link + Google OAuth calls', () => {
    expect(CODE).toContain('signInWithOtp')
    expect(CODE).toContain('signInWithOAuth')
  })

  it('keeps the redirect guard and dual-channel error surfacing', () => {
    expect(CODE).toContain('resolveNext')
    expect(CODE).toContain('parseAuthError')
    expect(CODE).toContain('LiveStatus')
  })

  it('keeps the ?email= prefill and focus-on-sent management', () => {
    expect(CODE).toContain("get('email')")
    expect(CODE).toContain('sentRef')
  })
})
