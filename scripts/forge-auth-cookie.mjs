// Forges the sb-<ref>-auth-token cookie from a GoTrue password grant, so curl can fetch
// authenticated pages without a browser. Sidesteps PKCE and the 0x0-viewport preview bug.
//
// Usage: node scripts/forge-auth-cookie.mjs <email> <password>
// Prints a Cookie header value suitable for `curl -b "$(node scripts/forge-auth-cookie.mjs ...)"`.
import { createChunks, stringToBase64URL } from '@supabase/ssr'

const [email, password] = process.argv.slice(2)
if (!email || !password) {
  console.error('usage: node scripts/forge-auth-cookie.mjs <email> <password>')
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!anon) {
  console.error('NEXT_PUBLIC_SUPABASE_ANON_KEY must be set (source it from .env.local)')
  process.exit(1)
}

const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: anon },
  body: JSON.stringify({ email, password }),
})

if (!res.ok) {
  console.error(`password grant failed: ${res.status} ${await res.text()}`)
  process.exit(1)
}

const session = await res.json()

// The cookie name is derived from the project ref — the first label of the Supabase host.
// Locally that host is 127.0.0.1, so the ref is "127" and the name is sb-127-auth-token.
const ref = new URL(url).hostname.split('.')[0]
const name = `sb-${ref}-auth-token`

const value = `base64-${stringToBase64URL(JSON.stringify(session))}`
const chunks = createChunks(name, value)

console.log(chunks.map((c) => `${c.name}=${c.value}`).join('; '))
