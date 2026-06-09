-- Take Time — Supabase Schema
-- Run this in the SQL Editor on the Supabase Dashboard

-- Store all user app data as a JSON blob per user
-- This is the simplest sync approach: offline-first with full state merge
create table if not exists public.user_data (
  id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.user_data enable row level security;

-- Users can only access their own data
create policy "Users read own data" on public.user_data
  for select using (auth.uid() = id);

create policy "Users insert own data" on public.user_data
  for insert with check (auth.uid() = id);

create policy "Users update own data" on public.user_data
  for update using (auth.uid() = id);

-- Auto-update timestamp
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger on_user_data_update
  before update on public.user_data
  for each row execute function public.handle_updated_at();
