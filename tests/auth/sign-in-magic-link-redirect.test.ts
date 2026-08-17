// Source-reading tripwire (node env, no DOM): /sign-in now drives TWO different redirect shapes,
// and swapping them silently breaks one flow each way.
//
//   • Magic link → `emailRedirectTo` must be the bare destination `${origin}${next}`. Supabase
//     renders that value into the email template as {{ .RedirectTo }}, which the token_hash link
//     carries through to /auth/confirm. Pointing it back at /auth/callback would nest the callback
//     inside the confirm route's `next` and strand the member one hop short.
//   • Google OAuth → `signInWithOAuth` must KEEP `redirectTo: callbackUrl()`. It is a PKCE code
//     exchange; /auth/callback is still its only landing pad and is unchanged by this work.
//
// Branding/markup assertions for this page live in tests/auth/sign-in-branding.test.ts; these are
// only about where each flow sends the user. Comments are stripped so prose can neither satisfy nor
// break the assertions.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SOURCE = fs.readFileSync(path.join(ROOT, 'app', 'sign-in', 'page.tsx'), 'utf8')
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// The helper actually handed to emailRedirectTo, whatever it ends up being called.
const MAGIC_LINK_HELPER = CODE.match(/emailRedirectTo:\s*(\w+)\(\)/)?.[1]
const HELPER_BODY = MAGIC_LINK_HELPER
  ? (CODE.split(new RegExp(`\\bconst\\s+${MAGIC_LINK_HELPER}\\s*=`))[1] ?? '').split(
      /\n\s*(?:async\s+)?function\s|\n\s*const\s+\w+\s*=\s*(?:\(|async)/,
    )[0]
  : ''

describe('/sign-in magic-link destination', () => {
  it('hands emailRedirectTo a helper, not an inline string', () => {
    expect(MAGIC_LINK_HELPER, 'expected `emailRedirectTo: someHelper()`').toBeTruthy()
  })

  it('sends the member straight to the resolved destination', () => {
    expect(HELPER_BODY, 'the emailed link must resolve to the real page, not a callback hop').toContain(
      '${origin}${next}',
    )
  })

  it('no longer routes the magic link through /auth/callback', () => {
    expect(HELPER_BODY).not.toContain('/auth/callback')
    expect(CODE).not.toMatch(/emailRedirectTo:\s*callbackUrl\(\)/)
  })

  it('still resolves the destination through the shared guard', () => {
    expect(CODE).toMatch(/resolveNext\s*\(/)
  })
})

describe('/sign-in Google OAuth destination — unchanged', () => {
  it('keeps signInWithOAuth pointed at the callback route', () => {
    expect(CODE).toMatch(/redirectTo:\s*callbackUrl\(\)/)
  })

  it('keeps the callback URL builder itself intact', () => {
    expect(CODE).toContain('/auth/callback?next=')
    expect(CODE, 'the OAuth next must stay percent-encoded inside the query').toMatch(
      /encodeURIComponent/,
    )
  })
})
