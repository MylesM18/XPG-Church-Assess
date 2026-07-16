# Cairn M3 — App Shell + Auth + Profile/Dashboard/Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Next.js app + Supabase auth (magic link + Google) over the existing pure-TS engine repo, then deliver the first clickable product — create a church, see its branding persist, and view a status-only dashboard — with the Postgres RLS permission wall proven end-to-end in a real browser.

**Architecture:** Next.js 16 App Router (React 19) layered *over* the existing `lib/` engine without modifying it. Auth and data flow through `@supabase/ssr` clients using the **anon key** so Postgres RLS enforces every read; no service-role client is introduced (that is M4). Branding is a new **pure** function `lib/brand/resolve.ts` (vitest-tested). The dashboard reads through the RLS server client, so a non-member gets zero rows → 404 — the wall is proven server-side, not by a UI guard. M3 adds **no SQL** (the M2 schema, the `create_church_with_admin` RPC, and RLS policies already exist and are pgTAP-tested).

**Tech Stack:** Next.js `16.2.10`, React / React-DOM `19.2.7`, `@supabase/supabase-js` `2.110.6`, `@supabase/ssr` `0.12.3`, Tailwind CSS `4.3.2` (`@tailwindcss/postcss` `4.3.2`), `next/font` (Fraunces + Hanken Grotesk), TypeScript `5.5.4`, Vitest `2.0.5`, Supabase CLI `2.104.0` (local stack, Postgres 17).

## Global Constraints

*Every task's requirements implicitly include this section. Values are exact and verified (Context7 + npm + repo, 2026-07-15).*

- **Exact pinned versions** (do not float): `next@16.2.10`, `react@19.2.7`, `react-dom@19.2.7`, `@supabase/supabase-js@2.110.6`, `@supabase/ssr@0.12.3`, `tailwindcss@4.3.2`, `@tailwindcss/postcss@4.3.2`. Types: `@types/react@^19.2.0`, `@types/react-dom@^19.2.0`. Keep existing pins (`typescript@5.5.4`, `vitest@2.0.5`, `supabase@2.104.0`, `zod@3.23.8`, `js-yaml@4.1.0`).
- **Next 16 async request APIs (breaking change):** `cookies()`, `headers()`, `params`, and `searchParams` are **async** — always `await` them. `cookies()` is imported from `next/headers`.
- **M3 touches NO engine code.** `lib/engine/**` and `lib/methodology/**` are not modified. Engine-purity grep MUST stay empty: `grep -rE "from '(next\|@supabase\|@anthropic-ai\|node:fs\|node:net\|node:http)'" lib/engine` → no output.
- **No service-role client in M3.** Do not create `lib/supabase/service.ts`. Do not add `SUPABASE_SERVICE_ROLE_KEY` to any env template. All Supabase reads/writes use the **anon key** (RLS-enforced).
- **M3 adds NO SQL.** No new migration, no new pgTAP test. `npm run test:db` must stay **6 migration files + 6 test files (72 assertions)** unchanged.
- **Methodology is data, never hard-coded.** The 8 categories, their order, chain positions, and enabler gates come from `loadMethodology()`. `p_methodology_version` passed to the RPC = `methodology.questions.version`.
- **`--berry` (`#8E2B3E`) is RESERVED** for diagnosis/constraint/active only — never a brand tile or generic accent. The 8-tone monogram palette must never include berry.
- **Dev server runs on port 3000** (config.toml `site_url = "http://127.0.0.1:3000"`). Next's default port is 3000 — do not override it.
- **Verify by RUNNING, not reading.** Preserve baselines: `npx vitest run` = 75 pre-M3 tests still pass (+ new brand tests), `npm run typecheck` = 0 errors, `npm run test:db` = 6/6 files unchanged, engine-purity grep empty. Plus `next build` + `next lint` green once the app exists.
- **Toolchain:** Supabase CLI pinned `2.104.0` — do NOT upgrade (ignore the v2.109.x nag). PG17 accepted. Do NOT run `npm audit fix --force`. Docker must be running for `supabase start` / `test:db`.
- **Push only on explicit user go-ahead, as `MylesM18`** (repo PRIVATE `github.com/MylesM18/XPG-Church-Assess`; `nataliemagee`/`CornerLeague` are pull-only → 403). Verify the active gh account before any push. `.superpowers/sdd/` is git-ignored scratch.

---

## File Structure

**Created (app shell — repo root & `app/`):**
- `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `.env.example`
- `app/layout.tsx` (fonts + root shell), `app/globals.css` (Tailwind v4 `@theme` tokens), `app/page.tsx` (landing + auth state)
- `app/sign-in/page.tsx` (magic link + Google), `app/auth/callback/route.ts`, `app/auth/signout/route.ts`
- `app/get-started/page.tsx`, `app/get-started/form.tsx`, `app/get-started/actions.ts`
- `app/app/[churchId]/page.tsx` (dashboard), `app/app/[churchId]/chain-glyph.tsx`

**Created (libraries):**
- `lib/supabase/client.ts` (browser), `lib/supabase/server.ts` (server, anon → RLS), `middleware.ts` (repo root; session refresh)
- `lib/brand/resolve.ts` (pure) + `tests/brand/resolve.test.ts`

**Modified:**
- `package.json` (deps + scripts), `tsconfig.json` (JSX + DOM + Next plugin, engine compilation preserved), `.gitignore` (Next artifacts + env), `supabase/config.toml` (redirect URLs + Google provider)

**Never modified:** `lib/engine/**`, `lib/methodology/**`, `lib/ai/**`, `lib/report/**`, `supabase/migrations/**`, `supabase/tests/**`.

---

## Task 1: Next.js app shell — Tailwind v4 tokens + fonts + build green

**Files:**
- Modify: `package.json` (add deps + scripts), `tsconfig.json`, `.gitignore`
- Create: `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `app/globals.css`, `app/layout.tsx`, `app/page.tsx`

**Interfaces:**
- Produces: a building Next.js App Router app. Tailwind utilities from `@theme` tokens (`bg-paper`, `text-ink`, `text-ink-soft`, `border-line`, `text-berry`, `bg-sand`, `text-sage`, `font-display`, `font-body`). Fonts exposed as CSS variables `--font-fraunces` / `--font-hanken` on `<html>`. `@/*` path alias → repo root.

- [ ] **Step 1: Install runtime + dev dependencies (exact pins)**

Run:
```bash
npm install next@16.2.10 react@19.2.7 react-dom@19.2.7
npm install -D @types/react@^19.2.0 @types/react-dom@^19.2.0 tailwindcss@4.3.2 @tailwindcss/postcss@4.3.2 postcss eslint@^9 eslint-config-next@16.2.10 @eslint/eslintrc
```
Expected: installs succeed. Ignore any `npm audit` advisories — do NOT run `audit fix --force`.

- [ ] **Step 2: Add scripts to `package.json`**

Merge into the existing `"scripts"` block (keep `test`, `test:watch`, `test:db`, `typecheck` exactly as they are):
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:db": "supabase db reset && supabase test db",
  "typecheck": "tsc --noEmit"
}
```
Keep `"type": "module"`.

- [ ] **Step 3: Create `next.config.ts`**

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {}

export default nextConfig
```

- [ ] **Step 4: Create `postcss.config.mjs` (Tailwind v4 plugin)**

```js
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}

export default config
```

- [ ] **Step 5: Create `eslint.config.mjs` (flat config, next rules)**

```js
import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({ baseDirectory: import.meta.dirname })

const eslintConfig = [
  ...compat.config({ extends: ['next/core-web-vitals', 'next/typescript'] }),
  { ignores: ['.next/**', 'node_modules/**', 'supabase/**'] },
]

export default eslintConfig
```

- [ ] **Step 6: Create `app/globals.css` (Tailwind v4 `@theme` = Spec §12 tokens)**

```css
@import "tailwindcss";

@theme {
  --color-paper: #FBF9F5;
  --color-ink: #1A1C22;
  --color-ink-soft: #565962;
  --color-line: #E4DED3;
  --color-berry: #8E2B3E;        /* RESERVED: diagnosis/constraint/active only — never a brand tile */
  --color-berry-deep: #6E1F30;
  --color-sage: #4E6B60;         /* healthy / enabler */
  --color-sand: #EEE8DD;

  --font-display: var(--font-fraunces), Georgia, serif;
  --font-body: var(--font-hanken), system-ui, sans-serif;
}

html,
body {
  background-color: var(--color-paper);
  color: var(--color-ink);
}

body {
  font-family: var(--font-body);
}
```

- [ ] **Step 7: Create `app/layout.tsx` (next/font + root shell)**

```tsx
import type { Metadata } from 'next'
import { Fraunces, Hanken_Grotesk } from 'next/font/google'
import './globals.css'

const fraunces = Fraunces({ subsets: ['latin'], display: 'swap', variable: '--font-fraunces' })
const hanken = Hanken_Grotesk({ subsets: ['latin'], display: 'swap', variable: '--font-hanken' })

export const metadata: Metadata = {
  title: 'Cairn',
  description: 'Church health, one honest look at a time.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${hanken.variable}`}>
      <body className="min-h-dvh bg-paper text-ink antialiased">{children}</body>
    </html>
  )
}
```

- [ ] **Step 8: Create `app/page.tsx` (static landing — no auth yet; Task 3 upgrades it)**

```tsx
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="font-display text-5xl text-ink">Cairn</h1>
      <p className="font-body text-lg text-ink-soft">
        Church health, one honest look at a time.
      </p>
      <a
        href="/sign-in"
        className="rounded-md border border-line bg-sand px-5 py-2 font-body text-ink transition-colors hover:bg-line focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        Sign in
      </a>
    </main>
  )
}
```

- [ ] **Step 9: Rewrite `tsconfig.json` (add JSX + DOM + Next plugin; engine compilation preserved)**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "jsx": "preserve",
    "allowJs": true,
    "incremental": true,
    "noEmit": true,
    "types": ["node"],
    "paths": { "@/*": ["./*"] },
    "plugins": [{ "name": "next" }]
  },
  "include": ["lib", "tests", "app", "middleware.ts", "next-env.d.ts", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```
Note: `strict` + `noUncheckedIndexedAccess` are unchanged from M2 — new app code must satisfy them. Adding `dom` to `lib` does not affect the engine-purity grep (which checks imports, not lib globals).

- [ ] **Step 10: Update `.gitignore` (append Next + env artifacts)**

Final `.gitignore` contents:
```
node_modules/
dist/
*.log
.DS_Store

# next.js
/.next/
/out/
next-env.d.ts

# env
.env
.env*.local
```

- [ ] **Step 11: Verify the build is green**

Run:
```bash
npm run build
```
Expected: `✓ Compiled successfully`, route `/` listed, exit 0. (First run writes `next-env.d.ts`, now git-ignored.)

- [ ] **Step 12: Verify lint + typecheck + engine purity**

Run:
```bash
npm run lint && npm run typecheck && grep -rE "from '(next|@supabase|@anthropic-ai|node:fs|node:net|node:http)'" lib/engine; echo "purity-exit=$?"
```
Expected: lint reports no errors; `tsc --noEmit` prints nothing (0 errors); grep prints no matching lines and `purity-exit=1` (grep found nothing). If `next lint` reports it is deprecated in this Next version, switch the `lint` script to `"eslint ."` and re-run — the flat config already supports it.

- [ ] **Step 13: Visually verify tokens + fonts in a real browser**

Start the dev server (via the preview tool, port 3000) and load `http://127.0.0.1:3000/`. Confirm: paper background `#FBF9F5`, "Cairn" in a serif display face (Fraunces), body copy in Hanken Grotesk, "Sign in" pill on sand. Capture a screenshot as evidence.

- [ ] **Step 14: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore next.config.ts postcss.config.mjs eslint.config.mjs app/
git commit -m "feat: M3 app shell — Next 16 App Router, Tailwind v4 tokens, Fraunces + Hanken fonts"
```

---

## Task 2: Supabase SSR clients + session middleware + env template

**Files:**
- Create: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `middleware.ts` (repo root), `.env.example`

**Interfaces:**
- Consumes: env vars `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Produces:
  - `lib/supabase/client.ts` → `createClient(): SupabaseClient` (browser; sync).
  - `lib/supabase/server.ts` → `async createClient(): Promise<SupabaseClient>` (server; **await it**; anon key → RLS-enforced).
  - `middleware.ts` → refreshes the auth session on navigation via `supabase.auth.getUser()`.

- [ ] **Step 1: Create `lib/supabase/client.ts` (browser client)**

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
```

- [ ] **Step 2: Create `lib/supabase/server.ts` (server client — anon key, cookie session)**

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Server client bound to the request's cookies. Uses the ANON key, so every
// query is enforced by Postgres RLS. `cookies()` is async in Next 16 — await it.
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Called from a Server Component where cookies are read-only.
            // Safe to ignore — middleware.ts refreshes the session.
          }
        },
      },
    },
  )
}
```

- [ ] **Step 3: Create `middleware.ts` (repo root — refresh session, canonical Supabase pattern)**

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Revalidates the token with the auth server and refreshes cookies.
  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

- [ ] **Step 4: Create `.env.example` (M3 subset — NO service-role key)**

```bash
# Local Supabase (from `supabase status`). Copy this file to `.env.local` and fill values.
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Branding
MONOGRAM_LETTERS=1

# App
APP_URL=http://127.0.0.1:3000

# Google OAuth — Supabase-side (NOT app runtime). Needed only to exercise Google locally.
# SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=
# SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=

# Intentionally omitted in M3 (M4/M5): SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_*, PROSE_MODE, RESEND_*, EMAIL_FROM
```

- [ ] **Step 5: Create `.env.local` for local dev (not committed)**

Run:
```bash
supabase status
```
Copy the printed `anon key` into `.env.local`:
```bash
cp .env.example .env.local
# then paste the anon key into NEXT_PUBLIC_SUPABASE_ANON_KEY
```
Expected: `.env.local` has a non-empty anon key. (If the stack is not running: `supabase start` first — Docker required.)

- [ ] **Step 6: Verify build + typecheck (middleware + clients compile)**

Run:
```bash
npm run build && npm run typecheck
```
Expected: build succeeds, middleware is picked up (`ƒ Middleware` appears in the build output), `tsc --noEmit` = 0 errors.

- [ ] **Step 7: Commit**

```bash
git add lib/supabase/ middleware.ts .env.example
git commit -m "feat: M3 Supabase SSR clients (anon/RLS) + session middleware + env template"
```

---

## Task 3: Auth — sign-in (magic link + Google), callback, sign-out, provider config

**Files:**
- Create: `app/sign-in/page.tsx`, `app/auth/callback/route.ts`, `app/auth/signout/route.ts`
- Modify: `app/page.tsx` (show auth state), `supabase/config.toml` (redirect URLs + Google provider)

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/client` (browser) and `@/lib/supabase/server` (server).
- Produces: `/sign-in` (magic-link form + Google button), `/auth/callback` (`exchangeCodeForSession`), `/auth/signout` (POST → `signOut`). Callback redirects to `?next=` (default `/`).

- [ ] **Step 1: Create `app/sign-in/page.tsx` (client component)**

```tsx
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function SignInPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const callbackUrl = () =>
    typeof window !== 'undefined'
      ? `${window.location.origin}/auth/callback?next=/get-started`
      : '/auth/callback?next=/get-started'

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl() },
    })
    if (error) setError(error.message)
    else setSent(true)
  }

  async function signInWithGoogle() {
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl() },
    })
    if (error) setError(error.message)
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <h1 className="font-display text-3xl text-ink">Sign in to Cairn</h1>

      {sent ? (
        <p className="font-body text-ink-soft">
          Check your email for a magic link. You can close this tab.
        </p>
      ) : (
        <form onSubmit={sendMagicLink} className="flex flex-col gap-3">
          <label htmlFor="email" className="font-body text-sm text-ink-soft">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-line bg-paper px-3 py-2 font-body text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          />
          <button
            type="submit"
            className="rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90"
          >
            Send magic link
          </button>
        </form>
      )}

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="font-body text-xs text-ink-soft">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <button
        type="button"
        onClick={signInWithGoogle}
        className="rounded-md border border-line bg-paper px-4 py-2 font-body text-ink transition-colors hover:bg-sand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        Continue with Google
      </button>

      {error && <p className="font-body text-sm text-berry">{error}</p>}
    </main>
  )
}
```

- [ ] **Step 2: Create `app/auth/callback/route.ts` (exchange code → session)**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/sign-in?error=auth`)
}
```

- [ ] **Step 3: Create `app/auth/signout/route.ts` (POST → sign out)**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  const { origin } = new URL(request.url)
  return NextResponse.redirect(`${origin}/sign-in`, { status: 303 })
}
```

- [ ] **Step 4: Upgrade `app/page.tsx` to a server component that shows auth state**

Replace the file contents:
```tsx
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="font-display text-5xl text-ink">Cairn</h1>
      <p className="font-body text-lg text-ink-soft">
        Church health, one honest look at a time.
      </p>

      {user ? (
        <div className="flex flex-col items-center gap-3">
          <p className="font-body text-sm text-ink-soft">Signed in as {user.email}</p>
          <a
            href="/get-started"
            className="rounded-md border border-line bg-ink px-5 py-2 font-body text-paper transition-opacity hover:opacity-90"
          >
            Get started
          </a>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="font-body text-sm text-ink-soft underline underline-offset-4 hover:text-ink"
            >
              Sign out
            </button>
          </form>
        </div>
      ) : (
        <a
          href="/sign-in"
          className="rounded-md border border-line bg-sand px-5 py-2 font-body text-ink transition-colors hover:bg-line focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Sign in
        </a>
      )}
    </main>
  )
}
```

- [ ] **Step 5: Allow-list the callback URL in `supabase/config.toml`**

Change the `[auth]` line:
```toml
additional_redirect_urls = ["https://127.0.0.1:3000"]
```
to:
```toml
additional_redirect_urls = ["https://127.0.0.1:3000", "http://127.0.0.1:3000/**"]
```

- [ ] **Step 6: Add the Google provider block to `supabase/config.toml`**

Append (top-level, e.g. after the `[auth.email]` block; `skip_nonce_check` is required for local Google):
```toml
[auth.external.google]
enabled = true
client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"
skip_nonce_check = true
```

- [ ] **Step 7: Restart the local stack so config changes apply**

Run:
```bash
supabase stop && supabase start
```
Expected: stack restarts. `additional_redirect_urls` change is now active. (A missing Google client id/secret only affects a real Google round-trip — it does not block startup.) Refresh the anon key in `.env.local` if `supabase start` printed a new one.

- [ ] **Step 8: Verify build + lint + typecheck**

Run:
```bash
npm run build && npm run lint && npm run typecheck
```
Expected: all green; routes `/sign-in`, `/auth/callback`, `/auth/signout` appear in build output.

- [ ] **Step 9: Prove magic-link sign-in end-to-end via Inbucket (real browser)**

1. `npm run dev` (port 3000).
2. Browser → `http://127.0.0.1:3000/sign-in`, enter an email (e.g. `pastor@example.com`), submit → "Check your email" appears.
3. Open Inbucket `http://127.0.0.1:54324`, open the newest message, click the magic link.
4. Confirm you land on `http://127.0.0.1:3000/` showing **"Signed in as pastor@example.com"** with a "Sign out" link. (The `?next=/get-started` target 404s until Task 5 — that is expected; the auth proof is the home page's signed-in state.)
5. Also confirm the "Continue with Google" button renders and, when clicked, redirects toward the provider (full Google round-trip is a cloud-deploy verification, not local).
Capture screenshots of the signed-in home page and the Inbucket message as evidence.

- [ ] **Step 10: Commit**

```bash
git add app/sign-in/ app/auth/ app/page.tsx supabase/config.toml
git commit -m "feat: M3 auth — magic link + Google sign-in, callback, sign-out, provider config"
```

---

## Task 4: `resolveBrand` pure function (TDD)

**Files:**
- Create: `lib/brand/resolve.ts`, `tests/brand/resolve.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 5 & 6):
  - `resolveBrand(input: string | { name: string }): { monogram: string; tileColor: string; displayName: string }`
  - `resolveMonogram(name: string, letters?: 1 | 2): string`
  - `resolveTileColor(name: string): string`
  - `TILE_PALETTE: readonly string[]` (8 tones, never berry `#8E2B3E`).

- [ ] **Step 1: Write the failing test**

Create `tests/brand/resolve.test.ts`:
```ts
import { afterEach, describe, expect, it } from 'vitest'
import {
  resolveBrand,
  resolveMonogram,
  resolveTileColor,
  TILE_PALETTE,
} from '../../lib/brand/resolve'

describe('resolveMonogram', () => {
  it('skips stopwords and takes the first significant word (default 1 letter)', () => {
    expect(resolveMonogram('The Church of Grace')).toBe('C')
  })

  it('takes two significant initials when letters = 2', () => {
    expect(resolveMonogram('The Church of Grace', 2)).toBe('CG')
  })

  it('single significant word yields one letter even at letters = 2', () => {
    expect(resolveMonogram('Redeemer', 2)).toBe('R')
  })

  it('always uppercases', () => {
    expect(resolveMonogram('grace fellowship', 2)).toBe('GF')
  })

  it('falls back to raw words when every word is a stopword', () => {
    expect(resolveMonogram('the of')).toBe('T')
  })
})

describe('resolveTileColor', () => {
  it('is deterministic for the same name', () => {
    expect(resolveTileColor('Grace Community')).toBe(resolveTileColor('Grace Community'))
  })

  it('always returns a palette color and never berry', () => {
    for (const name of ['Grace', 'Hillside', 'New Life', 'The Bridge', 'Redeemer City']) {
      const color = resolveTileColor(name)
      expect(TILE_PALETTE).toContain(color)
      expect(color.toUpperCase()).not.toBe('#8E2B3E')
    }
  })

  it('palette has 8 tones and excludes berry', () => {
    expect(TILE_PALETTE).toHaveLength(8)
    expect(TILE_PALETTE.map((c) => c.toUpperCase())).not.toContain('#8E2B3E')
  })
})

describe('resolveBrand', () => {
  it('accepts a string or an object and trims displayName', () => {
    const a = resolveBrand('  Grace Church  ')
    expect(a.displayName).toBe('Grace Church')
    expect(a.monogram).toBe('G')
    expect(TILE_PALETTE).toContain(a.tileColor)

    const b = resolveBrand({ name: 'Grace Church' })
    expect(b).toEqual({ ...a, displayName: 'Grace Church' })
  })
})

describe('MONOGRAM_LETTERS env default', () => {
  afterEach(() => {
    delete process.env.MONOGRAM_LETTERS
  })

  it('defaults to 1 letter', () => {
    delete process.env.MONOGRAM_LETTERS
    expect(resolveMonogram('Grace Fellowship')).toBe('G')
  })

  it('honors MONOGRAM_LETTERS=2', () => {
    process.env.MONOGRAM_LETTERS = '2'
    expect(resolveMonogram('Grace Fellowship')).toBe('GF')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npx vitest run tests/brand/resolve.test.ts
```
Expected: FAIL — cannot resolve module `../../lib/brand/resolve`.

- [ ] **Step 3: Write the minimal implementation**

Create `lib/brand/resolve.ts`:
```ts
export interface ResolvedBrand {
  monogram: string
  tileColor: string
  displayName: string
}

const STOPWORDS = new Set(['the', 'of', 'and', 'a', 'at', 'in', 'on', 'for'])

// 8-tone monogram palette. NEVER berry (#8E2B3E is reserved for constraint/active).
export const TILE_PALETTE = [
  '#1F4E4A', // deep teal
  '#3A4A6B', // slate blue
  '#2E4636', // forest
  '#5A3A55', // plum
  '#1E2A44', // ink-navy
  '#5E3A2E', // oxblood-brown
  '#7A5A2E', // bronze
  '#34423A', // charcoal-green
] as const

function defaultLetters(): 1 | 2 {
  return process.env.MONOGRAM_LETTERS === '2' ? 2 : 1
}

function significantWords(name: string): string[] {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const significant = words.filter((w) => !STOPWORDS.has(w.toLowerCase()))
  return significant.length > 0 ? significant : words
}

export function resolveMonogram(name: string, letters: 1 | 2 = defaultLetters()): string {
  const words = significantWords(name)
  return words
    .slice(0, letters)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}

// FNV-1a → stable, name-based palette index (independent of palette ordering churn).
function hashName(name: string): number {
  let h = 0x811c9dc5
  const s = name.trim().toLowerCase()
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function resolveTileColor(name: string): string {
  return TILE_PALETTE[hashName(name) % TILE_PALETTE.length]!
}

export function resolveBrand(input: string | { name: string }): ResolvedBrand {
  const name = typeof input === 'string' ? input : input.name
  return {
    monogram: resolveMonogram(name),
    tileColor: resolveTileColor(name),
    displayName: name.trim(),
  }
}
```

- [ ] **Step 4: Run the brand tests to verify they pass**

Run:
```bash
npx vitest run tests/brand/resolve.test.ts
```
Expected: PASS (all cases green).

- [ ] **Step 5: Run the full suite + typecheck (no regressions)**

Run:
```bash
npx vitest run && npm run typecheck
```
Expected: 75 pre-M3 tests still pass, plus the new brand tests; `tsc --noEmit` = 0 errors.

- [ ] **Step 6: Commit**

```bash
git add lib/brand/resolve.ts tests/brand/resolve.test.ts
git commit -m "feat: M3 resolveBrand — monogram + deterministic non-berry tile color (TDD)"
```

---

## Task 5: Church creation — `/get-started` → `resolveBrand` → RPC → redirect

**Files:**
- Create: `app/get-started/page.tsx`, `app/get-started/actions.ts`, `app/get-started/form.tsx`

**Interfaces:**
- Consumes: `resolveBrand` (`@/lib/brand/resolve`), `loadMethodology` (`@/lib/methodology/load`), server `createClient` (`@/lib/supabase/server`), RPC `create_church_with_admin(p_name, p_brand_color, p_methodology_version, …bands) → {church_id, run_id}`.
- Produces: `/get-started` (auth-gated form). On success redirects to `/app/{church_id}` (route built in Task 6).

- [ ] **Step 1: Create the server action `app/get-started/actions.ts`**

```ts
'use server'

import { redirect } from 'next/navigation'
import { loadMethodology } from '@/lib/methodology/load'
import { resolveBrand } from '@/lib/brand/resolve'
import { createClient } from '@/lib/supabase/server'

export interface CreateChurchState {
  error: string | null
}

const BAND_FIELDS = [
  'denomination',
  'context',
  'attendance_band',
  'adults_band',
  'staff_fte_band',
  'budget_band',
  'church_age_band',
  'growth_trajectory',
] as const

function emptyToNull(v: FormDataEntryValue | null): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}

export async function createChurch(
  _prev: CreateChurchState,
  formData: FormData,
): Promise<CreateChurchState> {
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Church name is required.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in?next=/get-started')

  const brand = resolveBrand(name)
  const methodology = loadMethodology()

  const args: Record<string, string | null> = {
    p_name: name,
    p_brand_color: brand.tileColor,
    p_methodology_version: methodology.questions.version,
  }
  for (const field of BAND_FIELDS) {
    args[`p_${field}`] = emptyToNull(formData.get(field))
  }

  const { data, error } = await supabase.rpc('create_church_with_admin', args)
  if (error) return { error: error.message }

  const rows = data as Array<{ church_id: string; run_id: string }> | null
  const churchId = rows?.[0]?.church_id
  if (!churchId) return { error: 'Church creation failed — no id returned.' }

  redirect(`/app/${churchId}`)
}
```
Note: `redirect()` throws internally (control never falls through), so success does not return.

- [ ] **Step 2: Create the client form `app/get-started/form.tsx`**

```tsx
'use client'

import { useActionState } from 'react'
import { createChurch, type CreateChurchState } from './actions'

const initial: CreateChurchState = { error: null }

const CONTEXTS = ['urban', 'suburban', 'small_town', 'rural'] as const

const inputClass =
  'rounded-md border border-line bg-paper px-3 py-2 font-body text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

export function GetStartedForm() {
  const [state, formAction, pending] = useActionState(createChurch, initial)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 font-body text-sm text-ink-soft">
        Church name (required)
        <input name="name" type="text" required className={inputClass} />
      </label>

      <label className="flex flex-col gap-1 font-body text-sm text-ink-soft">
        Denomination
        <input name="denomination" type="text" className={inputClass} />
      </label>

      <label className="flex flex-col gap-1 font-body text-sm text-ink-soft">
        Context
        <select name="context" defaultValue="" className={inputClass}>
          <option value="">—</option>
          {CONTEXTS.map((c) => (
            <option key={c} value={c}>
              {c.replace('_', ' ')}
            </option>
          ))}
        </select>
      </label>

      {(
        [
          ['attendance_band', 'Weekend attendance'],
          ['adults_band', 'Adults'],
          ['staff_fte_band', 'Staff (FTE)'],
          ['budget_band', 'Annual budget'],
          ['church_age_band', 'Church age'],
          ['growth_trajectory', 'Growth trajectory'],
        ] as const
      ).map(([name, label]) => (
        <label key={name} className="flex flex-col gap-1 font-body text-sm text-ink-soft">
          {label}
          <input name={name} type="text" className={inputClass} />
        </label>
      ))}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? 'Creating…' : 'Create church'}
      </button>

      {state.error && <p className="font-body text-sm text-berry">{state.error}</p>}
    </form>
  )
}
```

- [ ] **Step 3: Create the auth-gated page `app/get-started/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { GetStartedForm } from './form'

export default async function GetStartedPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in?next=/get-started')

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6 py-12">
      <h1 className="font-display text-3xl text-ink">Add your church</h1>
      <p className="font-body text-ink-soft">
        Just the name to start — everything else is optional and editable later.
      </p>
      <GetStartedForm />
    </main>
  )
}
```

- [ ] **Step 4: Verify build + lint + typecheck**

Run:
```bash
npm run build && npm run lint && npm run typecheck
```
Expected: all green; `/get-started` appears in build output.

- [ ] **Step 5: Prove church creation end-to-end (real browser)**

1. Ensure the stack is up (`supabase start`) and `npm run dev` is running; sign in via magic link (Task 3 flow) — you now land on `/get-started`.
2. Enter a church name (e.g. `The Bridge Church`), submit.
3. Confirm redirect to `/app/{uuid}` (Task 6 renders it; if running this task before Task 6, the redirect target 404s but the DB write is what matters here).
4. Verify the row exists and `brand_color` is a palette color:
```bash
supabase db query "select name, brand_color, created_by from public.churches order by created_at desc limit 1;"
```
Expected: one row with `name = The Bridge Church` and a non-null `brand_color` from `TILE_PALETTE` (never `#8E2B3E`).

- [ ] **Step 6: Commit**

```bash
git add app/get-started/
git commit -m "feat: M3 church creation — /get-started form → resolveBrand → create_church_with_admin RPC"
```

---

## Task 6: Dashboard — `/app/[churchId]` status-only, ChainGlyph, RLS wall

**Files:**
- Create: `app/app/[churchId]/page.tsx`, `app/app/[churchId]/chain-glyph.tsx`

**Interfaces:**
- Consumes: server `createClient`, `loadMethodology` (categories + `rules.enablers`), `resolveBrand` (monogram).
- Produces: the dashboard at `/app/{churchId}`. `<ChainGlyph position={1..5} broken={false} />` renders 5 dots with the `position`-th filled. Non-member → `notFound()` (404) via RLS zero-rows.

- [ ] **Step 1: Create `app/app/[churchId]/chain-glyph.tsx`**

```tsx
export function ChainGlyph({
  position,
  broken = false,
}: {
  position: number
  broken?: boolean
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5"
      aria-label={`Chain stage ${position} of 5`}
    >
      {[1, 2, 3, 4, 5].map((p) => {
        const isHere = p === position
        const cls = broken && isHere ? 'bg-berry border-berry' : isHere ? 'bg-ink border-ink' : 'border-line'
        return <span key={p} className={`h-2 w-2 rounded-full border ${cls}`} />
      })}
    </span>
  )
}
```
In M3 `broken` is always `false`, so berry never renders.

- [ ] **Step 2: Create `app/app/[churchId]/page.tsx` (server component, params is async in Next 16)**

```tsx
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadMethodology } from '@/lib/methodology/load'
import { resolveBrand } from '@/lib/brand/resolve'
import { ChainGlyph } from './chain-glyph'

function gatesLabel(gates: 'all' | string[] | undefined): string {
  if (gates === 'all') return 'all stages'
  if (Array.isArray(gates)) return gates.join(', ')
  return '—'
}

const STUBS = [
  ['Invite leaders', 'M4'],
  ['Answer yourself', 'M4'],
  ['View diagnosis', 'M5'],
  ['Manage access', 'M5'],
] as const

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ churchId: string }>
}) {
  const { churchId } = await params
  const supabase = await createClient()

  // RLS: a non-member gets zero rows here → 404 (server-side permission wall).
  const { data: church } = await supabase
    .from('churches')
    .select('id, name, brand_color')
    .eq('id', churchId)
    .maybeSingle()

  if (!church) notFound()

  const methodology = loadMethodology()
  const brand = resolveBrand(church.name)
  const categories = methodology.questions.categories
  const enablers = methodology.rules.enablers

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="flex items-center gap-4">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-md font-display text-xl text-white"
          style={{ backgroundColor: church.brand_color }}
        >
          {brand.monogram}
        </div>
        <div>
          <h1 className="font-display text-2xl text-ink">{church.name}</h1>
          <p className="font-body text-sm text-ink-soft">Assessment not started · 0 of 8 areas</p>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {categories.map((cat) => (
          <article key={cat.id} className="rounded-lg border border-line bg-paper p-4">
            <h2 className="font-display text-lg text-ink">{cat.name}</h2>
            <div className="mt-2">
              {cat.position !== null ? (
                <ChainGlyph position={cat.position} />
              ) : (
                <span className="font-body text-xs text-sage">
                  Enabler · gates {gatesLabel(enablers[cat.id]?.gates)}
                </span>
              )}
            </div>
            <p className="mt-3 font-body text-sm text-ink-soft">Not started</p>
          </article>
        ))}
      </section>

      <section className="flex flex-wrap gap-2">
        {STUBS.map(([label, milestone]) => (
          <button
            key={label}
            type="button"
            disabled
            aria-disabled="true"
            className="cursor-not-allowed rounded-md border border-line px-3 py-1.5 font-body text-sm text-ink-soft opacity-60"
          >
            {label} <span className="text-xs">({milestone})</span>
          </button>
        ))}
      </section>
    </main>
  )
}
```

- [ ] **Step 3: Verify build + lint + typecheck**

Run:
```bash
npm run build && npm run lint && npm run typecheck
```
Expected: all green; `/app/[churchId]` appears as a dynamic route.

- [ ] **Step 4: Prove the dashboard renders correctly (real browser)**

Sign in, create a church, land on `/app/{churchId}`. Confirm:
- Branded header: monogram tile in the church's `brand_color`, church name.
- **8 category cards** in methodology order (Guest Experience, Community/Connection, Discipleship/Leadership, Volunteer, Generosity as **stage** glyphs at positions 1–5; Governance, Communication, Org Structure as **Enabler** tags with their gate lists).
- Each stage card shows a 5-dot glyph with the correct dot filled; **no berry** anywhere.
- Every card reads "Not started"; four disabled stub buttons labeled M4/M5.
Reload the page and confirm the monogram + tile color are unchanged (persisted `brand_color`). Capture a screenshot.

- [ ] **Step 5: Prove the RLS wall — a non-member is denied (real browser)**

1. As user A, create church A → note its `{churchId}`.
2. Sign out; sign in as a **different** user B (new email via Inbucket).
3. Navigate to `http://127.0.0.1:3000/app/{churchId}` (church A's id).
Expected: Next renders the **404 page** — the churches SELECT returned zero rows under RLS for user B, so `notFound()` fired. This is a server-side denial, not a UI redirect. Capture the 404 as evidence.

- [ ] **Step 6: Commit**

```bash
git add app/app/
git commit -m "feat: M3 dashboard — status-only cards, chain glyphs, disabled stubs, RLS 404 wall"
```

---

## Task 7: Full verification pass — all gates + e2e evidence

**Files:** none (verification only).

**Interfaces:** consumes the whole M3 branch.

- [ ] **Step 1: Run every automated gate from a clean state**

Run:
```bash
npx vitest run
npm run typecheck
npm run build
npm run lint
grep -rE "from '(next|@supabase|@anthropic-ai|node:fs|node:net|node:http)'" lib/engine; echo "purity-exit=$?"
```
Expected: vitest = 75 pre-M3 + new brand tests all pass; typecheck = 0; `next build` succeeds; lint = 0 errors; grep prints nothing with `purity-exit=1`.

- [ ] **Step 2: Confirm M3 added no SQL (test:db baseline unchanged)**

Run (Docker required):
```bash
ls supabase/migrations | wc -l && ls supabase/tests | wc -l && npm run test:db
```
Expected: `4` migrations (unchanged) and `6` test files; `supabase test db` passes all 72 assertions across 6 files. (Only `config.toml` changed in supabase/ — no migration/test files added.)

- [ ] **Step 3: Run the full real-browser e2e checklist**

With `supabase start` + `npm run dev` running, verify in one pass and capture screenshots:
1. **Magic link:** `/sign-in` → email → Inbucket link → signed-in home showing the email.
2. **Google button:** renders and redirects toward the provider (round-trip deferred to cloud).
3. **Create church:** `/get-started` → submit → redirect to `/app/{churchId}`.
4. **Branding persists:** monogram + tile color render; unchanged after a reload.
5. **Dashboard:** 8 category cards, correct chain glyphs, all "Not started", disabled M4/M5 stubs; no berry.
6. **RLS wall:** a second signed-in user gets a 404 on the first user's church.

- [ ] **Step 4: Confirm the git history is clean and scoped**

Run:
```bash
git status && git log --oneline origin/master..HEAD
```
Expected: working tree clean; commits are the M3 design (`726990a`) + the six M3 build commits above. No engine/migration/test-SQL files modified (`git diff --stat 726990a..HEAD -- lib/engine lib/methodology supabase/migrations supabase/tests` → empty).

- [ ] **Step 5: Hand off to review**

Do NOT push. Proceed to `superpowers:requesting-code-review` (opus, whole-branch), then `superpowers:finishing-a-development-branch` **with the user** (push decision is the user's, as `MylesM18`, on explicit go-ahead only).

---

## Self-Review (against the design doc)

**1. Spec coverage** — every design §3 section and §4 AC maps to a task:

| Design element | Task |
|---|---|
| §3.1 App shell, Tailwind §12 tokens, next/font, `<ChainGlyph>` | 1 (shell/tokens/fonts), 6 (ChainGlyph) |
| §3.2 Supabase clients + middleware, no `service.ts` | 2 |
| §3.3 Auth: magic link + Google, callback, sign-out, config.toml | 3 |
| §3.4 `resolveBrand` (monogram/tileColor/displayName), never-berry, MONOGRAM_LETTERS | 4 |
| §3.5 `/get-started` → resolveBrand → RPC → redirect | 5 |
| §3.6 Dashboard: header, 8 cards, glyphs, disabled stubs, RLS 404 | 6 |
| §3.7 unit + e2e + gates | 4 (unit), 7 (e2e + gates) |
| §4 ACs (magic link, branding persists, 8 categories, non-member denied, gates green, test:db unchanged) | 3, 5, 6, 7 |

**2. Placeholder scan** — no `TBD`/`TODO`/"handle edge cases"/"similar to Task N"; every code step shows complete code; every command has expected output.

**3. Type consistency** — `resolveBrand`/`resolveMonogram`/`resolveTileColor`/`TILE_PALETTE` (Task 4) are used with identical signatures in Tasks 5 & 6; server `createClient()` is awaited everywhere (Next 16 async); RPC arg names match the verified signature (`p_name`, `p_brand_color`, `p_methodology_version`, `p_denomination`, `p_context`, `p_attendance_band`, `p_adults_band`, `p_staff_fte_band`, `p_budget_band`, `p_church_age_band`, `p_growth_trajectory`); `methodology.questions.version` / `.questions.categories` / `.rules.enablers[id].gates` match `lib/methodology/schema.ts`; `params: Promise<{churchId}>` matches the `[churchId]` segment.

**Prime-directive check** — no task touches `lib/engine`/`lib/methodology`/migrations/tests; no service-role client; `test:db` unchanged; methodology is loaded, not hard-coded; `--berry` never used as a tile (palette excludes it, ChainGlyph only uses berry for `broken`, which is always false in M3).
