-- "Answer yourself" overwrite (Decision 3): one self-answer per member/item/run.
-- Partial — scoped to member rows so invited/accountless rows (many per item) are untouched.
create unique index responses_member_unique
  on public.responses (run_id, item_id, respondent_user_id)
  where respondent_kind = 'member' and respondent_user_id is not null;
