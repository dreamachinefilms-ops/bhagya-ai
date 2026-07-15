create table if not exists public.tarot_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chat_id uuid not null references public.chats(id) on delete cascade,
  question text not null,
  spread_type text not null check (spread_type in ('one-card', 'three-card')),
  spread_name text not null,
  language text not null default 'English',
  language_code text not null default 'english',
  spread_positions jsonb not null,
  shuffled_card_ids jsonb not null,
  selected_indexes jsonb,
  status text not null default 'selecting' check (status in ('selecting', 'revealed', 'expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tarot_readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chat_id uuid not null references public.chats(id) on delete cascade,
  question text not null,
  spread_type text not null check (spread_type in ('one-card', 'three-card')),
  spread_name text not null,
  language_code text not null default 'english',
  cards jsonb not null,
  interpretation text,
  status text not null default 'complete' check (status in ('complete', 'interpretation_failed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.tarot_sessions
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists chat_id uuid references public.chats(id) on delete cascade,
  add column if not exists question text,
  add column if not exists spread_type text,
  add column if not exists spread_name text,
  add column if not exists language text not null default 'English',
  add column if not exists language_code text not null default 'english',
  add column if not exists spread_positions jsonb not null default '[]'::jsonb,
  add column if not exists shuffled_card_ids jsonb not null default '[]'::jsonb,
  add column if not exists selected_indexes jsonb,
  add column if not exists status text not null default 'selecting',
  add column if not exists expires_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.tarot_sessions
  alter column question set not null,
  alter column spread_type set not null,
  alter column spread_name set not null,
  alter column expires_at set not null;

alter table public.tarot_sessions
  drop constraint if exists tarot_sessions_spread_type_check,
  add constraint tarot_sessions_spread_type_check
    check (spread_type in ('one-card', 'three-card'));

alter table public.tarot_sessions
  drop constraint if exists tarot_sessions_status_check,
  add constraint tarot_sessions_status_check
    check (status in ('selecting', 'revealed', 'expired'));

alter table public.tarot_readings
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists chat_id uuid references public.chats(id) on delete cascade,
  add column if not exists question text,
  add column if not exists spread_type text,
  add column if not exists spread_name text,
  add column if not exists language_code text not null default 'english',
  add column if not exists cards jsonb not null default '[]'::jsonb,
  add column if not exists interpretation text,
  add column if not exists status text not null default 'complete',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.tarot_readings
  alter column question set not null,
  alter column spread_type set not null,
  alter column spread_name set not null,
  alter column cards set not null;

alter table public.tarot_readings
  drop constraint if exists tarot_readings_spread_type_check,
  add constraint tarot_readings_spread_type_check
    check (spread_type in ('one-card', 'three-card'));

alter table public.tarot_readings
  drop constraint if exists tarot_readings_status_check,
  add constraint tarot_readings_status_check
    check (status in ('complete', 'interpretation_failed'));

alter table public.tarot_sessions enable row level security;
alter table public.tarot_readings enable row level security;

drop policy if exists "Users can select own tarot sessions" on public.tarot_sessions;
create policy "Users can select own tarot sessions"
on public.tarot_sessions for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own tarot sessions" on public.tarot_sessions;
create policy "Users can insert own tarot sessions"
on public.tarot_sessions for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.chats
    where chats.id = tarot_sessions.chat_id
      and chats.user_id = auth.uid()
  )
);

drop policy if exists "Users can update own tarot sessions" on public.tarot_sessions;
create policy "Users can update own tarot sessions"
on public.tarot_sessions for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own tarot sessions" on public.tarot_sessions;
create policy "Users can delete own tarot sessions"
on public.tarot_sessions for delete
using (auth.uid() = user_id);

drop policy if exists "Users can select own tarot readings" on public.tarot_readings;
create policy "Users can select own tarot readings"
on public.tarot_readings for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own tarot readings" on public.tarot_readings;
create policy "Users can insert own tarot readings"
on public.tarot_readings for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.chats
    where chats.id = tarot_readings.chat_id
      and chats.user_id = auth.uid()
  )
);

drop policy if exists "Users can update own tarot readings" on public.tarot_readings;
create policy "Users can update own tarot readings"
on public.tarot_readings for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own tarot readings" on public.tarot_readings;
create policy "Users can delete own tarot readings"
on public.tarot_readings for delete
using (auth.uid() = user_id);

create index if not exists tarot_sessions_user_chat_created_idx
on public.tarot_sessions (user_id, chat_id, created_at desc);

create index if not exists tarot_sessions_expires_at_idx
on public.tarot_sessions (expires_at);

create index if not exists tarot_readings_user_chat_created_idx
on public.tarot_readings (user_id, chat_id, created_at desc);

drop trigger if exists set_tarot_sessions_updated_at on public.tarot_sessions;
create trigger set_tarot_sessions_updated_at
before update on public.tarot_sessions
for each row
execute function public.set_updated_at();

drop trigger if exists set_tarot_readings_updated_at on public.tarot_readings;
create trigger set_tarot_readings_updated_at
before update on public.tarot_readings
for each row
execute function public.set_updated_at();
