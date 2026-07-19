-- At most one live share per run. `revoked` is a plain column, so this predicate is
-- immutable and indexable. Expiry is deliberately NOT in the predicate — a now()
-- comparison is not immutable. create_report_share revokes an expired-but-unrevoked
-- row before minting, which keeps "one active link per run" true without it.
create unique index report_shares_one_active_per_run
  on public.report_shares (run_id) where not revoked;
