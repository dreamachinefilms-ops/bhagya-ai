create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  language text not null default 'en',
  default_service text not null default 'astrology',
  response_detail text not null default 'balanced',
  timezone text,
  use_chat_personalization boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.user_preferences add column if not exists language text not null default 'en';
alter table public.user_preferences add column if not exists default_service text not null default 'astrology';
alter table public.user_preferences add column if not exists response_detail text not null default 'balanced';
alter table public.user_preferences add column if not exists timezone text;
alter table public.user_preferences add column if not exists use_chat_personalization boolean not null default true;
alter table public.user_preferences add column if not exists created_at timestamptz not null default now();
alter table public.user_preferences add column if not exists updated_at timestamptz not null default now();

create unique index if not exists user_preferences_user_id_unique
on public.user_preferences(user_id);

alter table public.user_preferences drop constraint if exists user_preferences_language_check;
alter table public.user_preferences add constraint user_preferences_language_check
check (language in ('en', 'hi'));
alter table public.user_preferences drop constraint if exists user_preferences_default_service_check;
alter table public.user_preferences add constraint user_preferences_default_service_check
check (default_service in ('astrology', 'numerology', 'tarot', 'palmistry'));
alter table public.user_preferences drop constraint if exists user_preferences_response_detail_check;
alter table public.user_preferences add constraint user_preferences_response_detail_check
check (response_detail in ('concise', 'balanced', 'detailed'));

alter table public.user_preferences enable row level security;

revoke all on public.user_preferences from anon;
grant select, insert, update on public.user_preferences to authenticated;

drop policy if exists "Users can read own preferences" on public.user_preferences;
create policy "Users can read own preferences" on public.user_preferences
for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can create own preferences" on public.user_preferences;
create policy "Users can create own preferences" on public.user_preferences
for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can update own preferences" on public.user_preferences;
create policy "Users can update own preferences" on public.user_preferences
for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can delete own preferences" on public.user_preferences;
create policy "Users can delete own preferences" on public.user_preferences
for delete to authenticated using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_preferences_updated_at on public.user_preferences;
create trigger set_user_preferences_updated_at
before update on public.user_preferences
for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';
