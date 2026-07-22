create table if not exists public.daily_horoscopes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  horoscope_date date not null,
  timezone text not null,
  language text not null check (language in ('en', 'hi')),
  result jsonb not null,
  source_mode text not null check (source_mode in ('prokerala', 'calculated-astrology', 'birth-profile-guidance')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, horoscope_date, language)
);

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  name text not null check (char_length(name) between 1 and 100),
  email text not null check (char_length(email) between 3 and 254),
  subject text not null check (char_length(subject) between 1 and 160),
  message text not null check (char_length(message) between 10 and 5000),
  status text not null default 'new' check (status in ('new', 'in_progress', 'resolved', 'spam')),
  created_at timestamptz not null default now()
);

alter table public.daily_horoscopes enable row level security;
alter table public.contact_messages enable row level security;

drop policy if exists "Users can read own daily horoscopes" on public.daily_horoscopes;
create policy "Users can read own daily horoscopes" on public.daily_horoscopes for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can create own daily horoscopes" on public.daily_horoscopes;
create policy "Users can create own daily horoscopes" on public.daily_horoscopes for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can update own daily horoscopes" on public.daily_horoscopes;
create policy "Users can update own daily horoscopes" on public.daily_horoscopes for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "People can submit contact messages" on public.contact_messages;
create policy "People can submit contact messages" on public.contact_messages for insert to anon, authenticated with check ((auth.uid() is null and user_id is null) or auth.uid() = user_id);
-- Deliberately no public SELECT, UPDATE or DELETE policy for contact messages.

create index if not exists daily_horoscopes_user_date_idx on public.daily_horoscopes (user_id, horoscope_date desc);
create index if not exists contact_messages_created_at_idx on public.contact_messages (created_at desc);
