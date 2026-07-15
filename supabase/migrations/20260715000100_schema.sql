-- Cairn M2 — full schema (Engineering Spec §4 + invited-leader-accounts design §4).
-- Every table is RLS-enabled here with NO policies (default-deny). Policies land in 20260715000400.

-- ── CHURCHES ─────────────────────────────────────────────────────────────
create table public.churches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  denomination text,
  context text,                    -- urban | suburban | small_town | rural
  attendance_band text,
  adults_band text,
  staff_fte_band text,
  budget_band text,
  church_age_band text,
  growth_trajectory text,
  brand_color text not null,       -- resolved monogram tile color
  logo_url text,                   -- nullable, future
  created_by uuid references auth.users not null,
  created_at timestamptz default now()
);

-- ── MEMBERSHIP = the permission table ────────────────────────────────────
create table public.church_members (
  id uuid primary key default gen_random_uuid(),
  church_id uuid references public.churches on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  role text not null check (role in ('admin','viewer')),
  granted_by uuid references auth.users,
  created_at timestamptz default now(),
  unique (church_id, user_id)
);

-- ── ASSESSMENT RUN (v1: one active run per church) ───────────────────────
create table public.assessment_runs (
  id uuid primary key default gen_random_uuid(),
  church_id uuid references public.churches on delete cascade not null,
  methodology_version text not null,
  status text not null default 'in_progress' check (status in ('in_progress','complete')),
  created_at timestamptz default now(),
  completed_at timestamptz
);

-- ── INVITATION (respondent, Type A) — the id IS the token ────────────────
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.assessment_runs on delete cascade not null,
  church_id uuid references public.churches on delete cascade not null,
  category_id text not null,
  invited_name text,
  invited_contact text,
  channel text check (channel in ('email','sms')),
  status text not null default 'pending' check (status in ('pending','completed','revoked')),
  created_by uuid references auth.users not null,
  created_at timestamptz default now(),
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days')
);

-- ── RESPONSES ────────────────────────────────────────────────────────────
create table public.responses (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.assessment_runs on delete cascade not null,
  church_id uuid references public.churches on delete cascade not null,  -- denormalized for RLS
  category_id text not null,
  item_id text not null,
  value int not null check (value between 1 and 10),
  respondent_kind text not null check (respondent_kind in ('invited','member')),
  invitation_id uuid references public.invitations on delete set null,
  respondent_user_id uuid references auth.users,
  respondent_label text not null,
  created_at timestamptz default now()
);

-- ── DIAGNOSIS cache ──────────────────────────────────────────────────────
create table public.diagnoses (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.assessment_runs on delete cascade not null,
  response_hash text not null,
  methodology_version text not null,
  payload jsonb not null,
  prose jsonb,
  prose_source text check (prose_source in ('ai','fallback')),
  generated_at timestamptz default now(),
  unique (run_id, response_hash)
);

-- ── OPTIONAL share links (table-only in M2; policies + flow are M6) ───────
create table public.report_shares (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.assessment_runs on delete cascade not null,
  church_id uuid references public.churches on delete cascade not null,
  created_by uuid references auth.users not null,
  revoked boolean not null default false,
  created_at timestamptz default now(),
  expires_at timestamptz
);

-- ── PROFILES (account-holders only; 1:1 with auth.users) ─────────────────
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  created_at timestamptz default now()
);

-- ── MEMBER_INVITATIONS (account-holder invites, Type B) — the id IS token ─
create table public.member_invitations (
  id uuid primary key default gen_random_uuid(),
  church_id uuid references public.churches on delete cascade not null,
  role text not null check (role in ('admin','viewer')),
  invited_email text not null,
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  expires_at timestamptz not null,
  accepted_by uuid references auth.users,
  created_by uuid references auth.users not null,
  created_at timestamptz default now()
);

-- ── profiles auto-create trigger (standard Supabase pattern) ─────────────
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── RLS ENABLE on every table (default-deny; policies added in 000400) ────
alter table public.churches            enable row level security;
alter table public.church_members      enable row level security;
alter table public.assessment_runs     enable row level security;
alter table public.invitations         enable row level security;
alter table public.responses           enable row level security;
alter table public.diagnoses           enable row level security;
alter table public.report_shares       enable row level security;
alter table public.profiles            enable row level security;
alter table public.member_invitations  enable row level security;
