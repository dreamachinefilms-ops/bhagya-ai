create extension if not exists "pgcrypto";

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

alter table public.numerology_profiles enable row level security;

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

drop trigger if exists set_numerology_profiles_updated_at on public.numerology_profiles;
create trigger set_numerology_profiles_updated_at
before update on public.numerology_profiles
for each row
execute function public.set_updated_at();
