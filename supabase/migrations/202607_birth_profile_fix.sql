alter table public.profiles
add column if not exists full_name text;

alter table public.profiles
add column if not exists first_name text;

alter table public.profiles
add column if not exists email text;

alter table public.profiles
add column if not exists updated_at timestamptz default now();

alter table public.user_birth_details
add column if not exists birth_time_known boolean not null default true;

alter table public.user_birth_details
add column if not exists timezone_id text;

alter table public.user_birth_details
add column if not exists updated_at timestamptz default now();

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
    if not exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and indexname = 'user_birth_details_user_id_unique'
    ) then
      execute 'create unique index user_birth_details_user_id_unique on public.user_birth_details(user_id)';
    end if;
  end if;
end
$$;

alter table public.profiles enable row level security;
alter table public.user_birth_details enable row level security;

drop policy if exists "Users can read own profile"
on public.profiles;

create policy "Users can read own profile"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "Users can insert own profile"
on public.profiles;

create policy "Users can insert own profile"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "Users can update own profile"
on public.profiles;

create policy "Users can update own profile"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Users can read own birth details"
on public.user_birth_details;

create policy "Users can read own birth details"
on public.user_birth_details
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own birth details"
on public.user_birth_details;

create policy "Users can insert own birth details"
on public.user_birth_details
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own birth details"
on public.user_birth_details;

create policy "Users can update own birth details"
on public.user_birth_details
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
