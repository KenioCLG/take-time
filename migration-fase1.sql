-- ============================================================
-- TAKE TIME — FASE 1: Tabelas Relacionais
-- Rodar no Supabase Dashboard → SQL Editor
-- ============================================================

-- ========================================
-- 1. PROFILES (dados do usuario + settings)
-- ========================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  timezone text not null default 'America/Sao_Paulo',
  language text not null default 'pt-BR',
  theme text not null default 'auto',
  notifications boolean not null default false,
  reminder_min integer not null default 10,
  show_marquee boolean not null default true,
  marquee_texts text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ========================================
-- 2. SUBJECTS (atividades)
-- ========================================
create table if not exists public.subjects (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null default 'study',
  color text not null default '#007AFF',
  icon text,
  slots integer not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ========================================
-- 3. SUBJECT_ITEMS (syllabus / exercises / routines)
-- ========================================
create table if not exists public.subject_items (
  id text primary key default gen_random_uuid()::text,
  subject_id text not null references public.subjects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sets integer,
  reps text,
  weight text,
  done boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ========================================
-- 4. BLOCKS (blocos de tempo na agenda)
-- ========================================
create table if not exists public.blocks (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id text references public.subjects(id) on delete set null,
  date date not null,
  start_time time not null,
  end_time time not null,
  topic text,
  done boolean not null default false,
  repeat_daily boolean not null default false,
  completed_items text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ========================================
-- 5. PRIORITIES (circulo de prioridades)
-- ========================================
create table if not exists public.priorities (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  zone text not null,
  name text not null,
  sort_order integer not null default 0
);

-- ========================================
-- 6. LOGS (historico de acoes)
-- ========================================
create table if not exists public.logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- INDICES
-- ============================================================
create index if not exists idx_subjects_user on public.subjects(user_id);
create index if not exists idx_subjects_user_type on public.subjects(user_id, type);
create index if not exists idx_blocks_user_date on public.blocks(user_id, date);
create index if not exists idx_blocks_subject on public.blocks(subject_id);
create index if not exists idx_subject_items_subject on public.subject_items(subject_id);
create index if not exists idx_subject_items_user on public.subject_items(user_id);
create index if not exists idx_priorities_user on public.priorities(user_id);
create index if not exists idx_priorities_user_zone on public.priorities(user_id, zone);
create index if not exists idx_logs_user on public.logs(user_id);
create index if not exists idx_logs_user_created on public.logs(user_id, created_at desc);

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================

-- Profiles
alter table public.profiles enable row level security;
create policy "profiles_select" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update" on public.profiles for update using (auth.uid() = id);

-- Subjects
alter table public.subjects enable row level security;
create policy "subjects_select" on public.subjects for select using (auth.uid() = user_id);
create policy "subjects_insert" on public.subjects for insert with check (auth.uid() = user_id);
create policy "subjects_update" on public.subjects for update using (auth.uid() = user_id);
create policy "subjects_delete" on public.subjects for delete using (auth.uid() = user_id);

-- Subject Items
alter table public.subject_items enable row level security;
create policy "items_select" on public.subject_items for select using (auth.uid() = user_id);
create policy "items_insert" on public.subject_items for insert with check (auth.uid() = user_id);
create policy "items_update" on public.subject_items for update using (auth.uid() = user_id);
create policy "items_delete" on public.subject_items for delete using (auth.uid() = user_id);

-- Blocks
alter table public.blocks enable row level security;
create policy "blocks_select" on public.blocks for select using (auth.uid() = user_id);
create policy "blocks_insert" on public.blocks for insert with check (auth.uid() = user_id);
create policy "blocks_update" on public.blocks for update using (auth.uid() = user_id);
create policy "blocks_delete" on public.blocks for delete using (auth.uid() = user_id);

-- Priorities
alter table public.priorities enable row level security;
create policy "priorities_select" on public.priorities for select using (auth.uid() = user_id);
create policy "priorities_insert" on public.priorities for insert with check (auth.uid() = user_id);
create policy "priorities_update" on public.priorities for update using (auth.uid() = user_id);
create policy "priorities_delete" on public.priorities for delete using (auth.uid() = user_id);

-- Logs
alter table public.logs enable row level security;
create policy "logs_select" on public.logs for select using (auth.uid() = user_id);
create policy "logs_insert" on public.logs for insert with check (auth.uid() = user_id);
create policy "logs_delete" on public.logs for delete using (auth.uid() = user_id);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger trg_subjects_updated before update on public.subjects
  for each row execute function public.set_updated_at();
create trigger trg_blocks_updated before update on public.blocks
  for each row execute function public.set_updated_at();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- MIGRACAO: Extrair dados do JSON blob para tabelas novas
-- Rodar DEPOIS de criar as tabelas
-- ============================================================
create or replace function public.migrate_user_blob(target_uid uuid)
returns void as $$
declare
  blob jsonb;
  subj jsonb;
  blk jsonb;
  item jsonb;
  items_key text;
  zone_name text;
  prio jsonb;
  lg jsonb;
  i integer;
begin
  select state into blob from public.user_data where id = target_uid;
  if blob is null then return; end if;

  -- Subjects + Subject Items
  for subj in select * from jsonb_array_elements(coalesce(blob->'subjects', '[]'::jsonb))
  loop
    insert into public.subjects (id, user_id, name, type, color, icon, slots)
    values (
      subj->>'id', target_uid, subj->>'name',
      coalesce(subj->>'type', 'study'),
      coalesce(subj->>'color', '#007AFF'),
      subj->>'icon',
      coalesce((subj->>'slots')::int, 0)
    ) on conflict (id) do nothing;

    -- Detect which key has items: syllabus, exercises, or routines
    items_key := case
      when subj ? 'syllabus' then 'syllabus'
      when subj ? 'exercises' then 'exercises'
      when subj ? 'routines' then 'routines'
      else null
    end;

    if items_key is not null then
      i := 0;
      for item in select * from jsonb_array_elements(coalesce(subj->items_key, '[]'::jsonb))
      loop
        insert into public.subject_items (id, subject_id, user_id, name, sets, reps, weight, done, sort_order)
        values (
          coalesce(item->>'id', gen_random_uuid()::text),
          subj->>'id', target_uid,
          coalesce(item->>'name', 'Item ' || i),
          (item->>'sets')::int,
          item->>'reps',
          item->>'weight',
          coalesce((item->>'done')::boolean, false),
          i
        ) on conflict (id) do nothing;
        i := i + 1;
      end loop;
    end if;
  end loop;

  -- Blocks
  for blk in select * from jsonb_array_elements(coalesce(blob->'blocks', '[]'::jsonb))
  loop
    insert into public.blocks (id, user_id, subject_id, date, start_time, end_time, topic, done, repeat_daily, completed_items)
    values (
      blk->>'id', target_uid, blk->>'subjectId',
      (blk->>'date')::date,
      (blk->>'start')::time,
      (blk->>'end')::time,
      blk->>'topic',
      coalesce((blk->>'done')::boolean, false),
      coalesce((blk->>'repeatDaily')::boolean, false),
      coalesce(array(select jsonb_array_elements_text(coalesce(blk->'completedItems', '[]'::jsonb))), '{}')
    ) on conflict (id) do nothing;
  end loop;

  -- Priorities
  for zone_name in select unnest(array['zone1','zone2','zone3','unallocated'])
  loop
    i := 0;
    for prio in select * from jsonb_array_elements(coalesce(blob->'priorities'->zone_name, '[]'::jsonb))
    loop
      insert into public.priorities (user_id, zone, name, sort_order)
      values (target_uid, zone_name, coalesce(prio->>'name', prio#>>'{}'), i);
      i := i + 1;
    end loop;
  end loop;

  -- Settings → Profile
  update public.profiles set
    timezone = coalesce(blob->'settings'->>'timezone', 'America/Sao_Paulo'),
    language = coalesce(blob->'settings'->>'language', 'pt-BR'),
    theme = coalesce(blob->'settings'->>'theme', 'auto'),
    notifications = coalesce((blob->'settings'->>'notifications')::boolean, false),
    reminder_min = coalesce((blob->'settings'->>'reminderMin')::int, 10),
    show_marquee = coalesce((blob->'settings'->>'showMarquee')::boolean, true)
  where id = target_uid;

  -- Logs
  for lg in select * from jsonb_array_elements(coalesce(blob->'logs', '[]'::jsonb))
  loop
    insert into public.logs (user_id, action, detail, created_at)
    values (
      target_uid,
      coalesce(lg->>'action', lg->>'type', 'unknown'),
      lg->>'detail',
      coalesce((lg->>'timestamp')::timestamptz, (lg->>'created_at')::timestamptz, now())
    );
  end loop;
end;
$$ language plpgsql security definer;

-- ============================================================
-- RODAR MIGRACAO PARA TODOS OS USUARIOS EXISTENTES
-- (executar esta linha separadamente depois de confirmar que as tabelas foram criadas)
-- ============================================================
-- select migrate_user_blob(id) from public.user_data;
