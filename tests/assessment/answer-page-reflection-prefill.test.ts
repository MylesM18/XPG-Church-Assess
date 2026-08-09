// Source-reading tripwire (node env, no DOM): page.tsx is an async Server Component and cannot be
// rendered directly in vitest (see tests/assessment/answer-anonymity-note.test.ts and
// tests/assessment/answer-readonly-when-complete.test.ts for the same convention on this exact
// file). Task 12 threads Task 6's third get_my_category_answers column (reflection) into
// initialReflections, and each item's methodology-level reflection prompt into the items map, so a
// resumed visit prefills the textarea and the wizard knows which items carry a prompt at all.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const page = stripComments(
  fs.readFileSync(
    path.join(ROOT, 'app', 'app', '[churchId]', 'answer', '[categoryId]', 'page.tsx'),
    'utf8',
  ),
)

describe('answer page: reflection prefill + forwarding', () => {
  it('carries reflection through the items map', () => {
    // Catches: `reflection: i.reflection` dropped, renamed, or reordered out of the items map.
    // Without it AnswerFormItem.reflection is always undefined, so AnswerForm's
    // `{currentItem.reflection && (...)}` never renders a textarea for ANY item — the whole
    // feature silently regresses with no type error, since the field is optional.
    expect(page).toContain(
      'const items = category.items.map((i) => ({ id: i.id, text: i.text, anchors: i.anchors, reflection: i.reflection }))',
    )
  })

  it('widens the saved-rows cast to the RPC’s real three-column shape', () => {
    // Catches: the cast left at its old { item_id; value } shape. row.reflection would then be a
    // type error if referenced (caught by tsc) — or silently `any`/unsound if the cast were dropped
    // instead of widened.
    expect(page).toContain('as { item_id: string; value: number; reflection: string | null }[]')
  })

  it('builds initialReflections keyed by item_id, skipping null/empty reflections', () => {
    // Catches: an unconditional assignment (no truthiness guard), which would seed the textarea
    // with the literal string "null" — or an empty-but-present entry — for every item the member
    // has answered but never reflected on.
    expect(page).toContain('const initialReflections: Record<string, string> = {}')
    expect(page).toContain('if (row.reflection) initialReflections[row.item_id] = row.reflection')
  })

  it('still builds initialValues exactly as before, in the same loop', () => {
    // Catches the resumable-progress prefill (pre-existing, unrelated to this task) regressing as a
    // side effect of restructuring the loop to add reflection support.
    expect(page).toContain('initialValues[row.item_id] = row.value')
  })

  it('forwards initialReflections to SelfForm, in the same element as initialValues', () => {
    // Catches the single most likely "looks done, does nothing" mistake for a pure-plumbing task:
    // initialReflections computed but never actually passed down to SelfForm.
    const selfFormStart = page.indexOf('<SelfForm')
    const selfFormEnd = page.indexOf('/>', selfFormStart)
    expect(selfFormStart).toBeGreaterThanOrEqual(0)
    expect(selfFormEnd).toBeGreaterThan(selfFormStart)
    const tag = page.slice(selfFormStart, selfFormEnd)
    expect(tag).toContain('initialValues={initialValues}')
    expect(tag).toContain('initialReflections={initialReflections}')
  })

  it('keeps the prefill RPC call scoped to church + category only (no user id from the client)', () => {
    // Catches a widened RPC call — e.g. adding a p_user_id/p_uid argument while wiring this up.
    // get_my_category_answers is security definer and already scopes to auth.uid() server-side;
    // passing an id from the client would be a real cross-member data-leak vector, not a style nit.
    expect(page).toContain("supabase.rpc('get_my_category_answers', {")
    expect(page).toContain('p_church_id: churchId')
    expect(page).toContain('p_category_id: categoryId')
    expect(page).not.toContain('p_user_id')
    expect(page).not.toContain('p_uid')
  })
})
