# M6a — Opt-in Public Share Links (design)

**Date:** 2026-07-18
**Milestone:** M6a (first of three; M6b = marketing landing, M6c = responsive/a11y polish)
**Status:** approved, ready for implementation planning

## Why M6 is split

`XPG-Engineering-Spec.md:505` scopes M6 as "Landing + Share + Polish". Those are three
independent subsystems: the landing page is pure frontend with no database surface, share
links add an unauthenticated read path to confidential data, and polish is a breadth sweep
across every route M0–M5 shipped. They share no code and have very different risk profiles.
M5 was split a/b/c/d for the same reason. M6a covers share links only.

M6c (polish) is sequenced last deliberately, so it sweeps a finished surface rather than one
that is about to change.

## Goal

An admin can mint a revocable, expiring link that lets someone **without an account** read a
church's diagnosis report — and nothing else. Acceptance criterion from the engineering spec:
*"a share link renders read-only and stops working when revoked."*

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Links per run | Exactly one active | One obvious dashboard state: shared, or not |
| Expiry | `now() + 30 days` at mint | Bounds the blast radius of a forwarded URL |
| Shared content | New `ReportAudience` value `'shared'` | Distinct from `'pdf'` so the two cannot silently drift |
| Respondent names | Stripped in SQL **and** at render | Defence in depth on an unauthenticated surface |
| PDF from share link | Out of scope | Keeps M6a to exactly one new public surface |
| Write path | Server actions | Matches every other dashboard mutation |

### Recorded spec deviation

`XPG-Engineering-Spec.md:39` specifies `POST / DELETE /api/report-share`. We implement mint and
revoke as **server actions** instead. The spec line predates this codebase's convergence on
server actions for dashboard mutations (`createInvitation`, `generateDiagnosis`, the M5d access
panel are all server actions). Server actions also give CSRF protection and progressive
enhancement for free, and avoid adding a second public route to this milestone's review surface.

**M6a must amend `XPG-Engineering-Spec.md:39` to match**, so the canonical spec stays truthful.
The route list at `:29–:39` should read `/r/[shareToken]` as the only new public route.

## Architecture

### Surfaces

| Surface | Auth | Purpose |
|---|---|---|
| `/r/[shareToken]` | public | Read-only report rendered with `audience: 'shared'` |
| `shareReport(runId)` server action | admin | Mint, or return the existing active link |
| `revokeReportShare(runId)` server action | admin | Revoke; the URL 404s immediately |
| Share control on `/app/[churchId]/diagnosis` | admin | Beside the existing **Download PDF** link |

No middleware change is required. `middleware.ts` only refreshes the Supabase session; it does
not gate routes (protection is per-page). `/r/[shareToken]` is therefore public by default.

### Data model

`public.report_shares` already exists from M2 (`20260715000100_schema.sql:88`) with exactly the
columns needed: `id` (the token), `run_id`, `church_id`, `created_by`, `revoked`, `created_at`,
`expires_at`. **No new table.** It has no RLS policy and stays default-deny; the RPCs below are
its sole readers and writers, consistent with `20260715000400_rls_policies.sql:67`.

One migration adds a partial unique index:

```sql
-- At most one live share per run. `revoked` is a plain column, so this predicate is
-- immutable and indexable. Expiry is enforced in the RPC, not here — a now() predicate
-- would not be immutable.
create unique index report_shares_one_active_per_run
  on public.report_shares (run_id) where not revoked;
```

An *expired but unrevoked* row still occupies the slot. `create_report_share` therefore revokes
it before minting a replacement, which keeps "one active link per run" true without a
non-immutable index predicate.

### RPCs

Five functions. The four that touch `report_shares` are
`security definer set search_path = public`, following the established idiom in
`rpc_create_member_invitation.sql`. The `strip_respondents` helper is a pure `immutable`
function that touches no table and therefore needs neither.

**`strip_respondents(p_payload jsonb) returns jsonb`** — `immutable`. Rewrites every element of
`dispersion_flags` so its `respondents` array is empty, leaving the rest of the payload intact.
Standalone and immutable so pgTAP can test it directly against crafted payloads:

```sql
create function public.strip_respondents(p_payload jsonb)
returns jsonb language sql immutable as $$
  select case
    when p_payload ? 'dispersion_flags' then jsonb_set(
      p_payload, '{dispersion_flags}',
      coalesce((
        select jsonb_agg(jsonb_set(flag, '{respondents}', '[]'::jsonb))
        from jsonb_array_elements(p_payload->'dispersion_flags') as flag
      ), '[]'::jsonb))
    else p_payload
  end;
$$;
```

**`create_report_share(p_run_id uuid) returns uuid`** — admin-gated. Raises
`insufficient_privilege` when `auth.uid()` is null or is not an `admin` of the run's church,
matching `create_member_invitation` verbatim. If a live share exists it returns that token
unchanged; otherwise it revokes any expired row and inserts a new one with
`expires_at = now() + interval '30 days'`.

**`revoke_report_share(p_run_id uuid) returns void`** — same admin guard; sets `revoked = true`
for the run's active row. Idempotent: revoking when nothing is active is a no-op, not an error.

**`get_report_share(p_run_id uuid) returns table(token uuid, expires_at timestamptz)`** —
admin-gated, read-only, `grant execute to authenticated` only. Added because `report_shares` has
RLS enabled with **zero policies**, so the diagnosis page cannot `select` from it directly to
learn whether a run is currently shared. (Base-table grants ARE present — inherited from
Supabase's template `grant all on all tables in schema public` — but are **inert**: no policy
means no rows are visible. Verified: `set role anon; select count(*) from report_shares;` returns
0. This is project-wide and pre-existing, not M6a-specific — all 18 role/table pairs across all 9
public tables carry the same 7 template privileges, and `invitations` and `responses` sit in the
identical posture. Tightening the grant layer is tracked at
`docs/superpowers/specs/2026-07-15-m3-app-shell-auth-dashboard-branding-design.md:152`.) `create_report_share` cannot serve as this reader — it
is a writer, and calling it during render would mint a link merely by visiting the page. Returns
zero rows when no live share exists.

**`get_shared_report(p_token uuid)`** — `grant execute to anon, authenticated`. Returns
`(valid boolean, payload jsonb, prose jsonb, church_name text, brand_color text)`.

The security contract mirrors `get_invitation_context` exactly: a revoked token, an expired
token, and a token that never existed all return the **identical** invalid row
`(false, null, null, null, null)`. There is no oracle distinguishing them. The returned payload
is passed through `strip_respondents` so respondent names never leave Postgres on this path.

### Render path

`ReportAudience` becomes `'screen' | 'pdf' | 'shared'`. In `buildReportView`:

- `'shared'` empties `dispersion.respondents`, as `'pdf'` already does — a share link leaves the
  permission wall just as a downloaded PDF does, and more easily, since a URL can be forwarded.
- `'shared'` additionally drops the next-step CTA. It is an admin action a board member cannot take.

The narrative `dispersion` text still renders; only the per-person name-to-score list is removed.
This matches the existing PDF behaviour documented at `lib/report/view.ts:30`.

**The trap this design guards against:** the stored `payload` genuinely contains respondent
names — the local fixture diagnosis has them. Two independent mechanisms must both fail before a
name can leak: the SQL strip in `get_shared_report`, and the `'shared'` audience rule in
`buildReportView`. Both cover `payload` only — AI `prose` is in scope for neither, which is why
`get_shared_report` no longer returns a `prose` column at all (`20260718000600`) and the page
renders deterministic `fallbackProse` unconditionally. Prose is structurally absent from the anon
path, not merely unused. Additionally, `/r/[shareToken]/page.tsx` must be a **Server Component** that
passes only the built `ReportView` to any child, never the raw payload — otherwise names would
travel to the browser inside RSC flight data while remaining invisible in the rendered page.

### Error handling

- Malformed (non-UUID) `shareToken` → `notFound()` before any database call, as the PDF route does.
- `valid = false` from the RPC → `notFound()`. Never a 403. Revoked, expired, and nonexistent
  must stay indistinguishable, the same invariant the PDF route holds for run ids.
- RPC error (as opposed to an invalid row) → log the reason only, never payload or respondent
  data, and render a generic failure. Consistent with the PDF route's `console.warn` pattern.
- Server actions surface admin-guard failures as a form-level message; they never reveal whether
  the run exists.

## Testing

The M5c lesson recorded in the session-61 handoff — *a two-operand gate can pass while never
executing* — applies directly. Every zero-match confidentiality assertion gets a **positive
control** proving the detector fires before a zero result is trusted.

**pgTAP** (new test file; existing suite is Files=16 / Tests=154)
- `strip_respondents` empties `respondents` and preserves every other key; handles a payload with
  no `dispersion_flags` key and one with an empty array.
- Admin can mint; a `viewer` and a non-member both get `insufficient_privilege`.
- Minting twice returns the same token; minting after expiry returns a new one and revokes the old.
- `report_shares_one_active_per_run` rejects a second unrevoked row for the same run.
- `get_shared_report` returns byte-identical invalid rows for revoked, expired, and unknown tokens.
- `get_shared_report` on a valid token returns a payload whose `respondents` arrays are all empty.

**Vitest**
- `buildReportView` with `audience: 'shared'` empties respondents and drops the CTA.
- `'shared'` and `'pdf'` are asserted separately, so a future change to one cannot silently
  redefine the other.

**Runtime verification — by fetching, not reading**
1. Mint a link for fixture run `f5451c2b-9646-4f30-b1d6-9f35c12c9367`.
2. `curl` `/r/<token>` with **no** cookie → 200, report content present.
3. Grep the full response body for each fixture respondent name → 0 matches.
4. **Positive control:** the same grep against the authenticated `/app/<churchId>/diagnosis`
   response *does* match. Without this, step 3 proves nothing.
5. Revoke, re-fetch → 404, and confirm the body is identical to a nonexistent token's.

Authentication for steps 2–5 uses the cookie-forging technique from session 61 (GoTrue
password-grant → `stringToBase64URL` + `createChunks` → `curl -b`), which sidesteps PKCE and the
0x0-viewport preview bug.

## Out of scope

- **No PDF on the shared page.** `/api/report/[runId]/pdf` keeps its 401-without-session
  behaviour. Admins can already download and email the file.
- **No multi-link / per-recipient links.** One active link per run.
- **The deferred prose cache bug** at `app/app/[churchId]/actions.ts:118-121` is *not* folded in.
  It remains a separate prerequisite for any multi-run flow.
- `next.config.ts` and `vitest.config.ts` are not touched.
- M6b (landing) and M6c (polish) are separate specs.

## Constraints carried from prior milestones

- `npm run test:db` must never run — `seed.sql` is 0 bytes and wiping it destroys the local
  e2e fixtures.
- anon key + RLS only. No service-role client in application code.
- The methodology stays versioned YAML; the engine stays deterministic and AI stays additive.
- `.superpowers/` stays untracked.
