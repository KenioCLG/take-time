-- ============================================================
-- TAKE TIME — Checkins & Affirmations tables
-- Rodar no Supabase Dashboard > SQL Editor
-- ============================================================

-- ========================================
-- 1. AFFIRMATIONS (identity affirmations for atomic check-in)
-- ========================================
create table if not exists public.affirmations (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  version integer not null default 1,
  created_at timestamptz default now(),
  retired_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ========================================
-- 2. CHECKINS (daily morning/evening check-in records)
-- ========================================
create table if not exists public.checkins (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  -- Morning fields
  morning_sleep real,
  morning_energy integer,
  morning_mood text,
  morning_affirmation text,
  morning_focus text,
  morning_ts timestamptz,
  -- Evening fields
  evening_confirmed text,
  evening_recharged text,
  evening_drained text,
  evening_next_action text,
  evening_next_time text,
  evening_ts timestamptz,
  -- Habit tracking
  habit_log jsonb not null default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz not null default now()
);

-- Unique constraint: one checkin per user per date
create unique index if not exists checkins_user_date_idx on public.checkins(user_id, date);

-- ========================================
-- 3. RLS — Affirmations
-- ========================================
alter table public.affirmations enable row level security;
create policy "affirmations_select" on public.affirmations for select using (auth.uid() = user_id);
create policy "affirmations_insert" on public.affirmations for insert with check (auth.uid() = user_id);
create policy "affirmations_update" on public.affirmations for update using (auth.uid() = user_id);
create policy "affirmations_delete" on public.affirmations for delete using (auth.uid() = user_id);

-- ========================================
-- 4. RLS — Checkins
-- ========================================
alter table public.checkins enable row level security;
create policy "checkins_select" on public.checkins for select using (auth.uid() = user_id);
create policy "checkins_insert" on public.checkins for insert with check (auth.uid() = user_id);
create policy "checkins_update" on public.checkins for update using (auth.uid() = user_id);
create policy "checkins_delete" on public.checkins for delete using (auth.uid() = user_id);
