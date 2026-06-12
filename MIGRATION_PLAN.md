# Take Time — Plano de Migracao: JSON Blob → Tabelas Relacionais

## Problema Atual

Tudo esta num unico JSON blob por usuario (`user_data.state`).
Isso impede: queries eficientes, sync granular, analytics, e escalar para muitos usuarios.

---

## 1. Novo Schema SQL (Supabase)

```sql
-- ========================================
-- PROFILES (dados do usuario)
-- ========================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  timezone text default 'America/Sao_Paulo',
  language text default 'pt-BR',
  theme text default 'auto',
  notifications boolean default false,
  reminder_min integer default 10,
  show_marquee boolean default true,
  marquee_texts text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ========================================
-- SUBJECTS (atividades)
-- ========================================
create table public.subjects (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null default 'study',        -- study | training | inactive
  color text default '#007AFF',
  icon text,
  slots integer default 0,
  sort_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ========================================
-- SUBJECT_ITEMS (syllabus, exercises, routines)
-- ========================================
create table public.subject_items (
  id text primary key default gen_random_uuid()::text,
  subject_id text not null references public.subjects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sets integer,
  reps text,
  weight text,
  done boolean default false,
  sort_order integer default 0,
  created_at timestamptz default now()
);

-- ========================================
-- BLOCKS (blocos de tempo na agenda)
-- ========================================
create table public.blocks (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id text references public.subjects(id) on delete set null,
  date date not null,
  start_time time not null,
  end_time time not null,
  topic text,
  done boolean default false,
  repeat_daily boolean default false,
  completed_items text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ========================================
-- PRIORITIES (circulo de prioridades)
-- ========================================
create table public.priorities (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  zone text not null,                         -- zone1 | zone2 | zone3 | unallocated
  name text not null,
  sort_order integer default 0
);

-- ========================================
-- LOGS (historico de acoes)
-- ========================================
create table public.logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  detail text,
  created_at timestamptz default now()
);

-- ========================================
-- INDICES
-- ========================================
create index idx_subjects_user on public.subjects(user_id);
create index idx_blocks_user_date on public.blocks(user_id, date);
create index idx_blocks_subject on public.blocks(subject_id);
create index idx_subject_items_subject on public.subject_items(subject_id);
create index idx_priorities_user on public.priorities(user_id);
create index idx_logs_user on public.logs(user_id);

-- ========================================
-- RLS (cada usuario so ve seus dados)
-- ========================================
alter table public.profiles enable row level security;
alter table public.subjects enable row level security;
alter table public.subject_items enable row level security;
alter table public.blocks enable row level security;
alter table public.priorities enable row level security;
alter table public.logs enable row level security;

-- Profiles
create policy "Own profile" on public.profiles
  for all using (auth.uid() = id);

-- Subjects
create policy "Own subjects" on public.subjects
  for all using (auth.uid() = user_id);

-- Subject Items
create policy "Own items" on public.subject_items
  for all using (auth.uid() = user_id);

-- Blocks
create policy "Own blocks" on public.blocks
  for all using (auth.uid() = user_id);

-- Priorities
create policy "Own priorities" on public.priorities
  for all using (auth.uid() = user_id);

-- Logs
create policy "Own logs" on public.logs
  for all using (auth.uid() = user_id);

-- ========================================
-- TRIGGER: auto-create profile on signup
-- ========================================
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

-- ========================================
-- TRIGGER: auto-update updated_at
-- ========================================
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
```

---

## 2. Mudancas por Arquivo

### store.js — Reescrever para API relacional

**Antes:** `save(data)` → salva JSON blob inteiro
**Depois:** Cada entidade tem seus proprios metodos

```
Store.subjects.list()        → GET /rest/v1/subjects?user_id=eq.{uid}
Store.subjects.create(data)  → POST /rest/v1/subjects
Store.subjects.update(id, d) → PATCH /rest/v1/subjects?id=eq.{id}
Store.subjects.delete(id)    → DELETE /rest/v1/subjects?id=eq.{id}

Store.blocks.list(date)      → GET /rest/v1/blocks?user_id=eq.{uid}&date=eq.{date}
Store.blocks.create(data)    → POST /rest/v1/blocks
Store.blocks.update(id, d)   → PATCH /rest/v1/blocks?id=eq.{id}
Store.blocks.delete(id)      → DELETE /rest/v1/blocks?id=eq.{id}

Store.profile.get()          → GET /rest/v1/profiles?id=eq.{uid}
Store.profile.update(data)   → PATCH /rest/v1/profiles?id=eq.{uid}

// Mesma logica para priorities, logs, subject_items
```

**Offline-first mantido:** localStorage como cache, sync por tabela.

### auth.js — Adicionar profile

- Apos signup: trigger cria profile automaticamente
- Apos login: carregar profile do Supabase
- `Supabase.loadUserData()` → `Supabase.loadProfile()`
- `Supabase.saveUserData()` → removido (cada operacao faz seu proprio save)

### app.js — Substituir mutacoes diretas

**Antes:**
```js
state.subjects.push(newSubj);
Store.save(state);
```

**Depois:**
```js
const subj = await Store.subjects.create(newSubj);
state.subjects.push(subj);  // atualiza cache local
```

**Cada funcao que muta state precisa ser atualizada:**
- saveSubject() → Store.subjects.create/update
- saveBlock() → Store.blocks.create/update
- delete subject → Store.subjects.delete
- delete block → Store.blocks.delete
- toggle done → Store.blocks.update(id, { done: true })
- logAction() → Store.logs.create
- settings changes → Store.profile.update
- priority changes → Store.priorities.create/update/delete

### mcp-server/src/index.js — Queries diretas

**Antes:** Le blob inteiro, muta, salva blob inteiro
**Depois:** Cada tool faz query/mutacao especifica

```js
// Antes
async function getState() {
  return await db.loadState(); // blob inteiro
}

// Depois
tools.list_blocks = async ({ date }) => {
  return await db.query('blocks', { date, user_id: uid });
};

tools.create_block = async (data) => {
  return await db.insert('blocks', { ...data, user_id: uid });
};
```

---

## 3. Estrategia de Migracao de Dados

### Fase 1 — Schema novo (sem quebrar nada)
1. Criar todas as tabelas novas no Supabase
2. Manter tabela `user_data` existente
3. Criar funcao SQL de migracao que extrai do JSON blob:

```sql
-- Migrar dados de user_data.state para tabelas relacionais
create or replace function public.migrate_user_blob(target_uid uuid)
returns void as $$
declare
  blob jsonb;
  subj jsonb;
  blk jsonb;
  item jsonb;
  prio jsonb;
  lg jsonb;
  zone_name text;
  i integer;
begin
  select state into blob from public.user_data where id = target_uid;
  if blob is null then return; end if;

  -- Migrate subjects
  for subj in select * from jsonb_array_elements(blob->'subjects')
  loop
    insert into public.subjects (id, user_id, name, type, color, icon, slots)
    values (
      subj->>'id', target_uid, subj->>'name',
      coalesce(subj->>'type', 'study'),
      coalesce(subj->>'color', '#007AFF'),
      subj->>'icon',
      coalesce((subj->>'slots')::int, 0)
    ) on conflict (id) do nothing;

    -- Migrate subject items (syllabus/exercises/routines)
    i := 0;
    for item in select * from jsonb_array_elements(
      coalesce(subj->'syllabus', subj->'exercises', subj->'routines', '[]'::jsonb)
    )
    loop
      insert into public.subject_items (id, subject_id, user_id, name, sets, reps, weight, done, sort_order)
      values (
        coalesce(item->>'id', gen_random_uuid()::text),
        subj->>'id', target_uid, item->>'name',
        (item->>'sets')::int, item->>'reps', item->>'weight',
        coalesce((item->>'done')::boolean, false), i
      ) on conflict (id) do nothing;
      i := i + 1;
    end loop;
  end loop;

  -- Migrate blocks
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
      coalesce(array(select jsonb_array_elements_text(blk->'completedItems')), '{}')
    ) on conflict (id) do nothing;
  end loop;

  -- Migrate priorities
  for zone_name in select unnest(array['zone1','zone2','zone3','unallocated'])
  loop
    i := 0;
    for prio in select * from jsonb_array_elements(coalesce(blob->'priorities'->zone_name, '[]'::jsonb))
    loop
      insert into public.priorities (user_id, zone, name, sort_order)
      values (target_uid, zone_name, prio->>'name', i);
      i := i + 1;
    end loop;
  end loop;

  -- Migrate settings to profile
  update public.profiles set
    timezone = coalesce(blob->'settings'->>'timezone', 'America/Sao_Paulo'),
    language = coalesce(blob->'settings'->>'language', 'pt-BR'),
    theme = coalesce(blob->'settings'->>'theme', 'auto'),
    notifications = coalesce((blob->'settings'->>'notifications')::boolean, false),
    reminder_min = coalesce((blob->'settings'->>'reminderMin')::int, 10),
    show_marquee = coalesce((blob->'settings'->>'showMarquee')::boolean, true)
  where id = target_uid;
end;
$$ language plpgsql security definer;

-- Rodar para todos os usuarios existentes:
-- select migrate_user_blob(id) from public.user_data;
```

### Fase 2 — Frontend dual (le das tabelas novas, fallback pro blob)
1. Atualizar store.js com API relacional
2. Se tabela vazia, migra do blob automaticamente
3. Testar com conta de teste

### Fase 3 — MCP Server atualizado
1. Cada tool faz query direta na tabela correta
2. Sem mais blob read/write

### Fase 4 — Cleanup
1. Remover tabela user_data
2. Remover logica de blob do store.js
3. Remover fallback

---

## 4. Impacto no MCP por Usuario

Com tabelas relacionais, o MCP de cada usuario:
- Faz queries diretas (rapido, sem carregar tudo)
- Pode filtrar por data, subject, status sem parsear JSON
- Nao tem risco de race condition em blob (cada operacao e atomica)
- Escala para milhares de usuarios sem problemas

---

## 5. Ordem de Execucao

| # | Tarefa | Risco | Estimativa |
|---|--------|-------|------------|
| 1 | Criar tabelas + RLS + triggers no Supabase | Baixo | Schema SQL pronto acima |
| 2 | Funcao de migracao SQL | Baixo | SQL pronto acima |
| 3 | Reescrever store.js (API relacional + cache local) | Medio | Arquivo principal |
| 4 | Atualizar app.js (todas as mutacoes) | Alto | Maior arquivo, ~120 funcoes |
| 5 | Atualizar auth.js (profile) | Baixo | Pequeno |
| 6 | Atualizar MCP server | Medio | 22 tools |
| 7 | Migrar dados existentes | Baixo | Rodar funcao SQL |
| 8 | Testar tudo | Alto | E2E |
| 9 | Remover user_data | Baixo | Cleanup |

---

## 6. O que NAO muda

- PWA / Service Worker
- Design System (ds.css, ds.js)
- i18n
- Drag & Drop (Sortable.js)
- HTML structure (index.html)
- Deploy (Vercel + Mintlify)
