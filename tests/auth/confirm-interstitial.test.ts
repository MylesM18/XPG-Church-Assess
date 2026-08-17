// Source-reading tripwire (node env, no DOM): /auth/confirm is the GET half of the token_hash
// sign-in flow, and its ONE load-bearing property is that it consumes nothing. Link prefetchers
// (Gmail's proxy, corporate mail scanners) issue GETs, never POSTs — so a GET that called
// verifyOtp would burn the single-use token before the member ever clicked, which is exactly the
// otp_expired failure this flow exists to close. token_hash on its own does NOT fix prefetch burn;
// the POST interstitial does. If anyone ever "simplifies" this page by verifying inline, these
// assertions must fail loudly. The verification itself lives in app/auth/confirm/verify/route.ts
// (POST-only, pinned by tests/auth/confirm-verify-route.test.ts).
//
// Comments are stripped so the explanatory prose above the code can neither satisfy nor break the
// assertions. Only WHOLE-LINE comments are stripped: a naive /\/\/.*$/ would also eat the `//` in
// `https://`, corrupting the source.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const PAGE = strip(fs.readFileSync(path.join(ROOT, 'app', 'auth', 'confirm', 'page.tsx'), 'utf8'))
const AUTO_SUBMIT = strip(
  fs.readFileSync(path.join(ROOT, 'app', 'auth', 'confirm', 'auto-submit.tsx'), 'utf8'),
)

describe('/auth/confirm interstitial — consumes no token on GET', () => {
  it('imports no Supabase client', () => {
    expect(PAGE, 'the GET page must not reach for a Supabase client').not.toMatch(
      /@\/lib\/supabase\//,
    )
    expect(PAGE, 'nor import the SDK directly').not.toMatch(/from\s*'@supabase\//)
  })

  it('calls no auth verification API', () => {
    expect(PAGE, 'verifyOtp belongs in the POST route, never on the prefetchable GET').not.toMatch(
      /verifyOtp/,
    )
    expect(PAGE).not.toMatch(/exchangeCodeForSession/)
    expect(PAGE, 'no session read either — the GET must be inert').not.toMatch(/auth\.get(User|Session)/)
  })
})

describe('/auth/confirm interstitial — hands the token to the POST route', () => {
  it('posts to the verify route', () => {
    expect(PAGE).toMatch(/method="post"/i)
    expect(PAGE).toMatch(/action="\/auth\/confirm\/verify"/)
  })

  it('forwards token_hash, type and next as hidden inputs', () => {
    for (const field of ['token_hash', 'type', 'next']) {
      expect(PAGE, `${field} must ride the form body, not a second GET`).toMatch(
        new RegExp(`type="hidden"[^>]*name="${field}"|name="${field}"[^>]*type="hidden"`),
      )
    }
  })

  it('reads all three values off the incoming query string', () => {
    for (const field of ['token_hash', 'type', 'next']) {
      expect(PAGE).toContain(field)
    }
    expect(PAGE, 'Next 16 hands searchParams over as a promise').toMatch(/await\s+searchParams/)
  })

  it('keeps a real submit button as the no-JS fallback', () => {
    expect(PAGE, 'a reader whose browser never runs the script must have something to click').toMatch(
      /type="submit"/,
    )
    expect(PAGE).toContain('Continue')
  })

  it('renders the auto-submit client component', () => {
    expect(PAGE).toMatch(/AutoSubmit/)
  })
})

describe('/auth/confirm auto-submit component', () => {
  it('is a client component', () => {
    expect(AUTO_SUBMIT).toMatch(/^'use client'/m)
  })

  it('submits the form on mount', () => {
    expect(AUTO_SUBMIT).toMatch(/useEffect/)
    expect(AUTO_SUBMIT, 'requestSubmit fires validation + the submit event, unlike form.submit()').toMatch(
      /requestSubmit/,
    )
  })

  it('runs no verification of its own', () => {
    expect(AUTO_SUBMIT).not.toMatch(/verifyOtp/)
    expect(AUTO_SUBMIT).not.toMatch(/@\/lib\/supabase\//)
  })
})
