-- AO Supabase schema — version 0.1 (2026-04-22)
-- Run as a single migration. Safe to re-run on a fresh project; drops are intentionally omitted
-- so we don't nuke a populated db by accident.
--
-- Design notes:
--   - All tables keyed by Clerk user id (text, not uuid) captured from the Supabase JWT's `sub` claim.
--   - RLS policies assume Supabase is configured with Clerk as an external JWT issuer
--     (Clerk → Supabase template) so `auth.jwt()->>'sub'` resolves to the Clerk user id.
--   - Usage counters are materialized on agent_runs so we can bill + gate with one query.
--   - Plan + is_admin live in Clerk publicMetadata; we MIRROR them to users.plan / users.is_admin
--     on every sign-in via a webhook. Supabase queries read from the mirror (faster, joinable).

begin;

-- ─────────────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────────────
do $$ begin
  create type ao_plan as enum ('free', 'pro', 'team');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ao_run_status as enum ('queued', 'running', 'completed', 'failed', 'cancelled');
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────
-- Users (mirror of Clerk)
-- ─────────────────────────────────────────────────────────────────────
create table if not exists users (
  id              text primary key,               -- Clerk user id (e.g. "user_2abc...")
  email           text not null,
  full_name       text,
  plan            ao_plan not null default 'free',
  is_admin        boolean not null default false,
  stripe_customer text,                           -- Stripe customer id (mirrored from Clerk)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists users_email_idx on users(email);
create index if not exists users_plan_idx  on users(plan);

-- ─────────────────────────────────────────────────────────────────────
-- Orgs — a user can own multiple. Free plan is gated to 1 at the worker.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists orgs (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null references users(id) on delete cascade,
  slug       text not null,
  name       text not null,
  type       text,                   -- 'solo' | 'small-team' | 'agency' | ...
  roles      jsonb not null default '[]'::jsonb,
  operators  jsonb not null default '{}'::jsonb,
  status     text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);

create index if not exists orgs_user_idx on orgs(user_id);

-- ─────────────────────────────────────────────────────────────────────
-- Agent runs — the thing we bill on. Every flow execution or agent tick
-- writes exactly one row here.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists agent_runs (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null references users(id) on delete cascade,
  org_id        uuid references orgs(id) on delete set null,
  agent         text not null,               -- 'mkt' | 'dev' | 'cs' | ...
  flow_name     text,
  status        ao_run_status not null default 'queued',
  input         jsonb,
  output        jsonb,
  duration_ms   integer,
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  billing_month text generated always as (to_char(started_at, 'YYYY-MM')) stored
);

create index if not exists agent_runs_user_month_idx on agent_runs(user_id, billing_month);
create index if not exists agent_runs_org_idx on agent_runs(org_id);
create index if not exists agent_runs_status_idx on agent_runs(status);

-- ─────────────────────────────────────────────────────────────────────
-- Flow executions — normalized form of the client-side ao_flow_executions
-- blob. Separate from agent_runs because a single flow fans out to many
-- agent runs.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists flow_executions (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null references users(id) on delete cascade,
  org_id        uuid references orgs(id) on delete set null,
  flow_id       text not null,               -- 'lead_qualification' etc.
  flow_name     text,
  input         jsonb,
  node_outputs  jsonb,
  log           jsonb,
  duration_ms   integer,
  started_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create index if not exists flow_executions_user_idx on flow_executions(user_id, started_at desc);

-- ─────────────────────────────────────────────────────────────────────
-- Admin events — audit log for anything Jack (or another is_admin=true user)
-- does across the platform. Never user-scoped.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists admin_events (
  id         uuid primary key default gen_random_uuid(),
  actor_id   text not null references users(id) on delete cascade,
  action     text not null,
  target_id  text,
  payload    jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_events_actor_idx on admin_events(actor_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────
-- Usage view — single source of truth for the worker's plan gate.
-- Counts billable runs in the current calendar month per user.
-- ─────────────────────────────────────────────────────────────────────
create or replace view usage_current_month as
select
  u.id       as user_id,
  u.plan     as plan,
  to_char(now(), 'YYYY-MM') as billing_month,
  coalesce(count(ar.id), 0) as runs
from users u
left join agent_runs ar
  on ar.user_id = u.id
 and ar.billing_month = to_char(now(), 'YYYY-MM')
 and ar.status in ('completed', 'running')   -- failed/cancelled don't count
group by u.id, u.plan;

-- ─────────────────────────────────────────────────────────────────────
-- updated_at auto-bump
-- ─────────────────────────────────────────────────────────────────────
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists users_updated_at on users;
create trigger users_updated_at before update on users
  for each row execute function touch_updated_at();

drop trigger if exists orgs_updated_at on orgs;
create trigger orgs_updated_at before update on orgs
  for each row execute function touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- Row-Level Security
-- Every table except admin_events is self-service for the owner.
-- admin_events: writers = anyone, readers = admins only.
-- ─────────────────────────────────────────────────────────────────────
alter table users           enable row level security;
alter table orgs            enable row level security;
alter table agent_runs      enable row level security;
alter table flow_executions enable row level security;
alter table admin_events    enable row level security;

-- users: you can see and update your own row; admins can see everyone.
drop policy if exists users_self_select on users;
create policy users_self_select on users
  for select using (
    id = auth.jwt()->>'sub'
    or exists (
      select 1 from users me
      where me.id = auth.jwt()->>'sub' and me.is_admin = true
    )
  );

drop policy if exists users_self_update on users;
create policy users_self_update on users
  for update using (id = auth.jwt()->>'sub');

-- orgs
drop policy if exists orgs_owner_all on orgs;
create policy orgs_owner_all on orgs
  for all
  using (user_id = auth.jwt()->>'sub')
  with check (user_id = auth.jwt()->>'sub');

drop policy if exists orgs_admin_read on orgs;
create policy orgs_admin_read on orgs
  for select using (
    exists (
      select 1 from users me
      where me.id = auth.jwt()->>'sub' and me.is_admin = true
    )
  );

-- agent_runs
drop policy if exists agent_runs_owner_all on agent_runs;
create policy agent_runs_owner_all on agent_runs
  for all
  using (user_id = auth.jwt()->>'sub')
  with check (user_id = auth.jwt()->>'sub');

drop policy if exists agent_runs_admin_read on agent_runs;
create policy agent_runs_admin_read on agent_runs
  for select using (
    exists (
      select 1 from users me
      where me.id = auth.jwt()->>'sub' and me.is_admin = true
    )
  );

-- flow_executions
drop policy if exists flow_executions_owner_all on flow_executions;
create policy flow_executions_owner_all on flow_executions
  for all
  using (user_id = auth.jwt()->>'sub')
  with check (user_id = auth.jwt()->>'sub');

-- admin_events
drop policy if exists admin_events_admin_read on admin_events;
create policy admin_events_admin_read on admin_events
  for select using (
    exists (
      select 1 from users me
      where me.id = auth.jwt()->>'sub' and me.is_admin = true
    )
  );

drop policy if exists admin_events_actor_insert on admin_events;
create policy admin_events_actor_insert on admin_events
  for insert with check (actor_id = auth.jwt()->>'sub');

-- ─────────────────────────────────────────────────────────────────────
-- Leads — public-form submissions. Anonymous (no Clerk session required).
-- The worker validates + scores + inserts; this is the persistence layer for
-- /ao/index.html's contact form and any future /ao/api/leads webhook source.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists leads (
  id           uuid primary key default gen_random_uuid(),
  name         text,
  email        text not null,
  company      text,
  message      text,
  inquiry_type text,                     -- 'demo' | 'client' | 'partner' | 'newsletter' | 'general'
  source       text,                     -- referring page or campaign tag
  user_agent   text,
  ip           text,                     -- captured from Cloudflare CF-Connecting-IP
  -- Scoring fields populated by the worker via the same lead-qualification
  -- logic that flows.html runs. Lets us sort + triage in admin without re-running.
  score        integer,
  tier         text,                     -- 'starter' | 'growth' | 'enterprise'
  qualified    boolean,
  sentiment    text,                     -- 'cold' | 'warm' | 'high-intent'
  notes        text,                     -- scoring rationale, semicolon-joined
  -- Pipeline state. Defaults to 'new'; CS / EA agents move it forward.
  status       text not null default 'new',
                                          -- 'new' | 'replied' | 'qualified' | 'won' | 'lost' | 'spam'
  responded_at timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists leads_email_idx       on leads(email);
create index if not exists leads_created_at_idx  on leads(created_at desc);
create index if not exists leads_status_idx      on leads(status);
create index if not exists leads_tier_idx        on leads(tier);

-- ─────────────────────────────────────────────────────────────────────
-- Plan limits helper — single place to bump the quota table.
-- ─────────────────────────────────────────────────────────────────────
create or replace function plan_monthly_limit(p ao_plan) returns integer as $$
begin
  return case p
    when 'free' then 100
    when 'pro'  then 2000
    when 'team' then 10000
    else 0
  end;
end;
$$ language plpgsql immutable;

-- Leads RLS — admins read everything, the worker writes via service role
-- (bypasses RLS). Anonymous public reads NEVER allowed.
alter table leads enable row level security;

drop policy if exists leads_admin_read on leads;
create policy leads_admin_read on leads
  for select using (
    exists (
      select 1 from users me
      where me.id = auth.jwt()->>'sub' and me.is_admin = true
    )
  );

drop policy if exists leads_admin_update on leads;
create policy leads_admin_update on leads
  for update using (
    exists (
      select 1 from users me
      where me.id = auth.jwt()->>'sub' and me.is_admin = true
    )
  );

commit;
