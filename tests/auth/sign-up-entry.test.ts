// Source-reading tripwire (node env, no DOM) for the first-time vs. returning entry split
// (docs/superpowers/specs/2026-08-18-first-time-vs-returning-entry-design.md).
//
//   • BEGIN THE ASSESSMENT → (both homepage CTAs) and the unauthenticated /get-started redirect
//     must land on /sign-up, the first-time page ("Glad you're here."), not on /sign-in ("Welcome
//     back") — a first-time leader must never be greeted as a returning one.
//   • SIGN IN and the returning-member guard keep pointing at /sign-in.
//   • Both pages render the shared PasswordlessEntry component; only copy differs.
//
// Comments are stripped where a prose mention could otherwise satisfy an assertion.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const count = (s: string, needle: string) => s.split(needle).length - 1

const SIGN_UP = strip(read('app', 'sign-up', 'page.tsx'))
const SIGN_IN = strip(read('app', 'sign-in', 'page.tsx'))
const HOME = strip(read('app', 'page.tsx'))
const GET_STARTED_PAGE = strip(read('app', 'get-started', 'page.tsx'))
const GET_STARTED_ACTIONS = strip(read('app', 'get-started', 'actions.ts'))
const MEMBERSHIP_GUARD = strip(read('lib', 'auth', 'require-church-membership.ts'))

describe('/sign-up — first-time entry page', () => {
  it('exists and renders the shared PasswordlessEntry component', () => {
    expect(fs.existsSync(path.join(ROOT, 'app', 'sign-up', 'page.tsx'))).toBe(true)
    expect(SIGN_UP).toContain('PasswordlessEntry')
    expect(SIGN_UP).toContain("from '@/components/auth/passwordless-entry'")
  })

  it('greets a first-time leader, no password to create', () => {
    expect(SIGN_UP).toContain('Glad you')
    expect(SIGN_UP).toContain('no password to create')
  })
})

describe('/sign-in — returning entry page', () => {
  it('renders the shared PasswordlessEntry component with the welcome-back greeting', () => {
    expect(SIGN_IN).toContain('PasswordlessEntry')
    expect(SIGN_IN).toContain('Welcome back')
    expect(SIGN_IN).toContain('Good to have you back')
  })
})

describe('homepage CTAs', () => {
  it('BEGIN THE ASSESSMENT → (both CTAs) links to /sign-up, never /get-started', () => {
    expect(count(HOME, 'href="/get-started"')).toBe(0)
    expect(count(HOME, 'href="/sign-up"')).toBe(2)
  })

  it('SIGN IN still links to /sign-in', () => {
    expect(count(HOME, 'href="/sign-in"')).toBe(1)
  })
})

describe('/get-started unauthenticated redirect', () => {
  it.each([
    ['app/get-started/page.tsx', GET_STARTED_PAGE],
    ['app/get-started/actions.ts', GET_STARTED_ACTIONS],
  ])('%s sends an unauthenticated visitor to /sign-up', (_name, code) => {
    expect(code).toContain("redirect('/sign-up?next=/get-started')")
    expect(code).not.toContain('/sign-in?next=/get-started')
  })
})

describe('returning-member guard — unchanged', () => {
  it('lib/auth/require-church-membership.ts still bounces to /sign-in', () => {
    expect(MEMBERSHIP_GUARD).toContain('/sign-in?next=')
  })
})
