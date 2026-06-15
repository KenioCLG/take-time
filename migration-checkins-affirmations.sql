-- ============================================================
-- TAKE TIME — MIGRATION: Checkins & Affirmations (Aba Atomic)
-- Rodar no Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. AFFIRMATIONS (Afirmações de Identidade)
create table if not exists public.affirmations (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  version integer not null default 1,
  created_at timestamptz,
  retired_at timestamptz,
  updated_at timestamptz not null default now()
);

-- 2. CHECKINS (Registros Matinais/Noturnos)
create table if not exists public.checkins (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  morning_sleep numeric,
  morning_energy text,
  morning_mood text,
  morning_affirmation text,
  morning_focus text,
  morning_ts timestamptz,
  evening_confirmed text,
  evening_recharged text,
  evening_drained text,
  evening_next_action text,
  evening_next_time text,
  evening_ts timestamptz,
  habit_log jsonb not null default '[]'::jsonb,
  created_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- INDICES
-- ============================================================
create index if not exists idx_affirmations_user on public.affirmations(user_id);
create index if not exists idx_checkins_user on public.checkins(user_id);
create index if not exists idx_checkins_user_date on public.checkins(user_id, date);

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================

-- Affirmations
alter table public.affirmations enable row level security;
create policy "affirmations_select" on public.affirmations for select using (auth.uid() = user_id);
create policy "affirmations_insert" on public.affirmations for insert with check (auth.uid() = user_id);
create policy "affirmations_update" on public.affirmations for update using (auth.uid() = user_id);
create policy "affirmations_delete" on public.affirmations for delete using (auth.uid() = user_id);

-- Checkins
alter table public.checkins enable row level security;
create policy "checkins_select" on public.checkins for select using (auth.uid() = user_id);
create policy "checkins_insert" on public.checkins for insert with check (auth.uid() = user_id);
create policy "checkins_update" on public.checkins for update using (auth.uid() = user_id);
create policy "checkins_delete" on public.checkins for delete using (auth.uid() = user_id);

-- ============================================================
-- TRIGGERS (Auto-update updated_at)
-- ============================================================
create trigger trg_affirmations_updated before update on public.affirmations
  for each row execute function public.set_updated_at();

create trigger trg_checkins_updated before update on public.checkins
  for each row execute function public.set_updated_at();
