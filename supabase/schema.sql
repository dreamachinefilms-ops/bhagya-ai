create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  preferred_language text default 'english',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.user_birth_details (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date_of_birth text,
  birth_time text,
  birth_place text,
  latitude numeric,
  longitude numeric,
  timezone_offset text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

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

drop policy if exists "Users can select own profile" on public.profiles;
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
create policy "Users can select own birth details"
on public.user_birth_details for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own birth details" on public.user_birth_details;
create policy "Users can insert own birth details"
on public.user_birth_details for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own birth details" on public.user_birth_details;
create policy "Users can update own birth details"
on public.user_birth_details for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own birth details" on public.user_birth_details;
create policy "Users can delete own birth details"
on public.user_birth_details for delete
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
