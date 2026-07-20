create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  first_name text,
  email text,
  preferred_language text default 'english',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.user_birth_details (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text,
  date_of_birth text,
  birth_time text,
  birth_time_known boolean not null default true,
  birth_place text,
  latitude numeric,
  longitude numeric,
  timezone_offset text,
  timezone_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.user_birth_details
add column if not exists full_name text;

with ranked_birth_details as (
  select
    id,
    row_number() over (
      partition by user_id
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as row_number
  from public.user_birth_details
)
delete from public.user_birth_details
using ranked_birth_details
where public.user_birth_details.id = ranked_birth_details.id
  and ranked_birth_details.row_number > 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_birth_details_user_id_unique'
  ) then
    alter table public.user_birth_details
    add constraint user_birth_details_user_id_unique unique (user_id);
  end if;
end
$$;

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  service text not null check (service in ('astrology', 'numerology', 'tarot', 'palmistry')),
  language_code text default 'english',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  service text check (service in ('astrology', 'numerology', 'tarot', 'palmistry')),
  language_code text default 'english',
  created_at timestamptz default now()
);

create table if not exists public.numerology_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  source_full_name text not null,
  source_date_of_birth text not null,
  calculation_system text not null,
  calculation_version text not null,
  core_numbers jsonb not null,
  name_breakdown jsonb not null,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  language text not null default 'en' check (language in ('en', 'hi')),
  default_service text not null default 'astrology' check (default_service in ('astrology', 'numerology', 'tarot', 'palmistry')),
  response_detail text not null default 'balanced' check (response_detail in ('concise', 'balanced', 'detailed')),
  timezone text,
  use_chat_personalization boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

update public.chats set title = 'Reading' where title is null;

alter table public.chats
alter column title set not null;

alter table public.chats
drop constraint if exists chats_service_check;

alter table public.chats
add constraint chats_service_check
check (service in ('astrology', 'numerology', 'tarot', 'palmistry'));

alter table public.messages
alter column language_code set default 'english';

alter table public.messages
drop constraint if exists messages_service_check;

alter table public.messages
add constraint messages_service_check
check (service in ('astrology', 'numerology', 'tarot', 'palmistry'));

alter table public.profiles enable row level security;
alter table public.user_birth_details enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;
alter table public.numerology_profiles enable row level security;
alter table public.user_preferences enable row level security;

drop policy if exists "Users can select own profile" on public.profiles;

drop policy if exists "Users can read own preferences" on public.user_preferences;
create policy "Users can read own preferences" on public.user_preferences for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can create own preferences" on public.user_preferences;
create policy "Users can create own preferences" on public.user_preferences for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can update own preferences" on public.user_preferences;
create policy "Users can update own preferences" on public.user_preferences for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can delete own preferences" on public.user_preferences;
create policy "Users can delete own preferences" on public.user_preferences for delete to authenticated using (auth.uid() = user_id);
create policy "Users can select own profile"
on public.profiles for select
using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
on public.profiles for insert
with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Users can delete own profile" on public.profiles;
create policy "Users can delete own profile"
on public.profiles for delete
using (auth.uid() = id);

drop policy if exists "Users can select own birth details" on public.user_birth_details;
drop policy if exists "Users can read own birth details" on public.user_birth_details;
create policy "Users can read own birth details"
on public.user_birth_details for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own birth details" on public.user_birth_details;
drop policy if exists "Users can create own birth details once" on public.user_birth_details;
create policy "Users can create own birth details once"
on public.user_birth_details for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own birth details" on public.user_birth_details;
drop policy if exists "Users can delete own birth details" on public.user_birth_details;

drop policy if exists "Users can select own numerology profile" on public.numerology_profiles;
create policy "Users can select own numerology profile"
on public.numerology_profiles for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own numerology profile" on public.numerology_profiles;
create policy "Users can insert own numerology profile"
on public.numerology_profiles for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own numerology profile" on public.numerology_profiles;
create policy "Users can update own numerology profile"
on public.numerology_profiles for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own numerology profile" on public.numerology_profiles;
create policy "Users can delete own numerology profile"
on public.numerology_profiles for delete
using (auth.uid() = user_id);

drop policy if exists "Users can select own chats" on public.chats;
create policy "Users can select own chats"
on public.chats for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own chats" on public.chats;
create policy "Users can insert own chats"
on public.chats for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own chats" on public.chats;
create policy "Users can update own chats"
on public.chats for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own chats" on public.chats;
create policy "Users can delete own chats"
on public.chats for delete
using (auth.uid() = user_id);

drop policy if exists "Users can select own messages" on public.messages;
create policy "Users can select own messages"
on public.messages for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own messages" on public.messages;
create policy "Users can insert own messages"
on public.messages for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.chats
    where chats.id = messages.chat_id
      and chats.user_id = auth.uid()
  )
);

drop policy if exists "Users can update own messages" on public.messages;
create policy "Users can update own messages"
on public.messages for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own messages" on public.messages;
create policy "Users can delete own messages"
on public.messages for delete
using (auth.uid() = user_id);

create index if not exists chats_user_id_updated_at_idx
on public.chats (user_id, updated_at desc);

create index if not exists messages_chat_id_created_at_idx
on public.messages (chat_id, created_at asc);

create index if not exists user_birth_details_user_id_idx
on public.user_birth_details (user_id);

create index if not exists numerology_profiles_user_id_idx
on public.numerology_profiles (user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_chats_updated_at on public.chats;
create trigger set_chats_updated_at
before update on public.chats
for each row
execute function public.set_updated_at();

drop trigger if exists set_user_birth_details_updated_at on public.user_birth_details;
create trigger set_user_birth_details_updated_at
before update on public.user_birth_details
for each row
execute function public.set_updated_at();

drop trigger if exists set_numerology_profiles_updated_at on public.numerology_profiles;
create trigger set_numerology_profiles_updated_at
before update on public.numerology_profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_user_preferences_updated_at on public.user_preferences;
create trigger set_user_preferences_updated_at
before update on public.user_preferences
for each row execute function public.set_updated_at();
