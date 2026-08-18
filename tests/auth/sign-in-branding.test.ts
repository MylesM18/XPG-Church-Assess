// Source-reading tripwire (node env, no DOM): the passwordless-entry restyle is additive/visual
// only. The mechanics that used to live in app/sign-in/page.tsx were extracted into the shared
// components/auth/passwordless-entry.tsx (rendered by both /sign-in and /sign-up with page-specific
// copy), so that component is the SOURCE here. It must keep the official "+ XP GATHERING" logo
// (public/landing/logo-dark.png, rendered via next/image with an alt="XP Gathering" fallback) + the
// "Church Health" eyebrow, render the caller's greeting under the heading, and a real 4-color Google
// "G" on the OAuth button — WITHOUT dropping any of the preserved auth logic (magic-link OTP, Google
// OAuth, redirect guard, dual-channel error surfacing, LiveStatus, focus management, ?email=
// prefill). Comments are stripped so an explanatory comment can neither satisfy nor break the
// markup assertions.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SOURCE = fs.readFileSync(path.join(ROOT, 'components', 'auth', 'passwordless-entry.tsx'), 'utf8')
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const SIGN_IN_PAGE = fs.readFileSync(path.join(ROOT, 'app', 'sign-in', 'page.tsx'), 'utf8')

describe('passwordless-entry brand restyle (additive markup)', () => {
  it('shows the official XP Gathering logo and Church Health eyebrow', () => {
    expect(CODE).toContain('logo-dark.png') // official "+ XP GATHERING" homepage lockup
    expect(CODE).toContain('XP Gathering') // survives as the logo's alt fallback
    expect(CODE).toContain('Church Health')
  })

  it('renders the caller-supplied greeting under the heading', () => {
    expect(CODE).toContain('{copy.greeting}')
  })

  it('/sign-in greets a returning member and reassures them sign-in is passwordless', () => {
    expect(SIGN_IN_PAGE).toContain('Welcome back')
    expect(SIGN_IN_PAGE).toContain('no password needed')
  })

  it('renders a real 4-color Google "G" on the OAuth button', () => {
    expect(CODE).toContain('Continue with Google')
    // Signature hexes of the official Google "G" mark.
    expect(CODE).toContain('#4285F4') // blue
    expect(CODE).toContain('#EA4335') // red
  })
})

describe('passwordless-entry preserved auth logic', () => {
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
