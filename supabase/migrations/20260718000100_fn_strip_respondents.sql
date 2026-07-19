-- strip_respondents: removes the per-person name-to-score list from a stored diagnosis
-- payload, leaving every other key intact. Kept standalone and IMMUTABLE (it touches no
-- table) so pgTAP can exercise it directly against crafted payloads, and so the SQL half
-- of M6a's defence-in-depth is testable independently of any RPC.
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
