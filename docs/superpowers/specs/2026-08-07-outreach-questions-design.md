# Outreach Questions — Design Spec

**Date:** 2026-08-07 · **Status:** Approved design, awaiting implementation plan · **Methodology:** 0.2.0 → 0.3.0

## Goal

Restore the original consulting report's "Outreach & Community Impact" theme by weaving outreach into all 8 existing sections — no 9th section. Ten new items (1–2 per section): each is an ordinary required 1–10 anchored rating plus an **optional typed reflection** (short free text). Ratings score deterministically like any other item; text is qualitative only — displayed, never scored.

## Locked decisions

1. **Meaning:** outreach = topic woven into all 8 sections.
2. **Format:** required 1–10 anchored rating + optional paired free text. Text never affects any score.
3. **Weight:** equal — outreach ratings are ordinary items in the section's plain mean.
4. **Completeness:** rating required (`answered === total` semantics untouched); text optional.
5. **Who answers:** same as any item — invited leaders for their assigned section, admin for all.
6. **Report:** per-section "Voices on outreach" blocks; text renders **unattributed** on the signed-in report and PDF, **never** on `/r/[shareToken]`; AI prose may quote only where raw text is allowed (v1 ships prose unchanged — see AI prose).
7. **Migration:** 0.3.0 applies to everyone including in-flight runs; completed runs stay frozen via the `diagnoses` cache `methodology_version` stamp. Closed-window members are unstuck by the "closed window, closed test" exemption (see Migration).
8. **Question set:** all 10 approved — core 8 (G6, C6, D6, V6, GEN6, GOV6, COM6, SYS6) plus extras G7 and COM7. Guest Experience and Communication carry 7 items; the other six sections carry 6.

## The questions (approved wording)

Appended to their categories in `methodology/questions.yaml`. `since` and `reflection` are new optional item fields (see Data model).

```yaml
# Guest Experience → G6
- id: G6
  text: "When your church meets people out in the community — a serve day, an event — does anything connect them to a Sunday?"
  signal: evidence
  since: "0.3.0"
  anchors:
    lo: "No. Community moments stay out there; we hope people show up on their own."
    mid: "We invite people personally, but there's no consistent bridge from an encounter to a visit."
    hi: "There's a deliberate bridge — invitations, info we capture, follow-up — and we can name guests who came through it."
  reflection: "Tell about one person who first met your church outside its walls. What happened next?"

# Guest Experience → G7 (invitation culture)
- id: G7
  text: "When did you last hear of someone showing up because one of your people invited them?"
  signal: evidence
  since: "0.3.0"
  anchors:
    lo: "I can't remember one. Inviting isn't part of our culture."
    mid: "It happens now and then; a few natural inviters carry it."
    hi: "Regularly — invitation stories are normal here, and we hear new ones monthly."
  reflection: "Tell the most recent invitation story you know — who invited whom, and what happened?"

# Community / Connection → C6
- id: C6
  text: "Could someone far from church find real belonging here before they believe?"
  signal: belief
  since: "0.3.0"
  anchors:
    lo: "Honestly, no. Our community life assumes you're already one of us."
    mid: "They'd be welcomed warmly, but our groups and rhythms aren't built with outsiders in mind."
    hi: "Yes — neighbors and skeptics are inside our community life right now, belonging on the way to believing."
  reflection: "Where does your church currently make room for people who don't yet believe? Name a place or group."

# Discipleship / Leadership → D6
- id: D6
  text: "Does your discipleship send people outward — into neighborhoods, schools, and workplaces — or mainly deeper into church life?"
  signal: belief
  since: "0.3.0"
  anchors:
    lo: "Inward. Growth here mostly means more involvement at church."
    mid: "We talk about being sent, but we don't equip people for it or ask about it."
    hi: "Being formed here means being sent — our people carry faith into their week, and we equip them for it."
  reflection: "Describe one way someone discipled here carried it into their neighborhood, school, or workplace."

# Volunteer → V6
- id: V6
  text: "How much of the serving here happens beyond Sunday — out in the community?"
  signal: evidence
  since: "0.3.0"
  anchors:
    lo: "Almost none. Serving means running our own services and programs."
    mid: "A few serve projects a year, driven by bursts of enthusiasm."
    hi: "Serving the community is a standing part of our volunteer culture, with teams that exist for it."
  reflection: "What's one way your volunteers served the community recently? Who showed up?"

# Generosity → GEN6 (distinct from GEN5: GEN5 = vision vs survival; GEN6 = money visibly reaching the community)
- id: GEN6
  text: "Does your church's money visibly reach your community — benevolence, local partners, real needs met?"
  signal: evidence
  since: "0.3.0"
  anchors:
    lo: "Rarely. Nearly everything we collect stays inside our own operations."
    mid: "We give some, reactively, when needs find us."
    hi: "A deliberate share of our budget serves the community, and we could name the partners and needs it funds."
  reflection: "Name one need in your community your church's generosity met this year."

# Governance / Accountability → GOV6
- id: GOV6
  text: "Is your community's good anyone's actual responsibility at the leadership level?"
  signal: evidence
  since: "0.3.0"
  anchors:
    lo: "No. Outreach happens if someone's passionate; leadership doesn't own it."
    mid: "Leadership values it and blesses efforts, but no one owns it and it's rarely on the agenda."
    hi: "Someone owns community engagement, and it shows up in our planning and decisions."
  reflection: "Who, if anyone, owns your church's presence in the community? How did that come to be?"

# Communication → COM6
- id: COM6
  text: "If you asked ten neighbors near your building what your church contributes to the community, what would they say?"
  signal: belief
  since: "0.3.0"
  anchors:
    lo: "Most wouldn't know we exist, or would just say 'it's a church.'"
    mid: "Some would recognize us and mention an event or two."
    hi: "Most could name something specific we do for this community — our reputation runs ahead of us."
  reflection: "What do you think your community would say your church is known for? Be honest."

# Communication → COM7 (community listening)
- id: COM7
  text: "Do you actually know your community's current needs, or assume them?"
  signal: evidence
  since: "0.3.0"
  anchors:
    lo: "We assume. Our outreach reflects what we like to do."
    mid: "We know some needs through relationships, but we've never really asked."
    hi: "We've listened deliberately — asked neighbors, schools, or partners — and it shapes what we do."
  reflection: "How did your church last learn something new about what your community needs?"

# Org Structure / Systems → SYS6
- id: SYS6
  text: "Do your community efforts run on systems — owned partnerships, follow-up, a rhythm — or on bursts of enthusiasm?"
  signal: evidence
  since: "0.3.0"
  anchors:
    lo: "Enthusiasm. Outreach is one-off events that depend on whoever's excited."
    mid: "Some recurring efforts, but partnerships and follow-up live in people's heads."
    hi: "Outreach runs on a rhythm — named partners, owned relationships, and follow-up that doesn't depend on any one person."
  reflection: "List the community partnerships your church has right now. Who owns each one?"
```

**Signal rationale (locked default: belief unless countable/nameable).** Evidence: G6, G7, V6, GEN6, GOV6, COM7, SYS6 (7). Belief: C6, D6, COM6 (3).

## Data model & schema

**Methodology (`methodology/questions.yaml`).** `version: "0.3.0"`. Items gain two optional fields: `reflection` (string — the typed-answer prompt; presence turns on the textarea) and `since` (string — methodology version that introduced the item; used by the closed-window exemption). Only the 10 new items carry them; existing items untouched.

**Zod (`lib/methodology/schema.ts`).** On the item schema: `reflection: z.string().min(1).optional()` and `since: z.string().min(1).optional()`. No new item type; `categories.length(8)` and all existing validation unchanged. The engine (`lib/engine/normalize.ts`, `assemble.ts`, `throughput.ts`) never reads either field → **zero engine changes**.

**DB migration (new file under `supabase/migrations/`).**

```sql
alter table public.responses add column reflection text
  check (reflection is null or char_length(reflection) between 1 and 2000);
```

Rating stays `value int not null check (value between 1 and 10)` on the same row → text physically cannot exist without a rating (decision 4 enforced by shape). App trims input; empty → NULL.

**Write path.** `submit_self_response` (latest definition: `supabase/migrations/20260801000400_rpc_submit_self_response_deadline_lock.sql`) is `CREATE OR REPLACE`d with a new trailing parameter `p_reflection text default null`, validated in-function (trim; empty → NULL; reject > 2000 chars) and written to the column on insert/update. It is the **only** live submit RPC — `submit_invited_response` was dropped in `20260724000300_drop_invitations_system.sql`. No new tables, no service-role client, no new dependencies. If a caller hand-submits reflection text for an item without a `reflection` prompt, it stores harmlessly and never renders (rendering is keyed off the methodology).

## Answer form (`components/answer-form.tsx`)

One variant, no new components. When the current item has `reflection`, render an optional textarea directly beneath the existing slider + anchors block; items without it render exactly as today.

- **Label:** the `reflection` string, with a small "Optional" tag. No placeholder.
- **Validation:** unchanged — "choose a value" gates on the slider only; text never blocks in either direction.
- **Limits:** `maxLength` 2000; a character counter appears only within 200 chars of the cap. ~4-row textarea, scrolls.
- **Submit:** text travels in the same `submit_self_response` call as the rating — one write per item. Trimmed; empty → NULL. Re-answering overwrites both fields together; the form pre-fills both from the saved response.
- **Progress:** completion counts ratings only, so progress bars, the per-section interstitial, and deadline-window UX are untouched.
- **Accessibility:** `<label>` bound to the textarea, `aria-describedby` for the optional hint — same conventions as the slider block.

## Report, PDF, and anonymity

**View-model (`lib/report/view.ts`) — single source of truth.** Each section gains `outreachVoices`: per outreach item, `{itemId, reflectionPrompt, entries: string[]}` — trimmed reflection texts from all respondents, **sorted alphabetically** (deterministic; decorrelated from submission order so ordering can't hint authorship). Populated only for `ReportAudience` `'screen'` and `'pdf'`; for `'shared'` the builder never includes it — **exclusion at the data layer**, so `/r/[shareToken]` cannot leak what it is never given.

**Signed-in screen (`app/app/[churchId]/diagnosis/report/*`).** Per section, a "Voices on outreach" block after existing content: reflection prompt as lead-in, entries as unattributed pull-quotes. Items with zero texts render no group; sections with zero texts skip the block. No empty states.

**PDF (`lib/report/pdf/document.tsx`).** Same block from the same view-model. The fail-closed guard (`lib/report/pdf/render.ts:28`) continues stripping attribution metadata.

**Anonymity notes.** `components/anonymity-note.tsx` gains one sentence: written reflections are shown unattributed. Respondent-*written* content renders verbatim — if a respondent types a name inside their answer it appears; one line near the block says so. Small-n honesty: with one invited leader + admin per section, an unattributed quote may be inferable by elimination — same accepted limitation as the existing dispersion display.

**AI prose (`lib/ai/prose.ts`, fallback `lib/ai/fallback.ts`).** **v1: unchanged.** Reflection text is not fed to prose generation on any surface — zero AI changes, zero leak risk; the voices blocks carry the text. Standing rule for any future enrichment: reflection text may be an input (and quotes may appear) **only** for surfaces where raw text is allowed (signed-in screen, PDF) — never for `'shared'`. The deterministic fallback never quotes; the report renders fully with AI off, as today.

## Migration & rollout

One deploy carries the YAML bump, zod fields, SQL migration, RPC replacement, form variant, and report blocks. No feature flag, no backfill.

- **Completed runs:** frozen — `diagnoses` cache is stamped with `methodology_version`; nothing recomputes; no existing report changes.
- **In-flight runs:** methodology loads current at read time, so totals grow immediately; members with open windows answer the new items as normal.
- **Closed-window exemption ("closed window, closed test").** For a member whose completion window is closed (`church_members.assessment_deadline_at` in the past) on a run that predates 0.3.0 (`assessment_runs.methodology_version < '0.3.0'` — stamped at run creation, already exists), items with `since: "0.3.0"` are excluded from that member's `total` in the completeness computation. They are measured against the test that existed while their window was open; their section scores the plain mean of what they answered. No emails, no detection script — the exemption lives in the completeness path (`lib/coverage/diagnosis-gate.ts` adapters `diagnosisGate` / `diagnosisGateFromMatrix`, plus `lib/report/derive.ts` where it derives answered/total). Runs created under 0.3.0 get no exemption. Implementation note for the plan: verify whether any SQL coverage RPC also compares counts against totals and needs the same rule, and confirm how per-member window state reaches the gate adapters.
- **Version comparison:** compare as semver-ish string on the minor (`'0.2.0' < '0.3.0'` lexicographically holds for these values); the plan may pin an explicit helper if one exists.

## Benchmarks

Untouched in v1. `methodology/benchmarks.yaml` percentiles are synthetic and calibrated against the 0.2.0 item mix; the new items fold into plain means so the shift is bounded. Forward note: the next recalibration (or move to data-driven benchmarks) baselines against the 0.3.0 mix.

## Testing

Gates: `tsc` 0 · eslint 0 · vitest green · build clean. (`npm run test:db` is owner-run only.)

- **Zod:** `reflection`/`since` accepted and optional; empty string rejected; 0.3.0 YAML parses with 8 categories.
- **Completeness (densest coverage — highest-risk logic):** pre-0.3.0 run + closed window excludes `since`-items from `total`; open window counts them; 0.3.0-native run + closed window gets no exemption; boundary at `assessment_deadline_at` exactly now.
- **View-model:** entries trimmed, alphabetically sorted; zero-text items/sections omitted; `'shared'` audience payload proven (type + runtime) to lack `outreachVoices`.
- **Form:** textarea only when `reflection` present; rating-only submit valid; text never blocks; prefill on revisit; counter behavior at the cap.
- **pgTAP (owner-run):** column CHECK bounds (NULL ok, 1–2000 ok, >2000 rejected, empty rejected); RPC trims, nullifies empty, rejects oversized, writes text only alongside a valid rating.
- **PDF:** render smoke with voices present and absent.

## Out of scope (v1)

- AI prose quoting reflections (rule carved above; not wired).
- Benchmark recalibration.
- Admin "reopen window" action for fuller 0.3.0 coverage on in-flight runs.
- Any attribution UI or admin raw-text view beyond the report blocks.
- Share-view (`/r/[shareToken]`) rendering of any reflection content, in any form.
